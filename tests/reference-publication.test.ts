import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store';
import {seed} from '../scripts/seed';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';

test('reference publication retains historical versions and media, is idempotent, and rejects creator ID collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'microfinity-reference-release-')), store = new Store(root, '');
  try {
    await store.init();
    const source = await readFile('games/toast-catch.ts', 'utf8'), code = await compile(source);
    const vm = await Sandbox.create(code, await bootstrap()), {meta, audio} = vm.call('meta'); vm.dispose();
    const asset = {...await store.putAsset(Buffer.from('preserved artwork'), 'png'), name: 'toast', width: 32, height: 32};
    const old = await store.putVersion('// previous release\n' + source, code, meta, [asset], {title: 'original music'}, {kind: 'reference'}, undefined, undefined, audio);
    const guest = await store.guest(undefined, 'Reference release test');
    const custom = await store.putVersion(source, code, {...meta, id: 'user-created-game'}, [], null, {kind: 'generated'}, guest.id);
    await store.finishRound('preserved-match', 0, old.id, [{playerId: 'p0', guestId: guest.id, score: 8, partition: 'test'}]);
    await seed(store);
    let library = await store.library(); assert.equal(library.length, 11);
    const current = library.find(v => v.manifest.gameId === meta.id)!.manifest;
    assert.notEqual(current.id, old.id); assert.deepEqual(current.assets, [asset]); assert.deepEqual(current.music, old.manifest.music);
    assert.equal((await store.version(old.id)).source, old.source);
    assert.equal(library.find(v => v.manifest.gameId === custom.game_id)!.manifest.id, custom.id);
    assert.equal((await store.query('SELECT score FROM results'))[0].score, 8);
    const ids = library.map(v => v.manifest.id).sort();
    await seed(store); assert.deepEqual((await store.library()).map(v => v.manifest.id).sort(), ids);
    await store.query('UPDATE games SET owner_id=$1 WHERE id=$2', [guest.id, 'umbrella-panic']);
    await assert.rejects(() => seed(store), /Refusing to replace a creator cartridge: umbrella-panic/);
    assert.deepEqual((await store.library()).map(v => v.manifest.id).sort(), ids, 'collision aborts before any reference is published');
  } finally {await store.close(); await rm(root, {recursive: true, force: true});}
});
