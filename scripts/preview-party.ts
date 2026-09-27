// Full application and socket server with an isolated database and two short,
// deterministic cartridges. No model worker or external credentials are loaded.
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/store';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';

process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'microfinity-party-preview-'));
process.env.DATABASE_URL = '';
process.env.OPENAI_API_KEY = '';
process.env.BUILDER_WORKER = 'external';
process.env.PORT = '4318';
const store = new Store();
await store.init();
try {
  for (const [id, title] of [['pocket-rally', 'Pocket Rally (fixture)'], ['star-dash', 'Star Dash (fixture)']]) {
    const source = `import {defineGame} from '@microfinity/sdk';
      export default defineGame({
        meta:{id:'${id}',title:'${title}',description:'A short local party test. Tap to score.',instruction:'Tap Space!',clock:'realtime',participation:'individual',world:'independent',duration:3,style:'pixel',score:{unit:'taps',order:'higher'},controls:{directions:false,action:'Tap'},tags:['local fixture']},
        init(ctx){return {id:ctx.players[0].id,count:0};},
        step(s,inputs,ctx){const taps=inputs[s.id].edges.filter(e=>e.button==='action'&&e.down).length;s.count+=taps;ctx.addScore(s.id,taps);if(ctx.time>=2.9){ctx.finishPlayer(s.id,s.count>0?'success':'failure');ctx.finishRound();}},
        observe(s){return {count:s.count};},
        draw(v,g){g.clear('#111b30');g.text('${title}',30,70,25,'#c7fb83');g.text('Tap Space! '+v.count,30,145,24,'#ffffff');}
      });`;
    const code = await compile(source), vm = await Sandbox.create(code, await bootstrap());
    try {await store.putVersion(source, code, vm.call('meta').meta);} finally {vm.dispose();}
  }
} finally {await store.close();}
console.log(`Isolated party preview data: ${process.env.DATA_DIR}`);
await import('../server/index');
