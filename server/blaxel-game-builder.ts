import {SandboxInstance} from '@blaxel/core';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ModelPolicy, parseReasoningEffort} from '../builder/policy.mjs';
import {hash, type Store} from './store';
import {SandboxLeases, deleteBuilderSandbox} from './sandbox-leases';
import {collectCandidate, command, prepareBuildDirectory, validateSession,
  type BuildInput, type BuildResult, type GameBuilder} from './game-builder';

type Options = {
  image?: string;
  region?: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  evidenceDirectory?: string;
};

/** One disposable coding VM and one independent validation VM per turn. */
export class BlaxelGameBuilder implements GameBuilder {
  constructor(private store: Store, private options: Options = {}) {}

  async build(input: BuildInput): Promise<BuildResult> {
    const started = Date.now();
    const timeoutMs = this.options.timeoutMs ?? 600_000;
    const controller = new AbortController();
    const signal = AbortSignal.any([input.signal, controller.signal, AbortSignal.timeout(timeoutMs)]);
    const image = this.options.image ?? process.env.BLAXEL_BUILDER_IMAGE ?? '';
    const model = this.options.model ?? process.env.BUILDER_MODEL ?? 'gpt-6-sol';
    const reasoningEffort = parseReasoningEffort(this.options.reasoningEffort ?? process.env.BUILDER_REASONING_EFFORT ?? 'medium');
    const name = `microfinity-${randomBytes(8).toString('hex')}`;
    const directory = await mkdtemp(join(tmpdir(), 'microfinity-blaxel-'));
    const evidence = this.options.evidenceDirectory
      ? resolve(this.options.evidenceDirectory, input.jobId) : join(directory, 'evidence');
    const leases = new SandboxLeases(this.store);
    const createdNames: string[] = [];
    const lifecycle: Record<string, unknown>[] = [];
    const usage: Record<string, unknown>[] = [];
    let bridge: Promise<void> | undefined;
    let snapshots: Promise<void> = Promise.resolve();
    const mark = (event: string, detail: Record<string, unknown> = {}) => {
      lifecycle.push({event, ms: Date.now() - started, ...detail});
    };
    const execute = async (box: SandboxInstance, command: string, name: string, seconds = 60) => {
      signal.throwIfAborted();
      await box.process.exec({name, command, keepAlive: true, timeout: seconds});
      const result = await box.process.wait(name, {maxWait: seconds * 1000 + 5000, signal});
      if (result.status !== 'completed' || result.exitCode !== 0) {
        throw Error(`Blaxel ${name} failed: ${result.stderr?.slice(-2000) ?? result.status}`);
      }
      return result;
    };
    const create = async (role: string) => {
      signal.throwIfAborted();
      await leases.reserve(`${name}-${role}`, input);
      createdNames.push(`${name}-${role}`);
      const box = await SandboxInstance.create({
        name: `${name}-${role}`, image,
        region: this.options.region ?? process.env.BLAXEL_REGION ?? 'us-was-1', memory: 4096,
        ttl: '20m', labels: {app: 'microfinity', role, ...(input.projectId ? {project: input.projectId, turn: input.jobId} : {})},
        envs: [{name: 'SANDBOX_DISABLE_PROCESS_LOGGING', value: 'true'}],
      });
      mark('created', {role, name: `${name}-${role}`});
      signal.throwIfAborted();
      await box.fs.writeBinary('/control/input.tar.gz', await readFile(join(directory, 'input.tar.gz')));
      await execute(box, 'mkdir -p /bl && chown -R 10001:10001 /work /scratch && tar -xzf /control/input.tar.gz -C / && chmod -R a-w /input /media /references', `prepare-${role}`);
      await execute(box, "/kit/builder/blaxel-run.sh sh -c 'test -w /work && test -w /scratch'", `writable-${role}`);
      return box;
    };
    try {
      if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');
      if (!/^sandbox\/[a-z0-9][a-z0-9-]*:[a-f0-9]{20,64}$/.test(image)) {
        throw Error('BLAXEL_BUILDER_IMAGE must be the versioned toolkit image returned by bl push');
      }
      await mkdir(evidence, {recursive: true});
      await prepareBuildDirectory(this.store, directory, input);
      await command('tar', ['-czf', join(directory, 'input.tar.gz'), '-C', directory, 'input', 'media', 'references'], {signal});
      // Separate microVMs: the coding agent cannot alter the validation toolkit.
      const agent = await create('agent');
      const validator = await create('validator');
      const probe = await execute(agent,
        '/kit/builder/blaxel-run.sh node /kit/builder/blaxel-isolation.mjs', 'isolation');
      const isolation = JSON.parse(probe.stdout);
      await writeFile(join(evidence, 'isolation.json'), JSON.stringify(isolation, null, 2));
      if (!isolation.ok) throw Error('Blaxel isolation checks failed');
      mark('isolation-verified');

      await agent.fs.write('/control/request.json', '{"id":0}');
      await agent.fs.write('/control/events.jsonl', '');
      await agent.process.exec({name: 'relay', command: 'node /kit/builder/blaxel-relay.mjs', keepAlive: true, timeout: Math.ceil(timeoutMs / 1000)});
      const policy = new ModelPolicy({model, reasoningEffort, deadline: started + timeoutMs});
      let lastRequest = 0;
      bridge = (async () => {
        while (!signal.aborted) {
          const raw = await agent.fs.read('/control/request.json');
          if (Buffer.byteLength(raw) > 2_010_000) throw Error('Model request exceeds bridge limit');
          const request = JSON.parse(raw);
          if (request.id !== lastRequest) {
            if (request.id !== lastRequest + 1) throw Error('Invalid model request sequence');
            lastRequest = request.id;
            const callStarted = Date.now();
            const body = policy.reserve(request.body);
            const response = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST', redirect: 'error', signal,
              headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json'},
              body: JSON.stringify(body),
            });
            if (!response.ok) throw Error(`Model provider returned ${response.status}`);
            let stream = '';
            const decoder = new TextDecoder();
            const reader = response.body!.getReader();
            for (;;) {
              const {value, done} = await reader.read();
              if (done) break;
              stream += decoder.decode(value, {stream: true});
              if (Buffer.byteLength(stream) > 4_000_000) throw Error('Model response exceeds bridge limit');
            }
            const completed = stream.split('\n').filter(line => line.startsWith('data: '))
              .map(line => {try {return JSON.parse(line.slice(6));} catch {return null;}})
              .find(event => ['response.completed', 'response.incomplete'].includes(event?.type));
            if (!completed) throw Error('Model stream ended without completion');
            policy.settle(completed.response?.usage?.output_tokens);
            usage.push({elapsedMs: Date.now() - callStarted, ...policy.usage, ...completed.response?.usage});
            await agent.fs.write(`/control/response-${lastRequest}.tmp`, JSON.stringify({status: 200, body: stream}));
            await execute(agent, `mv /control/response-${lastRequest}.tmp /control/response-${lastRequest}.json`, `reply-${lastRequest}`);
          }
          await delay(250, undefined, {signal});
        }
      })();
      bridge.catch(error => controller.abort(error));
      await input.onStage?.('building');
      signal.throwIfAborted();
      await agent.process.exec({
        name: 'builder', keepAlive: true, timeout: Math.ceil(timeoutMs / 1000),
        env: {BUILDER_MODEL: model, BUILDER_REASONING_EFFORT: reasoningEffort},
        command: 'node /kit/builder/blaxel-agent.mjs',
      });
      mark('agent-started');
      let offset = 0;
      let completed: any;
      let thread: BuildResult['thread'];
      let snapshotCount = 0;
      let latestSource: string | undefined;
      let rendering = false;
      const renderPending = () => {
        if (rendering || !latestSource || !input.onSnapshot || snapshotCount >= 16) return;
        const source = latestSource;
        latestSource = undefined;
        rendering = true;
        const number = ++snapshotCount;
        snapshots = (async () => {
          try {
            await validator.fs.write('/input/candidate.ts', source);
            await execute(validator, '/kit/builder/blaxel-run.sh game-tool snapshot /input/candidate.ts > /control/snapshot.json', `snapshot-${number}`, 60);
            const snapshot = JSON.parse(await validator.fs.read('/control/snapshot.json'));
            if (snapshot.ok && typeof snapshot.png === 'string' && snapshot.png.length < 2_000_000) {
              await input.onSnapshot!({...snapshot, sourceHash: hash(source)});
              await writeFile(join(evidence, `progress-${number}.png`), Buffer.from(snapshot.png, 'base64'));
              mark('snapshot', {number, sourceHash: hash(source)});
            }
          } catch (error) {
            if (signal.aborted) throw error;
            mark('intermediate-not-renderable', {number, error: (error as Error).message});
          } finally {
            rendering = false;
            renderPending();
          }
        })();
        snapshots.catch(error => controller.abort(error));
      };
      for (;;) {
        signal.throwIfAborted();
        const state = await agent.process.get('builder', {signal});
        const raw = await agent.fs.read('/control/events.jsonl');
        if (Buffer.byteLength(raw) > 8_000_000) throw Error('Builder event limit exceeded');
        const end = raw.lastIndexOf('\n') + 1;
        for (const line of raw.slice(offset, end).split('\n').filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'candidate' && typeof event.source === 'string' && Buffer.byteLength(event.source) <= 100_000) {
            latestSource = event.source;
            renderPending();
          }
          if (event.type === 'thread') thread = {threadId: event.threadId, resumed: event.resumed === true};
          if (event.type === 'message' && typeof event.text === 'string') await input.onMessage?.(event.text.slice(0, 2000));
          if (event.type === 'complete') completed = event;
        }
        offset = end;
        if (state.status !== 'running') {
          if (state.status !== 'completed' || state.exitCode !== 0 || !completed) {
            await writeFile(join(evidence, 'agent.private.log'), await agent.fs.read('/control/agent.log'), {mode: 0o600});
            throw Error(`Blaxel builder ${state.status}, exit ${state.exitCode}`);
          }
          break;
        }
        await delay(750, undefined, {signal});
      }
      mark('agent-completed');
      while (rendering) await snapshots;
      const artifact = collectCandidate(JSON.stringify(completed));
      if (completed.session) validateSession(completed.session);
      await validator.fs.write('/input/output.ts', artifact.source);
      await validator.fs.write('/input/witnesses.json', JSON.stringify(artifact.witnesses));
      await input.onStage?.('validating');
      await execute(validator,
        '/kit/builder/blaxel-run.sh game-tool validate /input/output.ts /input/witnesses.json --artifact > /control/validation.json',
        'validation', 120);
      const result = JSON.parse(await validator.fs.read('/control/validation.json'));
      if (result.ok !== true || typeof result.runtime !== 'string' || result.runtime.length > 500_000) throw Error('Independent validation failed');
      await writeFile(join(evidence, 'output.ts'), artifact.source);
      await writeFile(join(evidence, 'witnesses.json'), JSON.stringify(artifact.witnesses, null, 2));
      await writeFile(join(evidence, 'validation.json'), JSON.stringify({...result, screenshots: undefined, code: undefined}, null, 2));
      for (const shot of result.screenshots) await writeFile(join(evidence, `${shot.players}-players.png`), Buffer.from(shot.png, 'base64'));
      mark('validated');
      signal.throwIfAborted();
      return {...result, source: artifact.source, witnesses: artifact.witnesses, session: completed.session,
        thread, model, reasoningEffort, imageId: image, usage};
    } catch (error) {
      mark('failed', {error: (error as Error).message});
      throw error;
    } finally {
      controller.abort();
      await bridge?.catch(() => {});
      await snapshots.catch(() => {});
      const cleanup = await Promise.allSettled(createdNames.map(async sandboxName => {
        await deleteBuilderSandbox(sandboxName);
        await leases.release(sandboxName);
        mark('deleted', {name: sandboxName});
      }));
      await mkdir(evidence, {recursive: true});
      await writeFile(join(evidence, 'lifecycle.json'), JSON.stringify({image, model, reasoningEffort, lifecycle, usage}, null, 2));
      await rm(directory, {recursive: true, force: true});
      if (cleanup.some(result => result.status === 'rejected')) throw Error('Sandbox cleanup failed; the lease reaper will retry. Expiration remains set to 20 minutes.');
    }
  }
}
