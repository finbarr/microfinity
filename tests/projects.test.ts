import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store, id, hash} from '../server/store';
import {Projects, ProjectWorker, turnSchema, type TurnPipeline} from '../server/projects';
import {compileIsolated} from '../server/compile-process';
import {bootstrap} from '../server/compiler';
import {exportReferences} from '../server/game-builder';
import type {GenerationInput, GenerationResult} from '../server/generation';
import {SandboxLeases} from '../server/sandbox-leases';

const source = await readFile('games/toast-catch.ts', 'utf8');
const compiled = await compileIsolated(source), runtime = await bootstrap();
const pause = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(check: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const start = Date.now();
  for (;;) {const value = await check(); if (value !== undefined) return value; if (Date.now() - start > 15000) throw Error('Timed out'); await pause();}
}
function result(input: GenerationInput): GenerationResult {
  return {build: {...compiled, source: source + '\n//' + input.prompt, meta: {...compiled.meta, id: input.gameId}, runtime, reports: [{ok: true}], model: 'fixture', usage: [], witnesses: []}, media: {...input.media, title: 'Toast studio'}, usage: []};
}
async function fixture(t: any, pipeline?: TurnPipeline) {
  const root = await mkdtemp(join(tmpdir(), 'microfinity-projects-'));
  const store = new Store(root, ''); await store.init();
  const a = await store.guest(undefined, 'Alice'), b = await store.guest(undefined, 'Bob');
  const projects = new Projects(store);
  const worker = new ProjectWorker(projects, pipeline ?? {run: async input => result(input)}, {concurrency: 2, leaseMs: 3000});
  t.after(async () => {await worker.close(); await store.close(); await rm(root, {recursive: true, force: true});});
  const create = (owner = a.id) => projects.create(owner, {requestId: id(), prompt: 'Catch toast before it hits the floor.'});
  const settled = (project: string, owner = a.id) => until(async () => {
    const p = await projects.get(project, owner);
    return p.turns.every(t => !['working','queued'].includes(t.status)) ? p : undefined;
  });
  return {root, store, a, b, projects, worker, create, settled};
}

test('sandbox cleanup fences leases, retains late-allocation tombstones, and retries deletion failures', async t => {
  const f = await fixture(t), project = await f.create();
  const turn = (await f.worker.claim())!;
  const deleted: string[] = [];
  let fail = false;
  const leases = new SandboxLeases(f.store, async name => {
    if (fail) throw Error('Provider unavailable');
    deleted.push(name);
    return {};
  });
  const name = 'microfinity-0123456789abcdef-agent';
  const input = {jobId: turn.id, projectId: project.id, leaseTag: `${turn.worker_id}:${turn.generation}`} as any;
  await leases.reserve(name, input);
  await leases.reap();
  assert.deepEqual(deleted, [], 'active turn must keep its sandbox');
  await f.store.query("UPDATE project_turns SET lease_until=now()-interval '1 second' WHERE id=$1", [turn.id]);
  await assert.rejects(() => leases.reserve('microfinity-0123456789abcdef-validator', input), /worker lease/);
  const replacement = (await f.worker.claim())!;
  assert.ok(replacement.generation > turn.generation);
  fail = true;
  await assert.rejects(() => leases.reap(), /Provider unavailable/);
  assert.equal((await f.store.query('SELECT * FROM builder_sandboxes')).length, 1);
  fail = false;
  await leases.reap();
  assert.deepEqual(deleted, [name]);
  assert.equal((await f.store.query('SELECT * FROM builder_sandboxes')).length, 1, 'late allocation remains reclaimable');
  await leases.reap();
  assert.equal(deleted.length, 1, 'cleanup retries are rate limited');
  await f.store.query("UPDATE builder_sandboxes SET check_after=now(),expires_at=now()-interval '1 second'");
  await leases.reap();
  assert.deepEqual(deleted, [name, name]);
  assert.equal((await f.store.query('SELECT * FROM builder_sandboxes')).length, 0);
});

test('idempotent creation and messages reject conflicting reuse; short follow-ups work', async t => {
  const f = await fixture(t), request = {requestId: id(), prompt: 'Catch toast before it hits the floor.'};
  const [one, duplicate] = await Promise.all([f.projects.create(f.a.id, request), f.projects.create(f.a.id, request)]);
  assert.equal(one.id, duplicate.id);
  await assert.rejects(() => f.projects.create(f.a.id, {...request, prompt: 'A different idea entirely'}), /different idea/);
  const change = {requestId: id(), message: 'slower'};
  await f.projects.submit(one.id, f.a.id, change); await f.projects.submit(one.id, f.a.id, change);
  assert.equal((await f.projects.get(one.id, f.a.id)).turns.length, 2);
  await assert.rejects(() => f.projects.submit(one.id, f.a.id, {...change, message: 'faster'}), /different edit/);
  assert.throws(() => turnSchema.parse({...change, message: 'x'.repeat(601)}));
  assert.throws(() => turnSchema.parse({...change, shell: 'anything'}));
});

