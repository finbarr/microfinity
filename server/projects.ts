import {z} from 'zod';
import {Store, id, hash, type Version, type Manifest} from './store';
import {GenerationService, type GenerationInput, type GenerationResult, type MediaState} from './generation';
import {SandboxLeases} from './sandbox-leases';
import {creationPromptSchema} from '../sdk/creation';

const requestId = z.string().regex(/^[a-zA-Z0-9_-]{12,80}$/);
const revisionId = z.string().regex(/^[a-f0-9]{24}$/);
const feedbackSchema = z.object({
  revisionId, seed: z.number().int().min(0).max(100000),
  players: z.number().int().min(1).max(4),
  steps: z.array(z.object({
    frames: z.number().int().min(1).max(60),
    actions: z.record(z.string().regex(/^p[0-3]$/), z.number().int().min(0).max(17)),
  }).strict()).max(1200),
}).strict();
export const projectCreateSchema = z.object({
  requestId, prompt: creationPromptSchema,
  remix: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  reuseMedia: z.boolean().default(true),
}).strict();
export const turnSchema = z.object({
  requestId, message: z.string().trim().min(1).max(600),
  regenerateArt: z.boolean().default(false),
  regenerateMusic: z.boolean().default(false),
  retryOf: revisionId.optional(),
  feedback: feedbackSchema.optional(),
}).strict();
export type Project = {
  id: string; owner_id: string; title: string; idea: string; game_id: string;
  selected_revision: string | null; published_revision: string | null;
  selection_epoch: number; attempts: number; media: MediaState; remix: string | null;
};
export type Turn = {
  id: string; project_id: string; owner_id: string; message: string;
  status: string; options: z.infer<typeof turnSchema>; base_revision: string | null;
  worker_id: string | null; generation: number; selection_epoch: number;
  attempts: number; progress: any; revision_id: string | null;
};
export type TurnPipeline = {run(input: GenerationInput): Promise<GenerationResult>};
type Query = (sql: string, params?: any[]) => Promise<any[]>;
const active = "status IN ('queued','working')";

/** Durable orchestration; no provider or container state is owned by an HTTP request. */
export class Projects {
  constructor(readonly store: Store) {}

  async owned(projectId: string, ownerId: string, query: Query = this.store.query.bind(this.store)): Promise<Project> {
    const [project] = await query('SELECT * FROM projects WHERE id=$1 AND owner_id=$2', [projectId, ownerId]);
    if (!project) throw Error('Project not found');
    return project;
  }

  async event(query: Query, projectId: string, kind: string, payload: unknown, turnId?: string) {
    await query('INSERT INTO project_events(project_id,turn_id,kind,payload) VALUES($1,$2,$3,$4)',
      [projectId, turnId ?? null, kind, JSON.stringify(payload)]);
  }

  async admission(query: Query, ownerId: string) {
    await query('SELECT id FROM builder_admission WHERE id=1 FOR UPDATE');
    const [global] = await query(`SELECT count(*)::int AS count FROM project_turns WHERE ${active}`);
    const [owner] = await query(`SELECT count(*)::int AS count FROM project_turns WHERE owner_id=$1 AND ${active}`, [ownerId]);
    const [daily] = await query("SELECT count(*)::int AS count FROM project_turns WHERE owner_id=$1 AND created_at>now()-interval '1 day'", [ownerId]);
    const [hourly] = await query("SELECT count(*)::int AS count FROM project_turns WHERE created_at>now()-interval '1 hour'");
    if (global.count >= 64 || owner.count >= 4) throw Error('The creation queue is full. Please wait for an edit to finish.');
    if (daily.count >= 40 || hourly.count >= 200) throw Error('The creation allowance is used up. Please try again later.');
  }

