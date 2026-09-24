import 'dotenv/config';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, join, basename} from 'node:path';
import {Store, hash, type Asset} from '../server/store';
import {BlaxelGameBuilder} from '../server/blaxel-game-builder';

// An explicit local database and saved media keep this benchmark off production.
// Each case sees only the cartridges available before its original Astra build.
const baselineRoot = resolve('artifacts/builder-validation/1790270835293');
const directory = resolve(process.env.BUILDER_BENCHMARK_DIR ?? `artifacts/builder-benchmark/${Date.now()}`);
const image = process.env.BLAXEL_BUILDER_IMAGE ?? '';
const cases = [
  {name: 'dragon', id: 'b10a062332f03ca10bdb2a3e'},
  {name: 'quilt', id: 'f89618f484b84ce94a475af8'},
  {name: 'penguin', id: 'f9075108fb35b63a33721555'},
];
const selectedCases = (process.env.BUILDER_BENCHMARK_CASES ?? 'dragon,quilt,penguin').split(',');
const models = (process.env.BUILDER_BENCHMARK_MODELS ?? 'gpt-6-luna,gpt-6-sol').split(',');
const reasoningEffort = process.env.BUILDER_BENCHMARK_EFFORT ?? 'medium';
await mkdir(directory, {recursive: true});
const store = new Store(join(directory, 'data'), '');
await store.init();
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());

try {
  const owner = await store.guest(undefined, 'Model benchmark');
  const imageId = image;
  const fixtures: {name: string; id: string; job: any; row: {id: string; game_id: string; source: string; manifest: {meta: any}}}[] = [];
  for (const item of cases) {
    const base = join(baselineRoot, item.id);
    const job = JSON.parse(await readFile(join(base, 'creation.json'), 'utf8'));
    const source = await readFile(join(base, 'output.ts'), 'utf8');
    const validation = JSON.parse(await readFile(join(base, 'validation.json'), 'utf8'));
    for (const asset of [...job.previewArt, job.previewIcon, job.previewMusic]) {
      const bytes = await readFile(join(baselineRoot, 'data/assets', basename(asset.url)));
      if (hash(bytes) !== asset.hash) throw new Error('Baseline media hash mismatch');
      await store.putAsset(bytes, asset.url.endsWith('.wav') ? 'wav' : 'png');
    }
    fixtures.push({...item, job, row: {id: job.finishedVersion, game_id: job.buildGameId, source, manifest: {meta: validation.meta}}});
  }
  const builtinHashes = Object.fromEntries(await Promise.all((await readdir('games')).filter(file => file.endsWith('.ts')).sort().map(async file => [file, hash(await readFile(join('games', file)))])));
  const setup = {createdAt: new Date().toISOString(), imageId, models, reasoningEffort, builtinHashes, cases: fixtures.map((f, i) => ({name: f.name, job: f.job, references: fixtures.slice(0, i).map(p => p.row.id), baselineBuildMs: f.job.timings.codeEnd - f.job.timings.codeStart}))};
  await writeFile(join(directory, 'inputs.json'), JSON.stringify(setup, null, 2));
  const results: any[] = [];
  console.log(JSON.stringify({event: 'started', directory, imageId, models, reasoningEffort}));
  for (const [caseIndex, fixture] of fixtures.entries()) {
    if (!selectedCases.includes(fixture.name)) continue;
    for (const model of models) {
      abort.signal.throwIfAborted();
      const jobId = `${fixture.name}-${model}-${reasoningEffort}`;
      const referenceRows = fixtures.slice(0, caseIndex).map(f => f.row).sort((a, b) => a.id.localeCompare(b.id));
      const inputs = {
        query: async (_sql: string, params: string[]) => referenceRows.filter(row => row.id > params[0]).slice(0, 64),
        transaction: store.transaction.bind(store),
        assetBytes: (asset: Asset) => store.assetBytes(asset),
      } as unknown as Store;
      const builder = new BlaxelGameBuilder(inputs, {image: imageId, model, reasoningEffort, evidenceDirectory: directory});
      const startedAt = Date.now();
      const stages: Record<string, number> = {};
      let stage = 'starting';
      const heartbeat = setInterval(() => console.log(JSON.stringify({event: 'progress', jobId, stage, elapsedMs: Date.now() - startedAt})), 30_000);
      console.log(JSON.stringify({event: 'case-started', jobId}));
      try {
        const {job} = fixture;
        const result = await builder.build({jobId, prompt: job.prompt, brief: job.brief, gameId: job.buildGameId, assets: job.previewArt, music: job.previewMusic, icon: job.previewIcon, signal: abort.signal, onStage: async value => {stage = value; stages[value] = Date.now();}});
        const validatedAt = Date.now();
        const version = await store.putVersion(result.source, result.code, result.meta, job.previewArt, job.previewMusic,
          {kind: 'model-benchmark', model, reasoningEffort, imageId, baselineJob: fixture.id, validation: result.reports}, owner.id,
          {runtime: result.runtime, sdkVersion: '1.0.0'}, result.audio, undefined, job.previewIcon);
        const record = {jobId, case: fixture.name, model, reasoningEffort, status: 'published', elapsedMs: Date.now() - startedAt, buildAndValidationMs: validatedAt - startedAt, setupMs: stages.building - startedAt, agentMs: stages.validating - stages.building, independentValidationMs: validatedAt - stages.validating, versionId: version.id, sourceHash: hash(result.source), codeHash: hash(result.code), runtimeHash: hash(result.runtime), usage: result.usage};
        await writeFile(join(directory, jobId, 'published.json'), JSON.stringify({version, runtime: result.runtime}, null, 2));
        results.push(record);
        console.log(JSON.stringify({event: 'case-finished', ...record, usage: undefined}));
      } catch (error) {
        const record = {jobId, case: fixture.name, model, reasoningEffort, status: 'failed', elapsedMs: Date.now() - startedAt, stage, error: (error as Error).message};
        results.push(record);
        console.log(JSON.stringify({event: 'case-finished', ...record}));
      } finally {
        clearInterval(heartbeat);
        await writeFile(join(directory, 'report.json'), JSON.stringify({imageId, results}, null, 2));
      }
    }
  }
} finally {
  await store.close();
}