test('event replay orders numeric cursors across digit boundaries and pages', async t => {
  const f = await fixture(t), project = await f.create();
  await f.store.query("INSERT INTO project_events(project_id,kind,payload) SELECT $1,'fixture','{}'::jsonb FROM generate_series(1,130)", [project.id]);
  const first = await f.projects.events(project.id, f.a.id, 0);
  assert.equal(first.length, 100);
  assert.deepEqual(first.map(e => Number(e.id)), Array.from({length: 100}, (_, i) => i + 1));
  const rest = await f.projects.events(project.id, f.a.id, Number(first.at(-1)!.id));
  assert.deepEqual(rest.map(e => Number(e.id)), Array.from({length: 32}, (_, i) => i + 101));
  assert.deepEqual(await f.projects.events(project.id, f.a.id, Number(rest.at(-1)!.id)), []);
});

test('retry preserves regenerated media checkpoints and original playtest feedback', async t => {
  const oldArt = {hash: 'a'.repeat(64), url: `/assets/${'a'.repeat(64)}.png`, name: 'toast', width: 1, height: 1};
  const newArt = {...oldArt, hash: 'b'.repeat(64), url: `/assets/${'b'.repeat(64)}.png`};
  let calls = 0, replay: unknown;
  const f = await fixture(t, {run: async input => {
    calls++;
    if (calls === 1) return {...result(input), media: {assets: [oldArt]}};
    if (calls === 2) {
      assert.equal(input.media.assets, undefined);
      replay = input.feedback;
      await input.onProgress({branches: {art: 'ready', code: 'working'}}, {assets: [newArt]});
      throw Error('Interrupted after artwork');
    }
    assert.deepEqual(input.media.assets, [newArt]);
    assert.deepEqual(input.feedback, replay);
    return result(input);
  }});
  const project = await f.create(); f.worker.start();
  const initial = await f.settled(project.id);
  await f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'Blue toast', regenerateArt: true,
    feedback: {revisionId: initial.selected_revision, players: 1, seed: 1, steps: []}});
  const failed = await f.settled(project.id), retryOf = failed.turns.at(-1)!.id;
  assert.equal(failed.turns.at(-1)!.status, 'failed');
  await assert.rejects(() => f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'Different request', retryOf}), /original edit/);
  await f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'Blue toast', retryOf});
  const ready = await f.settled(project.id);
  assert.equal(ready.turns.at(-1)!.status, 'ready'); assert.equal(calls, 3);
  assert.deepEqual(ready.revisions.at(-1)!.manifest.assets, [newArt]);
});

test('two owners execute concurrently; one project has one writer and later turns use its finished base', async t => {
  const waiting: {input: GenerationInput; finish: () => void}[] = [];
  const f = await fixture(t, {run: input => new Promise(resolve => waiting.push({input, finish: () => resolve(result(input))}))});
  const a = await f.create(), b = await f.create(f.b.id);
  await f.projects.submit(a.id, f.a.id, {requestId: id(), message: 'Make it faster'});
  f.worker.start(); await until(() => waiting.length === 2 ? true : undefined);
  assert.equal(new Set(waiting.map(w => w.input.ownerId)).size, 2);
  assert.equal((await f.projects.get(a.id, f.a.id)).turns[1].status, 'queued');
  for (const pending of waiting.slice()) pending.finish();
  await until(() => waiting.length === 3 ? true : undefined);
  assert.ok(waiting[2].input.parent, 'queued edit resolved its base after creation finished');
  waiting[2].finish();
  assert.equal((await f.settled(a.id)).revisions.length, 2);
  assert.equal((await f.settled(b.id, f.b.id)).revisions.length, 1);
});