  async create(ownerId: string, raw: unknown) {
    const input = projectCreateSchema.parse(raw);
    const fingerprint = hash(JSON.stringify(input));
    const previous = input.remix ? await this.store.visibleVersion(input.remix, ownerId) : undefined;
    const projectId = await this.store.transaction(async query => {
      await query('SELECT id FROM builder_admission WHERE id=1 FOR UPDATE');
      const [existing] = await query('SELECT * FROM project_requests WHERE owner_id=$1 AND request_id=$2', [ownerId, input.requestId]);
      if (existing) {
        if (existing.request_hash !== fingerprint) throw Error('That request ID was already used for a different idea');
        return existing.project_id as string;
      }
      await this.admission(query, ownerId);
      const project = id(), turn = id();
      const media = previous && input.reuseMedia ? this.versionMedia(previous) : {};
      await query('INSERT INTO projects(id,owner_id,title,idea,game_id,media,remix) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [project, ownerId, previous?.manifest.meta.title ?? 'Your new game', input.prompt, `creation-${project}`, JSON.stringify(media), previous?.id ?? null]);
      await query('INSERT INTO project_requests(owner_id,request_id,request_hash,project_id) VALUES($1,$2,$3,$4)', [ownerId, input.requestId, fingerprint, project]);
      await query('INSERT INTO project_turns(id,project_id,owner_id,request_id,request_hash,message,options) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [turn, project, ownerId, input.requestId, fingerprint, input.prompt, '{}']);
      await this.event(query, project, 'message', {role: 'user', text: input.prompt}, turn);
      await this.event(query, project, 'queued', {}, turn);
      return project;
    });
    return this.get(projectId, ownerId);
  }

  async submit(projectId: string, ownerId: string, raw: unknown) {
    const input = turnSchema.parse(raw), fingerprint = hash(JSON.stringify(input));
    await this.store.transaction(async query => {
      await query('SELECT id FROM builder_admission WHERE id=1 FOR UPDATE');
      const project = await this.owned(projectId, ownerId, query);
      const [existing] = await query('SELECT request_hash FROM project_turns WHERE project_id=$1 AND request_id=$2', [projectId, input.requestId]);
      if (existing) {
        if (existing.request_hash !== fingerprint) throw Error('That request ID was already used for a different edit');
        return;
      }
      await this.admission(query, ownerId);
      const [count] = await query('SELECT count(*)::int AS count FROM project_turns WHERE project_id=$1', [projectId]);
      if (count.count >= 20 || project.attempts >= 24) throw Error('This project has reached its edit allowance');
      let options = input;
      if (input.retryOf) {
        const [retry] = await query("SELECT message,options FROM project_turns WHERE id=$1 AND project_id=$2 AND status IN ('failed','cancelled')", [input.retryOf, projectId]);
        if (!retry) throw Error('Only a stopped edit in this project can be retried');
        if (input.message !== retry.message) throw Error('A retry must keep the original edit request');
        options = {...input, regenerateArt: retry.options.regenerateArt === true,
          regenerateMusic: retry.options.regenerateMusic === true, feedback: retry.options.feedback};
      }
      if (input.feedback) {
        const [revision] = await query('SELECT id FROM project_revisions WHERE id=$1 AND project_id=$2', [input.feedback.revisionId, projectId]);
        if (!revision) throw Error('Replay revision not found');
      }
      const turn = id();
      await query('INSERT INTO project_turns(id,project_id,owner_id,request_id,request_hash,message,options) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [turn, projectId, ownerId, input.requestId, fingerprint, input.message, JSON.stringify(options)]);
      await this.event(query, projectId, 'message', {role: 'user', text: input.message}, turn);
      await this.event(query, projectId, 'queued', {}, turn);
      await query('UPDATE projects SET updated_at=now() WHERE id=$1', [projectId]);
    });
    return this.get(projectId, ownerId);
  }

  async get(projectId: string, ownerId: string) {
    const project = await this.owned(projectId, ownerId);
    const turns = await this.store.query('SELECT id,message,status,stage,error,revision_id,created_at,finished_at,progress FROM project_turns WHERE project_id=$1 ORDER BY created_at,id', [projectId]);
    const revisions = await this.store.query('SELECT r.id,r.version_id,r.parent_id,r.message,r.created_at,v.manifest FROM project_revisions r JOIN versions v ON v.id=r.version_id WHERE r.project_id=$1 ORDER BY r.created_at,r.id', [projectId]);
    const [position] = await this.store.query("SELECT count(*)::int AS count FROM project_turns WHERE status='queued' AND created_at<(SELECT min(created_at) FROM project_turns WHERE project_id=$1 AND status='queued')", [projectId]);
    const {owner_id, ...safe} = project;
    return {...safe, turns: turns.map(({progress, ...turn}) => ({...turn, progress: progress?.public ?? {}})), revisions, queueAhead: position.count};
  }

  async list(ownerId: string) {
    return this.store.query('SELECT id,title,selected_revision,published_revision,updated_at FROM projects WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 50', [ownerId]);
  }

  async events(projectId: string, ownerId: string, after: number) {
    await this.owned(projectId, ownerId);
    return this.store.query('SELECT id::text,kind,payload,turn_id,created_at FROM project_events WHERE project_id=$1 AND id>$2 ORDER BY project_events.id LIMIT 100', [projectId, after]);
  }

  async cancel(projectId: string, ownerId: string, turnId: string) {
    await this.store.transaction(async query => {
      await this.owned(projectId, ownerId, query);
      const rows = await query(`UPDATE project_turns SET status='cancelled',stage='cancelled',generation=generation+1,lease_until=NULL,finished_at=now() WHERE project_id=$1 AND id=$2 AND ${active} RETURNING id`, [projectId, turnId]);
      if (rows.length) await this.event(query, projectId, 'cancelled', {}, turnId);
    });
    return this.get(projectId, ownerId);
  }

  async select(projectId: string, ownerId: string, selected: string) {
    revisionId.parse(selected);
    await this.store.transaction(async query => {
      await this.owned(projectId, ownerId, query);
      const [revision] = await query('SELECT id FROM project_revisions WHERE project_id=$1 AND id=$2', [projectId, selected]);
      if (!revision) throw Error('Revision not found');
      await query('UPDATE projects SET selected_revision=$1,selection_epoch=selection_epoch+1,updated_at=now() WHERE id=$2', [selected, projectId]);
      await this.event(query, projectId, 'selected', {revisionId: selected});
    });
    return this.get(projectId, ownerId);
  }

  async publish(projectId: string, ownerId: string, selected: string) {
    revisionId.parse(selected);
    await this.store.transaction(async query => {
      const [project] = await query('SELECT * FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE', [projectId, ownerId]);
      if (!project) throw Error('Project not found');
      if (project.selected_revision !== selected) throw Error('The selected revision changed. Review it before publishing.');
      if (project.published_revision === selected) return;
      const [revision] = await query('SELECT r.*,v.manifest FROM project_revisions r JOIN versions v ON v.id=r.version_id WHERE r.id=$1 AND r.project_id=$2', [selected, projectId]);
      if (!revision || revision.validation?.policy !== 1) throw Error('This revision needs validation before publishing');
      await query("UPDATE versions SET visibility='public' WHERE id=$1", [revision.version_id]);
      await query('UPDATE games SET published_version=$1 WHERE id=$2', [revision.version_id, project.game_id]);
      for (const file of this.store.manifestFiles(revision.manifest)) await query('INSERT INTO stored_assets(file,public) VALUES($1,true) ON CONFLICT(file) DO UPDATE SET public=true', [file]);
      await query('UPDATE projects SET published_revision=$1,updated_at=now() WHERE id=$2', [selected, projectId]);
      await this.event(query, projectId, 'published', {revisionId: selected, versionId: revision.version_id});
    });
    return this.get(projectId, ownerId);
  }

  versionMedia(version: Version): MediaState {
    return {assets: version.manifest.assets, music: version.manifest.music, icon: version.manifest.icon};
  }
}

export class ProjectWorker {
  readonly workerId = id();
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private polling = false;
  private lastReap=0;
  private running = new Map<string, {controller: AbortController; done: Promise<void>}>();
  readonly concurrency: number;
  readonly leaseMs: number;
  readonly slots: number;
  constructor(readonly projects: Projects, private pipeline: TurnPipeline = new GenerationService(projects.store), options: {concurrency?: number; leaseMs?: number; slots?:number} = {}) {
    this.concurrency = Math.max(1, Math.min(16, options.concurrency ?? (Number(process.env.BUILDER_CONCURRENCY) || 2)));
    this.leaseMs = options.leaseMs ?? 30_000;
    this.slots=Math.max(1,Math.min(this.concurrency,options.slots??(Number(process.env.BUILDER_WORKER_SLOTS)||this.concurrency)));
  }
  get store() {return this.projects.store;}
  start() {void this.poll();}

  async claim(): Promise<Turn | undefined> {
    return this.store.transaction(async query => {
      await query('SELECT id FROM builder_admission WHERE id=1 FOR UPDATE');
      const expired = await query("UPDATE project_turns SET status=CASE WHEN attempts<2 THEN 'queued' ELSE 'failed' END,stage=CASE WHEN attempts<2 THEN 'queued' ELSE 'failed' END,error='Worker interrupted; saved progress retained',generation=generation+1,worker_id=NULL,lease_until=NULL WHERE status='working' AND lease_until<now() RETURNING *");
      for (const turn of expired) await this.projects.event(query, turn.project_id, turn.status, {reason: 'Worker interrupted; saved progress retained'}, turn.id);
      const exhausted=await query("UPDATE project_turns t SET status='failed',stage='failed',error='Project edit allowance exhausted',finished_at=now() FROM projects p WHERE t.project_id=p.id AND p.attempts>=24 AND t.status='queued' RETURNING t.id,t.project_id");
      for(const turn of exhausted)await this.projects.event(query,turn.project_id,'failed',{message:'Project edit allowance exhausted'},turn.id);
      const [count] = await query("SELECT count(*)::int AS count FROM project_turns WHERE status='working'");
      if (count.count >= this.concurrency) return;
      // The last completed attempt per owner provides round-robin fairness across creators.
      const [turn] = await query(`SELECT t.* FROM project_turns t JOIN projects p ON p.id=t.project_id
        WHERE t.status='queued' AND p.attempts<24
        AND NOT EXISTS(SELECT 1 FROM project_turns busy WHERE busy.owner_id=t.owner_id AND busy.status='working')
        AND NOT EXISTS(SELECT 1 FROM project_turns older WHERE older.project_id=t.project_id AND older.status='queued' AND (older.created_at,older.id)<(t.created_at,t.id))
        ORDER BY (SELECT max(finished_at) FROM project_turns recent WHERE recent.owner_id=t.owner_id) NULLS FIRST,t.created_at,t.id
        LIMIT 1 FOR UPDATE OF t SKIP LOCKED`);
      if (!turn) return;
      const [project] = await query('SELECT * FROM projects WHERE id=$1 FOR UPDATE', [turn.project_id]);
      const [claimed] = await query("UPDATE project_turns SET status='working',stage='starting',worker_id=$1,lease_until=now()+$2*interval '1 millisecond',generation=generation+1,attempts=attempts+1,base_revision=$3,selection_epoch=$4,error=NULL WHERE id=$5 RETURNING *",
        [this.workerId, this.leaseMs, project.selected_revision, project.selection_epoch, turn.id]);
      await query('UPDATE projects SET attempts=attempts+1 WHERE id=$1', [turn.project_id]);
      await this.projects.event(query, turn.project_id, 'working', {attempt: claimed.attempts}, turn.id);
      return claimed;
    });
  }

  async poll() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      if(Date.now()-this.lastReap>10000){this.lastReap=Date.now();await this.reap();}
      while (!this.stopped && this.running.size < this.slots) {
        const turn = await this.claim();
        if (!turn) break;
        const controller = new AbortController();
        const done = this.execute(turn, controller).catch(error => console.error('Builder worker:', error.message)).finally(() => this.running.delete(turn.id));
        this.running.set(turn.id, {controller, done});
      }
    } catch (error) {console.error('Builder queue:', (error as Error).message);}
    finally {
      this.polling = false;
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), 500);
    }
  }

  private async fenced<T>(turn: Turn, operation: (query: Query) => Promise<T>): Promise<T> {
    return this.store.transaction(async query => {
      const [current] = await query("SELECT id FROM project_turns WHERE id=$1 AND worker_id=$2 AND generation=$3 AND status='working' AND lease_until>now() FOR UPDATE", [turn.id, this.workerId, turn.generation]);
      if (!current) throw Error('This edit no longer owns its worker lease');
      return operation(query);
    });
  }

  private async execute(turn: Turn, controller: AbortController) {
    let heartbeatBusy = false;
    const heartbeat = setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      void this.store.query("UPDATE project_turns SET lease_until=now()+$1*interval '1 millisecond' WHERE id=$2 AND worker_id=$3 AND generation=$4 AND status='working' AND lease_until>now() RETURNING id", [this.leaseMs, turn.id, this.workerId, turn.generation])
        .then(rows => {if (!rows.length) controller.abort(Error('Edit stopped or worker lease expired'));})
        .catch(error => controller.abort(error)).finally(() => {heartbeatBusy = false;});
    }, Math.min(1000, this.leaseMs / 3));
    try {
      const project = await this.projects.owned(turn.project_id, turn.owner_id);
      const [base] = turn.base_revision ? await this.store.query('SELECT * FROM project_revisions WHERE id=$1 AND project_id=$2', [turn.base_revision, project.id]) : [];
      const parent = base ? await this.store.version(base.version_id) : project.remix ? await this.store.visibleVersion(project.remix, turn.owner_id) : undefined;
      let media: MediaState = base ? this.projects.versionMedia(parent!) : project.media;
      let checkpoint = turn.attempts > 1 ? turn.progress?.media : undefined;
      if (turn.options.retryOf) {
        const [previous] = await this.store.query('SELECT progress FROM project_turns WHERE id=$1 AND project_id=$2', [turn.options.retryOf, project.id]);
        checkpoint ??= previous?.progress?.media;
      }
      media = {...(checkpoint ?? media)};
      if (!checkpoint && turn.options.regenerateArt) {delete media.assets; delete media.icon; delete media.brief;}
      if (!checkpoint && turn.options.regenerateMusic) {delete media.music; delete media.brief;}
      const history = turn.base_revision ? await this.store.query(`WITH RECURSIVE ancestors AS (
        SELECT id,parent_id,message,created_at FROM project_revisions WHERE id=$1 AND project_id=$2
        UNION ALL SELECT r.id,r.parent_id,r.message,r.created_at FROM project_revisions r JOIN ancestors a ON r.id=a.parent_id WHERE r.project_id=$2
      ) SELECT message FROM ancestors ORDER BY created_at LIMIT 20`, [turn.base_revision, project.id]) : [];
      let feedback:unknown=turn.options.feedback;
      if(turn.options.feedback){
        const [reported]=await this.store.query('SELECT v.id,v.source FROM project_revisions r JOIN versions v ON v.id=r.version_id WHERE r.id=$1 AND r.project_id=$2',[turn.options.feedback.revisionId,project.id]);
        feedback={...turn.options.feedback,versionId:reported.id,source:reported.source};
      }
      const prompt = `Original idea: ${project.idea}\nCompleted requests (the selected source is authoritative after undo):\n${history.map(row => row.message).join('\n')}\nCurrent request: ${turn.message}`;
      const result = await this.pipeline.run({
        jobId: turn.id, projectId: project.id, ownerId: turn.owner_id, gameId: project.game_id, leaseTag: `${this.workerId}:${turn.generation}`,
        prompt, parent, media, signal: controller.signal, session: base?.session&&JSON.stringify(base.session).length<650000?base.session:undefined,
        witnesses: base?.witnesses, feedback,
        onProgress: async (progress, savedMedia) => {
          controller.signal.throwIfAborted();
          const stage = progress.branches.code === 'checking' ? 'validating' : progress.branches.code === 'working' ? 'building' : 'media';
          await this.fenced(turn, async query => {
            await query('UPDATE project_turns SET stage=$1,progress=$2 WHERE id=$3', [stage, JSON.stringify({public: progress, media: savedMedia}), turn.id]);
            await query('UPDATE projects SET media=$1,title=$2,updated_at=now() WHERE id=$3', [JSON.stringify(savedMedia), savedMedia.title ?? project.title, project.id]);
            await this.projects.event(query, project.id, 'progress', {stage, branches: progress.branches, media: savedMedia}, turn.id);
          });
        },
        onMessage: async text => this.fenced(turn, query => this.projects.event(query, project.id, 'message', {role: 'assistant', text: text.slice(0, 2000)}, turn.id)),
        onSnapshot: async snapshot => {
          controller.signal.throwIfAborted();
          const bytes = Buffer.from(snapshot.png, 'base64');
          if (bytes.length > 1_500_000 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid preview image');
          const asset = await this.store.putAsset(bytes, 'png', project.id);
          await this.fenced(turn, query => this.projects.event(query, project.id, 'snapshot', {...asset, sourceHash: snapshot.sourceHash, tick: snapshot.tick, seed: snapshot.seed, players: snapshot.players}, turn.id));
        },
      });
      controller.signal.throwIfAborted();
      await this.complete(turn, result);
    } catch (error) {
      await this.fenced(turn, async query => {
        const message = (controller.signal.aborted ? controller.signal.reason : error)?.message ?? 'Edit failed';
        await query("UPDATE project_turns SET status='failed',stage='failed',error=$1,finished_at=now(),lease_until=NULL WHERE id=$2", [String(message).slice(0,1000), turn.id]);
        await this.projects.event(query, turn.project_id, 'failed', {message: String(message).slice(0,1000)}, turn.id);
      }).catch(() => {}); // A newer lease or cancellation owns the terminal state.
    } finally {clearInterval(heartbeat);}
  }

  private async complete(turn: Turn, result: GenerationResult) {
    const {build, media} = result;
    const runtime = await this.store.putAsset(Buffer.from(build.runtime), 'js', turn.project_id);
    const versionId = hash(JSON.stringify({source: build.source, code: build.code, meta: build.meta,
      assets: media.assets, music: media.music, icon: media.icon, audio: build.audio, runtime: runtime.hash}));
    const manifest: Manifest = {
      id: versionId, gameId: build.meta.id, meta: build.meta, sdkVersion: '1.0.0',
      runtimeVersion: runtime.hash, runtimeUrl: runtime.url, codeHash: hash(build.code),
      assets: media.assets ?? [], music: media.music, icon: media.icon, audio: build.audio,
      createdAt: new Date().toISOString(),
      provenance: {kind: 'generated', projectId: turn.project_id, turnId: turn.id,
        models: {code: build.model}, builder: {image: build.imageId, reasoningEffort: build.reasoningEffort},
        validation: build.reports, brief: media.brief},
    };
    for (const file of this.store.manifestFiles(manifest)) await this.store.grantAsset(turn.project_id, file);
    await this.fenced(turn, async query => {
      const project = await this.projects.owned(turn.project_id, turn.owner_id, query);
      if (build.meta.id !== project.game_id) throw Error('Builder returned the wrong game identity');
      await this.store.insertVersion(query, {id: versionId, game_id: project.game_id, source: build.source, code: build.code, manifest}, turn.owner_id, true);
      const revision = id();
      await query('INSERT INTO project_revisions(id,project_id,turn_id,version_id,parent_id,message,validation,session,witnesses) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [revision, project.id, turn.id, versionId, turn.base_revision, turn.message,
          JSON.stringify({policy: 1, sourceHash: hash(build.source), image: build.imageId, reports: build.reports}),
          build.session ? JSON.stringify(build.session) : null, JSON.stringify(build.witnesses ?? null)]);
      await query('UPDATE projects SET selected_revision=$1,selection_epoch=selection_epoch+1,title=$2,updated_at=now() WHERE id=$3 AND selection_epoch=$4', [revision, build.meta.title, project.id, turn.selection_epoch]);
      await query("UPDATE project_turns SET status='ready',stage='ready',revision_id=$1,finished_at=now(),lease_until=NULL,progress=jsonb_set(progress,'{builder}',$3::jsonb,true) WHERE id=$2", [revision, turn.id,JSON.stringify({model:build.model,reasoningEffort:build.reasoningEffort,image:build.imageId,thread:build.thread,usage:build.usage})]);
      await this.projects.event(query, project.id, 'ready', {revisionId: revision, versionId, thread: build.thread}, turn.id);
    });
  }

  private async reap() {
    try {
      await new SandboxLeases(this.store).reap();
    } catch (error) {
      console.error('Sandbox cleanup:', (error as Error).message);
    }
  }

  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    while (this.polling) await new Promise(resolve => setTimeout(resolve, 10));
    for (const {controller} of this.running.values()) controller.abort(Error('Builder worker stopped; retry this edit to continue'));
    await Promise.allSettled([...this.running.values()].map(task => task.done));
  }
}
