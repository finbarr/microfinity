import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {readArtifact} from './artifact.mjs';
import {parseReasoningEffort} from './policy.mjs';

const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
await mkdir('/scratch/home', {recursive: true});
await mkdir('/scratch/codex', {recursive: true});
const optional = async path => readFile(path, 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return undefined;
});
const previous = JSON.parse(await optional('/input/session.json') ?? 'null');
if (previous) {
  if (!Array.isArray(previous.files) || previous.files.length > 8) throw Error('Invalid session snapshot');
  for (const file of previous.files) {
    if (!/^sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-[a-zA-Z0-9_.-]+\.jsonl$/.test(file.path)) throw Error('Invalid session path');
    const path = '/scratch/codex/' + file.path;
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, file.text, {flag: 'wx'});
  }
}
const parent = await optional('/input/parent.ts');
if (parent) await writeFile('/work/output.ts', parent);
const witnesses = await optional('/input/witnesses.json');
if (witnesses) await writeFile('/scratch/witnesses.json', witnesses);

// Only this restricted socket reaches the network. No provider credentials here.
const relay = http.createServer((req, res) => {
  const upstream = http.request({socketPath: '/bridge/model.sock', path: req.url,
    method: req.method, headers: {'content-type': 'application/json'}}, response => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {res.writeHead(502); res.end('Model broker unavailable');});
  req.pipe(upstream);
  res.on('close', () => upstream.destroy());
});
await new Promise(resolve => relay.listen(8765, '127.0.0.1', resolve));
const settings = [
  'approval_policy="never"', 'model_provider="broker"',
  'model_providers.broker.name="Turn broker"',
  'model_providers.broker.base_url="http://127.0.0.1:8765/v1"',
  'model_providers.broker.wire_api="responses"',
  'model_providers.broker.supports_websockets=false',
  `model_reasoning_effort="${parseReasoningEffort(process.env.BUILDER_REASONING_EFFORT)}"`,
];
const child = spawn('codex', ['app-server', '--listen', 'stdio://', ...settings.flatMap(s => ['-c', s])], {
  env: {PATH: process.env.PATH, HOME: '/scratch/home', CODEX_HOME: '/scratch/codex', TMPDIR: '/scratch'},
  stdio: ['pipe', 'pipe', 'pipe'],
});
let serial = 0, logBytes = 0, threadId, finished, candidateCount = 0, lastHash;
const pending = new Map();
const send = message => child.stdin.write(JSON.stringify(message) + '\n');
const request = (method, params) => new Promise((resolve, reject) => {
  const id = ++serial;
  pending.set(id, {resolve, reject});
  send({id, method, params});
});
const completed = new Promise((resolve, reject) => {finished = {resolve, reject};});
completed.catch(() => {});
const lines = createInterface({input: child.stdout});
lines.on('line', line => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      const call = pending.get(message.id); pending.delete(message.id);
      if (message.error) call.reject(Error(message.error.message)); else call.resolve(message.result);
    } else if (message.id !== undefined) {
      send({id: message.id, error: {code: -32601, message: 'Unsupported request'}});
    } else if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage' && message.params.item.phase !== 'commentary') {
      const text = message.params.item.text;
      if (typeof text === 'string') emit({type: 'message', text: text.slice(0, 2000)});
    } else if (message.method === 'turn/completed') {
      const turn = message.params.turn;
      if (turn.status === 'completed') finished.resolve();
      else finished.reject(Error(turn.error?.message ?? `Codex turn ${turn.status}`));
    }
  } catch (error) {finished.reject(error);}
});
child.stderr.on('data', bytes => {
  logBytes += bytes.length;
  if (logBytes < 1_000_000) process.stderr.write(bytes);
});
child.on('error', error => {for (const call of pending.values()) call.reject(error); finished.reject(error);});
child.on('exit', code => {
  const error = Error(`Codex process exited ${code}`);
  for (const call of pending.values()) call.reject(error);
  finished.reject(error);
});
child.stdin.on('error', error => finished.reject(error));
let collecting = false;
async function checkpoint() {
  if (collecting || candidateCount >= 16) return;
  collecting = true;
  try {
    const source = await readArtifact('/work/output.ts', 100_000);
    if (source !== await readArtifact('/work/output.ts', 100_000)) return;
    const digest = createHash('sha256').update(source).digest('hex');
    if (digest === lastHash || source === parent) return;
    lastHash = digest; candidateCount++;
    emit({type: 'candidate', source});
  } catch {} finally {collecting = false;}
}
const timer = setInterval(() => void checkpoint(), 20_000);
try {
  await request('initialize', {clientInfo: {name: 'microfinity_builder', version: '1.0.0'}});
  send({method: 'initialized', params: {}});
  const config = {
    model: process.env.BUILDER_MODEL, modelProvider: 'broker', cwd: '/work',
    approvalPolicy: 'never', sandbox: 'danger-full-access',
    developerInstructions: await readFile('/kit/builder/INSTRUCTIONS.md', 'utf8'),
  };
  let thread;
  if (previous) {
    try {thread = await request('thread/resume', {...config, threadId: previous.threadId});}
    catch {emit({type: 'message', text: 'Continuing from your saved game and change history.'});}
  }
  thread ??= await request('thread/start', {...config, ephemeral: false});
  threadId = thread.thread.id;
  emit({type: 'thread', threadId, resumed: !!previous && threadId === previous.threadId});
  await request('turn/start', {threadId, input: [{type: 'text', text: 'Read the current request and pinned inputs in /input. Build or edit the selected game, validate it, and stop when it passes.'}]});
  await completed;
  clearInterval(timer);
  await checkpoint();
  const source = await readArtifact('/work/output.ts', 100_000);
  const traces = JSON.parse(await readArtifact('/scratch/witnesses.json', 200_000));
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.stdin.end();
  const kill = setTimeout(() => child.kill('SIGTERM'), 3000);
  await exited; clearTimeout(kill);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true}).catch(() => [])) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        files.push({path: path.slice('/scratch/codex/'.length), text: await readArtifact(path, 1_500_000)});
      }
    }
  }
  let session;
  try {
    await visit('/scratch/codex/sessions');
    if (files.length && files.length <= 8 && Buffer.byteLength(JSON.stringify(files)) <= 1_500_000) session = {threadId, files};
  } catch {}
  emit({type: 'complete', source, witnesses: traces, session});
} finally {
  clearInterval(timer);
  child.kill('SIGKILL');
  relay.close();
}
