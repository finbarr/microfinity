import {cp, mkdir, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Upload only the runtime toolkit; never the checkout, .env, history or artifacts.
const destination = resolve(process.argv[2] ?? 'artifacts/blaxel-image');
const name = process.argv[3] ?? 'microfinity-builder';
if (!/^microfinity-[a-z0-9-]+$/.test(name)) throw Error('Invalid image name');
await mkdir(destination, {recursive: true});
if ((await readdir(destination)).length) throw Error('Image staging directory must be empty; choose a fresh directory');
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'builder', 'sdk', 'runtime',
  'server/compiler.ts', 'server/compile-process.ts', 'server/compile-child.ts', 'client/renderer.ts']) {
  await mkdir(resolve(destination, file, '..'), {recursive: true});
  await cp(resolve(file), resolve(destination, file), {recursive: true});
}
await cp('builder/Containerfile', resolve(destination, 'Dockerfile'));
await writeFile(resolve(destination, 'blaxel.toml'), `name = "${name}"\ntype = "sandbox"\n[runtime]\ngeneration = "mk3"\nmemory = 4096\n`);
console.log(JSON.stringify({directory: destination, name, next: 'Run bl push -y FROM this directory. Do not use --directory from the checkout.'}));
