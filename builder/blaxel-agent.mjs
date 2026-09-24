import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Bound exported logs without applying RLIMIT_FSIZE to Chromium's temporary
// shared-memory files. This supervisor runs outside the agent's namespaces.
const limit = max => {
  let bytes = 0;
  return new Transform({transform(chunk, _encoding, done) {
    bytes += chunk.length;
    done(bytes > max ? Error('Builder output limit exceeded') : null, chunk);
  }});
};
const child = spawn('/kit/builder/blaxel-run.sh', ['node', '/kit/builder/entry.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', code => resolve(code ?? 1));
});
try {
  const [, , code] = await Promise.all([
    pipeline(child.stdout, limit(8_000_000), createWriteStream('/control/events.jsonl', {mode: 0o600})),
    pipeline(child.stderr, limit(1_000_000), createWriteStream('/control/agent.log', {mode: 0o600})),
    exited,
  ]);
  process.exitCode = code;
} catch (error) {
  child.kill('SIGKILL');
  await exited.catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
}
