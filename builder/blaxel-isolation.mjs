import {access, readFile, writeFile} from 'node:fs/promises';
import {connect} from 'node:net';

const cannotWrite = async path => {
  try {await writeFile(path, 'isolation probe', {flag: 'wx'}); return false;} catch {return true;}
};
const cannotRead = async path => {
  try {await access(path); return false;} catch {return true;}
};
const blocked = (host, port) => new Promise(resolve => {
  const socket = connect({host, port});
  socket.once('connect', () => {socket.destroy(); resolve(false);});
  socket.once('error', () => resolve(true));
  socket.setTimeout(1500, () => {socket.destroy(); resolve(true);});
});
const writable = async path => {
  try {await writeFile(path, 'isolation probe'); return true;} catch {return false;}
};
const status = await readFile('/proc/self/status', 'utf8');
const proof = {
  uid: process.getuid(),
  nonRoot: process.getuid() === 10001,
  noNewPrivileges: /^NoNewPrivs:\s+1$/m.test(status),
  noCapabilities: /^CapEff:\s+0+$/m.test(status),
  kitReadOnly: await cannotWrite('/kit/isolation-probe'),
  inputsReadOnly: await cannotWrite('/input/isolation-probe'),
  managementHidden: await cannotRead('/bl/metadata'),
  noProviderCredential: !Object.keys(process.env).some(key => /API_KEY|TOKEN|SECRET/.test(key)),
  publicTcpBlocked: await blocked('1.1.1.1', 443),
  metadataTcpBlocked: await blocked('169.254.169.254', 80),
  managementTcpBlocked: await blocked('127.0.0.1', 8080),
  workWritable: await writable('/work/.isolation-probe'),
  scratchWritable: await writable('/scratch/.isolation-probe'),
  routes: await readFile('/proc/net/route', 'utf8'),
};
console.log(JSON.stringify({...proof, ok: Object.entries(proof).every(([key, value]) => ['uid', 'routes'].includes(key) || value === true)}));
