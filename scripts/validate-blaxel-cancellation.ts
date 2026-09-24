import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {Store} from '../server/store';
import {BlaxelGameBuilder} from '../server/blaxel-game-builder';

const baseline = resolve(process.argv[2] ?? 'artifacts/blaxel-validation/20260924');
const project = JSON.parse(await readFile(join(baseline, 'project.json'), 'utf8'));
const revision = project.revisions.find((r: any) => r.id === project.selected_revision);
if (!revision) throw Error('A completed local Blaxel validation is required');
const manifest = revision.manifest;
const directory = join(baseline, 'cancellation');
await mkdir(directory, {recursive: true});
const store = new Store(join(directory, 'data'), '');
await store.init();
const abort = new AbortController();
let cancelledAt = 0;
try {
  for (const asset of [...manifest.assets, manifest.music, manifest.icon].filter(Boolean)) {
    await store.putAsset(await readFile(join(baseline, 'data/assets', basename(asset.url))), asset.url.endsWith('.wav') ? 'wav' : 'png');
  }
  const builder = new BlaxelGameBuilder(store, {
    image: process.env.BLAXEL_BUILDER_IMAGE ?? '', evidenceDirectory: directory,
  });
  await assert.rejects(builder.build({
    jobId: 'cancelled-turn', prompt: project.idea, brief: manifest.provenance.brief,
    gameId: manifest.meta.id, assets: manifest.assets, music: manifest.music, icon: manifest.icon,
    signal: abort.signal,
    onStage: async stage => {
      if (stage === 'building') {
        cancelledAt = Date.now();
        abort.abort(Error('Qualification cancellation'));
      }
    },
  }), /Qualification cancellation/);
  assert.ok(cancelledAt, 'Cancellation must happen after both cloud sandboxes exist');
  const lifecycle = JSON.parse(await readFile(join(directory, 'cancelled-turn/lifecycle.json'), 'utf8'));
  assert.equal(lifecycle.usage.length, 0, 'Cancellation must prevent model dispatch');
  assert.equal(lifecycle.lifecycle.filter((event: any) => event.event === 'deleted').length, 2);
  const report = {cancelToCleanupMs: Date.now() - cancelledAt, sandboxesDeleted: 2, modelCalls: 0};
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await store.close();
}
