import http from 'node:http';
import {chmod, readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// This process has no credentials. The trusted orchestrator handles requests
// through the authenticated management API, enforcing ModelPolicy off the VM.
let serial = 0;
let active = false;
const server = http.createServer(async (req, res) => {
  let ownsSlot = false;
  try {
    if (req.method !== 'POST' || req.url !== '/v1/responses' || active) {
      throw Error('Only one Responses request is allowed at a time');
    }
    active = true;
    ownsSlot = true;
    const id = ++serial;
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 2_000_000) throw Error('Request too large');
    }
    await writeFile('/control/request.tmp', JSON.stringify({id, body: JSON.parse(raw)}));
    await rename('/control/request.tmp', '/control/request.json');
    const deadline = Date.now() + 180_000;
    while (!res.destroyed && Date.now() < deadline) {
      const reply = await readFile(`/control/response-${id}.json`, 'utf8').catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (reply) {
        const {status, body} = JSON.parse(reply);
        res.writeHead(status, {'Content-Type': status === 200 ? 'text/event-stream' : 'application/json'});
        res.end(body);
        await unlink(`/control/response-${id}.json`);
        return;
      }
      await delay(100);
    }
    throw Error('Model bridge timed out');
  } catch (error) {
    if (!res.headersSent) res.writeHead(502, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: {message: error.message}}));
  } finally {
    if (ownsSlot) active = false;
  }
});
server.requestTimeout = 60_000;
server.maxConnections = 4;
server.listen('/bridge/model.sock', async () => {
  await chmod('/bridge/model.sock', 0o666);
  console.log('ready');
});
