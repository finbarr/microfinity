import 'dotenv/config';
import {readdir, readFile} from 'node:fs/promises';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {Store} from '../server/store';
import {bundledCartridgeIcon} from '../server/cartridge-icons';

/** Explicitly publish the bundled references while retaining every historical version and its media. */
export async function seed(store: Store) {
  const existing = new Map((await store.library()).map(v => [v.manifest.gameId, v.manifest]));
  const owned = new Set((await store.query<{id: string}>('SELECT id FROM games WHERE owner_id IS NOT NULL')).map(game => game.id));
  const prepared = [];
  // Check every source and ownership boundary before moving any published pointer.
  for (const file of (await readdir('games')).filter(file => file.endsWith('.ts')).sort()) {
    const source = await readFile(`games/${file}`, 'utf8'), code = await compile(source);
    const vm = await Sandbox.create(code, await bootstrap());
    try {
      const {meta, audio} = vm.call('meta'), saved = existing.get(meta.id);
      if (owned.has(meta.id) || saved && saved.provenance.kind !== 'reference') throw new Error(`Refusing to replace a creator cartridge: ${meta.id}`);
      if (file !== `${meta.id}.ts`) throw new Error(`Reference filename must match its ID: ${file}`);
      prepared.push({source, code, meta, audio, saved});
    } finally {vm.dispose();}
  }
  for (const {source, code, meta, audio, saved} of prepared) {
    const icon = await bundledCartridgeIcon(store, meta.id) ?? saved?.icon;
    await store.putVersion(source, code, meta, saved?.assets ?? [], saved?.music ?? null,
      {...saved?.provenance, kind: 'reference', art: saved?.assets.length ? 'ready' : 'pending',
        music: saved?.music ? 'ready' : 'pending', icon: icon ? 'ready' : 'pending'},
      undefined, undefined, audio, undefined, icon);
    console.log(`Ready: ${meta.title}`);
  }
}
if (process.argv[1]?.endsWith('seed.ts')) {
  const store = new Store();
  await store.init({recoverMatches: false});
  try {await seed(store);} finally {await store.close();}
}
