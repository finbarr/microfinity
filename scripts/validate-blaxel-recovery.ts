import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {SandboxInstance} from '@blaxel/core';
import {Store, id} from '../server/store';
import {Projects, ProjectWorker} from '../server/projects';
import {SandboxLeases, deleteBuilderSandbox} from '../server/sandbox-leases';

const directory = resolve(process.env.BUILDER_VALIDATION_DIR ?? `artifacts/blaxel-recovery/${Date.now()}`);
await mkdir(directory, {recursive: true});
const store = new Store(join(directory, 'data'), '');
await store.init();
const projects = new Projects(store), leases = new SandboxLeases(store);
const worker = new ProjectWorker(projects);
const name = `microfinity-${randomBytes(8).toString('hex')}-agent`;
try {
  const owner = await store.guest(undefined, 'Recovery validation');
  const project = await projects.create(owner.id, {requestId: id(), prompt: 'A harmless sandbox recovery check.'});
  const turn = (await worker.claim())!;
  await leases.reserve(name, {jobId: turn.id, projectId: project.id, leaseTag: `${turn.worker_id}:${turn.generation}`} as any);
  await SandboxInstance.create({name, image: process.env.BLAXEL_BUILDER_IMAGE!, memory: 4096,
    region: 'us-was-1', ttl: '20m', labels: {app: 'microfinity', purpose: 'lease-recovery-validation'}});
  await leases.reap();
  assert.equal((await SandboxInstance.get(name)).status, 'DEPLOYED');
  // Simulate the database state left by a dead worker, without invoking build finally.
  await store.query("UPDATE project_turns SET lease_until=now()-interval '1 second' WHERE id=$1", [turn.id]);
  const replacement = (await worker.claim())!;
  assert.ok(replacement.generation > turn.generation);
  const started = Date.now();
  await leases.reap();
  let state: string | undefined;
  for (let attempt = 0; attempt < 30; attempt++) {
    const page = await SandboxInstance.list({q: name});
    state = page.data.find(box => box.metadata.name === name)?.status;
    if (!state || state === 'TERMINATED') break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(!state || state === 'TERMINATED', `Deletion did not converge: ${state}`);
  await deleteBuilderSandbox(name); // Repeated cleanup, including an absent sandbox, is safe.
  const report = {ok: true, retainedWhileHealthy: true, deletedAfterLeaseReplacement: true,
    replacementGeneration: replacement.generation, cleanupMs: Date.now() - started, modelCalls: 0};
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await deleteBuilderSandbox(name);
  await worker.close();
  await store.close();
}