test('draft source, media, events and references stay owner-only; publication promotes exactly the selection', async t => {
  const f = await fixture(t);
  const project = await f.create();
  const privateAsset = await f.store.putAsset(Buffer.from('private fixture bytes'), 'png', project.id);
  await f.store.query('UPDATE projects SET media=$1 WHERE id=$2', [JSON.stringify({assets: [{...privateAsset, name: 'toast', width: 1, height: 1}]}), project.id]);
  f.worker.start(); const ready = await f.settled(project.id), revision = ready.revisions[0];
  assert.equal((await f.store.library()).length, 0);
  await assert.rejects(() => f.projects.get(project.id, f.b.id), /not found/);
  await assert.rejects(() => f.projects.events(project.id, f.b.id, 0), /not found/);
  await assert.rejects(() => f.store.visibleVersion(revision.version_id, f.b.id), /not found/);
  assert.ok(await f.store.visibleVersion(revision.version_id, f.a.id));
  const file = privateAsset.url.split('/').at(-1)!;
  assert.equal(await f.store.canReadAsset(file, f.b.id), false);
  assert.equal(await f.store.canReadAsset(file, f.a.id), true);
  const refs = join(f.root, 'refs'); await exportReferences(f.store, refs, f.b.id);
  const {readdir} = await import('node:fs/promises');
  assert.equal((await readdir(refs)).some(name => name.includes(revision.version_id)), false);
  const ownRefs = join(f.root, 'own'); await exportReferences(f.store, ownRefs, f.a.id);
  assert.equal((await readdir(ownRefs)).some(name => name.includes(revision.version_id)), true);
  await assert.rejects(() => f.projects.publish(project.id, f.b.id, revision.id), /not found/);
  const before = await f.store.version(revision.version_id);
  await f.projects.publish(project.id, f.a.id, revision.id); await f.projects.publish(project.id, f.a.id, revision.id);
  assert.equal((await f.store.library())[0].manifest.id, revision.version_id);
  assert.equal(await f.store.canReadAsset(file), true);
  assert.equal((await f.store.visibleVersion(revision.version_id)).source, before.source);
  const events = await f.projects.events(project.id, f.a.id, 0);
  assert.equal(events.filter(e => e.kind === 'published').length, 1);
  assert.ok(!(JSON.stringify(await f.projects.get(project.id, f.a.id))).includes('session'));
});

test('failed edits retain a playable revision; undo selects and publishes old bytes without regenerating', async t => {
  let fail = false, calls = 0;
  const f = await fixture(t, {run: async input => {calls++; if (fail) throw Error('Deliberate edit failure'); return result(input);}});
  const project = await f.create(); f.worker.start();
  const first = (await f.settled(project.id)).revisions[0];
  await f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'Make the sky blue'});
  const second = await f.settled(project.id); assert.equal(second.revisions.length, 2);
  fail = true;
  await f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'A failed tweak'});
  const failed = await f.settled(project.id); assert.equal(failed.selected_revision, second.selected_revision);
  await f.projects.select(project.id, f.a.id, first.id);
  await assert.rejects(() => f.projects.publish(project.id, f.a.id, second.selected_revision!), /selection|selected/);
  await f.projects.publish(project.id, f.a.id, first.id);
  assert.equal((await f.store.library())[0].manifest.id, first.version_id); assert.equal(calls, 3);
});

test('cancellation fences even a pipeline that ignores abort and returns late', async t => {
  let input: GenerationInput | undefined, finish!: (value: GenerationResult) => void;
  const f = await fixture(t, {run: async value => {input = value; return new Promise(resolve => {finish = resolve;});}});
  const project = await f.create(); f.worker.start(); await until(() => input);
  await f.projects.cancel(project.id, f.a.id, project.turns[0].id);
  finish(result(input!)); await pause(50);
  const stopped = await f.projects.get(project.id, f.a.id);
  assert.equal(stopped.turns[0].status, 'cancelled'); assert.equal(stopped.revisions.length, 0);
  assert.equal((await f.store.query('SELECT id FROM versions')).length, 0);
});

test('expired leases are retried with a new generation; healthy jobs survive store startup', async t => {
  const f = await fixture(t), a = await f.create(), b = await f.create(f.b.id);
  const first = await f.worker.claim(), healthy = await f.worker.claim();
  assert.ok(first && healthy);
  await f.store.init({recoverMatches: false});
  assert.equal((await f.projects.get(b.id, f.b.id)).turns[0].status, 'working');
  await f.store.query("UPDATE project_turns SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
  const next = await f.worker.claim(); assert.equal(next!.id, first.id); assert.ok(next!.generation > first.generation);
  await assert.rejects(() => (f.worker as any).fenced(first, async () => {}), /lease/);
  assert.equal((await f.projects.get(a.id, f.a.id)).turns[0].attempts, undefined, 'private worker bookkeeping is absent from API');
  const events = await f.projects.events(a.id, f.a.id, 0), cursor = Number(events[1].id);
  assert.ok((await f.projects.events(a.id, f.a.id, cursor)).every(event => Number(event.id) > cursor));
});

test('selection changes fence automatic selection of a late edit', async t => {
  let finish: (() => void) | undefined;
  const f = await fixture(t, {run: async input => {
    if (input.parent) await new Promise<void>(resolve => {finish = resolve;});
    return result(input);
  }});
  const project = await f.create(); f.worker.start(); const first = (await f.settled(project.id)).revisions[0];
  await f.projects.submit(project.id, f.a.id, {requestId: id(), message: 'Edit while I browse versions'});
  await until(() => finish);
  await f.projects.select(project.id, f.a.id, first.id); finish!();
  const done = await f.settled(project.id);
  assert.equal(done.revisions.length, 2); assert.equal(done.selected_revision, first.id);
});
