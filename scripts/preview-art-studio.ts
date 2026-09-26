// Offline acceptance studio: real routes, storage, orchestration and UI, with
// deterministic media/model replacements. Never loads credentials or cloud tools.
import express from 'express';
import {createServer} from 'vite';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Store} from '../server/store';
import {Projects, ProjectWorker} from '../server/projects';
import {projectRoutes} from '../server/project-routes';
import {GenerationService} from '../server/generation';
import {compileIsolated} from '../server/compile-process';
import {bootstrap} from '../server/compiler';
import {stockScore} from '../runtime/music';

const root = await mkdtemp(join(tmpdir(), 'microfinity-art-preview-'));
const store = new Store(root, ''); await store.init();
const guest = await store.guest(undefined, 'Studio playtester');
const source = await readFile('games/toast-catch.ts', 'utf8');
const compiled = await compileIsolated(source), runtime = await bootstrap();
const calls = {brief: 0, image: 0, music: 0, build: 0};
let purple = false;
const art = async (cover: boolean) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${cover ? `<rect width="512" height="512" fill="${purple ? '#574471' : '#254553'}"/><circle cx="408" cy="84" r="65" fill="#f7d7ad"/><path d="M0 420 Q120 300 220 400 T512 380 V512 H0Z" fill="#243750"/>` : ''}
    <path d="M180 208 L157 129 227 176 M313 175 L377 125 353 224" fill="#eda6c5" stroke="#322647" stroke-width="12"/>
    <path d="M107 338 Q82 186 228 177 Q380 153 397 312 Q412 438 274 442 Q167 454 107 338Z" fill="#a6d0a8" stroke="#322647" stroke-width="12"/>
    <path d="M158 280 Q186 298 208 276 M293 276 Q322 295 349 274" fill="none" stroke="#322647" stroke-width="12" stroke-linecap="round"/>
    <path d="M228 341 Q256 365 283 336" fill="none" stroke="#322647" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="164" cy="321" rx="24" ry="13" fill="#eda6c5"/><ellipse cx="337" cy="319" rx="24" ry="13" fill="#eda6c5"/>
    ${cover ? '<rect x="83" y="67" width="45" height="46" rx="12" fill="#ffedce" transform="rotate(-16 105 90)"/><rect x="302" y="79" width="36" height="37" rx="10" fill="#ffedce" transform="rotate(20 320 96)"/>' : ''}
  </svg>`;
  return (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
};
process.env.OPENAI_API_KEY = 'local-fixture-only';
const service = new GenerationService(store, {}, async (_url, init) => {
  calls.image++;
  const body = JSON.parse(String(init?.body));
  await new Promise(resolve => setTimeout(resolve, 1400));
  return new Response(JSON.stringify({data: [{b64_json: await art(body.background !== 'transparent')}]}), {headers: {'content-type': 'application/json'}});
}, {generate: async () => {
  calls.music++; await new Promise(resolve => setTimeout(resolve, 2200));
  return {kind: 'score', score: stockScore('toast-catch'), provenance: {provider: 'local-fixture', model: 'local-fixture'}};
}}, {build: async input => {
  calls.build++; await input.onStage?.('building');
  await new Promise(resolve => setTimeout(resolve, 3500));
  await input.onStage?.('validating');
  await new Promise(resolve => setTimeout(resolve, 1200));
  return {...compiled, source, runtime, meta: {...compiled.meta, id: input.gameId, title: input.brief.title}, reports: [{fixture: true}], model: 'local-fixture', usage: []};
}});
(service as any).json = async (_job: unknown, _model: string, _name: string, _schema: unknown, prompt: string) => {
  calls.brief++; purple = /lavender|purple/i.test(prompt);
  return {title: 'Marshmallow Dreams', premise: 'A sleepy dragon. A sky full of marshmallows. Catch a little magic before bedtime.', clock: 'realtime', style: 'cartoon',
    playStyle: 'competitive', controls: 'Left and right move your own dragon; Space catches.', solo: 'Catch three marshmallows to win.', multiplayer: 'Most catches wins.',
    offTurn: 'Not applicable: simultaneous play', assetName: 'sleepy-dragon', assetDescription: 'A sleepy mint-green dragon', musicMood: 'Soft, bouncy lullaby'};
};
const projects = new Projects(store), worker = new ProjectWorker(projects, service);
const app = express(); app.use(express.json());
const auth = async (req: express.Request) => store.authenticate(req.headers.authorization?.replace(/^Bearer /, '') ?? req.headers.cookie?.split('; ').find(c => c.startsWith('microfinity_session='))?.slice(20) ?? '');
app.post('/api/guest', (_req, res) => {res.cookie('microfinity_session', guest.token, {httpOnly: true, sameSite: 'strict'}); res.json(guest);});
app.get('/api/fixture-calls', (_req, res) => res.json(calls));
app.use('/api/projects', projectRoutes(projects, auth));
app.get('/api/versions/:id', async (req, res) => res.json(await store.visibleVersion(req.params.id, (await auth(req)).id)));
app.get('/assets/:file', async (req, res, next) => {
  if (!/^[a-f0-9]{64}\./.test(req.params.file)) return next();
  if (!await store.canReadAsset(req.params.file, (await auth(req)).id)) return res.status(404).end();
  res.sendFile(store.assetPath(req.params.file));
});
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({error: error.message}));
const vite = await createServer({server: {middlewareMode: true}, appType: 'mpa'});
app.use(vite.middlewares);
app.get('/', (_req, res) => res.redirect('/tests/fixtures/art-studio.html'));
const server = app.listen(4317, '127.0.0.1', () => console.log(JSON.stringify({url: 'http://127.0.0.1:4317/tests/fixtures/art-studio.html', data: root, fixtures: true})));
worker.start();
const close = async () => {await worker.close(); server.closeAllConnections(); server.close(); await vite.close(); await store.close(); process.exit(0);};
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
