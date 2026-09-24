import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {Store, id} from '../server/store';
import {Projects, ProjectWorker} from '../server/projects';
import {BlaxelGameBuilder} from '../server/blaxel-game-builder';
import {GenerationService} from '../server/generation';
import {compileIsolated} from '../server/compile-process';

// Real cloud builds, isolated local database. Reuse known media to test scheduling,
// restoration and publishing independently of the already-qualified media providers.
const baseline = resolve(process.argv[2]);
const directory = resolve(process.env.BUILDER_VALIDATION_DIR ?? `artifacts/blaxel-studio/${Date.now()}`);
await mkdir(directory, {recursive: true});
const previous = JSON.parse(await readFile(join(baseline, 'project.json'), 'utf8'));
const revision = previous.revisions.find((r: any) => r.id === previous.selected_revision);
assert.ok(revision);
const turnId = previous.turns.find((t: any) => t.revision_id === revision.id)?.id;
assert.ok(turnId, 'A source artifact for the selected revision is required');
const source = await readFile(join(baseline, turnId, 'output.ts'), 'utf8');
const compiled = await compileIsolated(source);
const store = new Store(join(directory, 'data'), '');
await store.init();
const projects = new Projects(store);
const builder = new BlaxelGameBuilder(store, {evidenceDirectory: directory});
const worker = new ProjectWorker(projects, new GenerationService(store, {}, undefined, undefined, builder), {concurrency: 2});
const started = Date.now();
const report: any = {directory, image: process.env.BLAXEL_BUILDER_IMAGE, observations: []};
const log = (event: string, detail: any = {}) => {
  const item = {event, ms: Date.now() - started, ...detail};
  report.observations.push(item);
  console.log(JSON.stringify(item));
};
async function settled(projectId: string, ownerId: string) {
  let last = '';
  for (;;) {
    const project = await projects.get(projectId, ownerId);
    const statuses = project.turns.map(t => `${t.status}:${t.stage}`).join(',');
    if (statuses !== last) {log('progress', {projectId, statuses}); last = statuses;}
    if (project.turns.every(t => !['queued', 'working'].includes(t.status))) {
      assert.equal(project.turns.at(-1)!.status, 'ready', project.turns.at(-1)!.error ?? 'Build failed');
      return project;
    }
    if (Date.now() - started > 1_200_000) throw Error('Studio validation timed out');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
try {
  const manifest = revision.manifest;
  for (const asset of [...manifest.assets, manifest.music, manifest.icon].filter(Boolean)) {
    await store.putAsset(await readFile(join(baseline, 'data/assets', basename(asset.url))), asset.url.endsWith('.wav') ? 'wav' : 'png');
  }
  const baselineVersion = await store.putVersion(source, compiled.code, compiled.meta,
    manifest.assets, manifest.music, {kind: 'validation-fixture', brief: manifest.provenance.brief},
    undefined, undefined, compiled.audio, undefined, manifest.icon);
  const owners = await Promise.all(['Blaxel Alice', 'Blaxel Bob'].map(name => store.guest(undefined, name)));
  const drafts = await Promise.all(owners.map((owner, index) => projects.create(owner.id, {
    requestId: id(), prompt: `Keep the sleepy dragon marshmallow game's mechanics and controls. Change the sky to ${index ? 'deep green' : 'deep purple'}.`,
    remix: baselineVersion.id,
  })));
  await writeFile(join(directory, 'owners.private.json'), JSON.stringify(owners.map((owner, index) => ({owner, projectId: drafts[index].id}))), {mode: 0o600});
  worker.start();
  const ready = await Promise.all(drafts.map((draft, index) => settled(draft.id, owners[index].id)));
  const turns = await store.query('SELECT id,owner_id,progress FROM project_turns ORDER BY created_at');
  assert.equal(new Set(turns.map(t => t.owner_id)).size, 2);
  const lifecycles = await Promise.all(turns.map(async t => JSON.parse(await readFile(join(directory, t.id, 'lifecycle.json'), 'utf8'))));
  assert.ok(lifecycles.every(l => l.lifecycle.filter((e: any) => e.event === 'deleted').length === 2));
  // Both builds must actually overlap in their model-execution windows.
  const timings = await store.query("SELECT min(e.created_at) AS began,t.finished_at FROM project_turns t JOIN project_events e ON e.turn_id=t.id AND e.kind='working' GROUP BY t.id ORDER BY began");
  assert.ok(new Date(timings[1].began) < new Date(timings[0].finished_at));
  log('parallel-ready', {projects: ready.map(p => p.id), threads: turns.map(t => t.progress.builder.thread)});
  await projects.submit(ready[0].id, owners[0].id, {requestId: id(), message: 'Keep the purple sky. Change the title to Midnight Marshmallows. Preserve all mechanics and timing.'});
  const edited = await settled(ready[0].id, owners[0].id);
  const [edit] = await store.query('SELECT progress FROM project_turns WHERE id=$1', [edited.turns.at(-1)!.id]);
  assert.equal(edit.progress.builder.thread.resumed, true);
  assert.equal(edit.progress.builder.thread.threadId, turns.find(t => t.owner_id === owners[0].id).progress.builder.thread.threadId);
  for (const r of edited.revisions) assert.deepEqual(r.manifest.assets, manifest.assets);
  const published = await projects.publish(edited.id, owners[0].id, edited.selected_revision!);
  const events = await projects.events(edited.id, owners[0].id, 0);
  assert.ok(events.some(e => e.kind === 'snapshot'));
  assert.equal((await store.query('SELECT * FROM builder_sandboxes')).length, 0);
  report.ok = true;
  report.publishedVersion = published.revisions.find(r => r.id === published.published_revision)!.version_id;
  report.resumed = edit.progress.builder.thread;
  await writeFile(join(directory, 'project.json'), JSON.stringify(published, null, 2));
  log('published', {version: report.publishedVersion, elapsedMs: Date.now() - started});
} finally {
  await worker.close();
  await store.close();
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
}
