import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {GenerationService, type GenerationInput, type MediaState} from '../server/generation';
import {hash, type Store} from '../server/store';
import {stockScore} from '../runtime/music';

const brief = {title: 'Toast', premise: 'Catch toast', clock: 'realtime', style: 'cartoon', assetName: 'toast', assetDescription: 'Toast', musicMood: 'bouncy'};
async function fixture(options: {music?: any; builder?: any; limits?: any; fetch?: typeof fetch} = {}) {
  const writes: any[] = [], builds: any[] = [];
  const store = {putAsset: async (bytes: Buffer, extension: string, projectId: string) => {assert.equal(projectId, 'private-project'); return {hash: hash(bytes), url: `/assets/${hash(bytes)}.${extension}`};}} as unknown as Store;
  const png = (await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="50" y="50" width="150" height="150" fill="#abcdef"/></svg>')).png().toBuffer()).toString('base64');
  const service = new GenerationService(store, options.limits, options.fetch ?? (async () => new Response(JSON.stringify({data: [{b64_json: png}]}), {headers: {'content-type': 'application/json'}})), options.music ?? {generate: async () => ({kind: 'score', score: stockScore('toast-catch'), provenance: {provider: 'fixture', model: 'fixture'}})}, options.builder ?? {build: async (input: any) => {builds.push(input); return {source: 'fixture', code: 'fixture', runtime: 'fixture', reports: [], model: 'fixture'};}});
  (service as any).json = async () => brief;
  const input: GenerationInput = {jobId: 'turn', projectId: 'private-project', ownerId: 'owner', gameId: 'game', prompt: 'Catch toast before it falls', media: {}, signal: new AbortController().signal, onProgress: async (progress, media) => {writes.push({progress: structuredClone(progress), media: structuredClone(media)});}};
  return {service, input, writes, builds};
}

test('media checkpoints complete before Codex; subsequent edits reuse exact media', async () => {
  process.env.OPENAI_API_KEY ??= 'fixture-only';
  const f = await fixture(); const first = await f.service.run(f.input);
  assert.equal(f.builds.length, 1); assert.ok(first.media.assets?.length); assert.ok(first.media.music); assert.ok(first.media.icon);
  assert.ok(f.writes.at(-1).media.music);
  const again = await f.service.run({...f.input, media: first.media});
  assert.deepEqual(again.media, first.media); assert.equal(f.builds.length, 2);
  assert.equal(f.writes.at(-1).progress.branches.music, 'reused');
});

test('media failure blocks Codex and preserved checkpoints avoid redoing completed branches', async () => {
  let fail = true;
  const f = await fixture({music: {generate: async () => {if (fail) throw Error('Music unavailable'); return {kind: 'score', score: stockScore('toast-catch'), provenance: {provider: 'fixture', model: 'fixture'}};}}});
  await assert.rejects(() => f.service.run(f.input), /Music unavailable/);
  assert.equal(f.builds.length, 0);
  const checkpoint: MediaState = f.writes.at(-1).media; assert.ok(checkpoint.assets?.length); assert.ok(checkpoint.icon);
  fail = false; const repaired = await f.service.run({...f.input, media: checkpoint});
  assert.deepEqual(repaired.media.assets, checkpoint.assets); assert.deepEqual(repaired.media.icon, checkpoint.icon);
});

test('deadline aborts ignored media calls and prevents late checkpoints or builds', async () => {
  let finish: any, signal: AbortSignal | undefined;
  const f = await fixture({limits: {timeoutMs: 1000}, music: {generate: async (_: any, context: any) => {signal = context.signal; return new Promise(resolve => {finish = resolve;});}}});
  const keepAlive=setInterval(()=>{},100);try{await assert.rejects(() => f.service.run(f.input), /work deadline/);}finally{clearInterval(keepAlive);} assert.ok(signal?.aborted);
  const count = f.writes.length;
  finish({kind: 'score', score: stockScore('toast-catch'), provenance: {provider: 'fixture', model: 'late'}});
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(f.writes.length, count); assert.equal(f.builds.length, 0);
});

test('outer cancellation reaches Codex and waits for its cleanup', async () => {
  const controller = new AbortController(); let started: () => void = () => {}, cleaned = false;
  const ready = new Promise<void>(resolve => {started = resolve;});
  const f = await fixture({builder: {build: async (input: any) => {
    started(); await new Promise(resolve => input.signal.addEventListener('abort', resolve, {once: true}));
    cleaned = true; input.signal.throwIfAborted();
  }}});
  const running = f.service.run({...f.input, signal: controller.signal}); await ready; controller.abort(Error('Stopped by creator'));
  await assert.rejects(running, /Stopped by creator/); assert.equal(cleaned, true);
});
