/** Serve a visible canvas regression fixture for browser inspection through CUA. */
import {createServer} from 'node:http';import {build} from 'esbuild';import {writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';
const source=`import {drawCommands} from './client/renderer';import {FeedbackEffects,drawFeedback} from './client/feedback';
const result=document.querySelector('#results');
function check(name,run){const item=document.createElement('li');try{drawCommands(canvas,[c('clear','blue')],new Map(),'cartoon');run();item.textContent='PASS: '+name;}catch(e){item.textContent='FAIL: '+name+' — '+e.message;}result.append(item);}
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const c=(op,...args)=>({op,args});
const blue=()=>{const pixel=ctx.getImageData(400,200,1,1).data;if(pixel[0]!==0||pixel[1]!==0||pixel[2]!==255||pixel[3]!==255)throw new Error('A previous clip leaked into this frame: '+[...pixel]);};
check('A top-level clip is isolated to one frame',()=>{drawCommands(canvas,[c('clip',0,0,10,10),c('clear','red')],new Map(),'cartoon');drawCommands(canvas,[c('clear','blue')],new Map(),'cartoon');blue();});
check('A canvas exception restores nested clipping',()=>{let rejected=false;const broken=document.createElement('canvas');broken.width=0;broken.height=0;try{drawCommands(canvas,[c('save'),c('clip',0,0,1,1),c('sprite','empty',0,0,10,10,0,null),c('restore')],new Map([['empty',broken]]),'cartoon');}catch{rejected=true;}if(!rejected)throw new Error('Expected drawImage to reject the zero-sized canvas');drawCommands(canvas,[c('clear','blue')],new Map(),'cartoon');blue();});
check('Malformed path rejected before painting',()=>{let rejected=false;try{drawCommands(canvas,[c('clear','red'),c('path',[[0,0],[1e200,0]],'red',null)],new Map(),'cartoon');}catch{rejected=true;}if(!rejected)throw new Error('Invalid path was accepted');blue();});
check('Shared hit feedback paints and reduced motion suppresses it',()=>{
 const effects=new FeedbackEffects(),meta={world:'shared',style:'pixel'},view={game:{},playerId:'p0'};
 effects.add([{id:'impact',tick:1,kind:'hit',playerId:'p0',x:320,y:200,text:'+1'}],0);
 const pixels=()=>ctx.getImageData(250,130,140,140).data;
 const before=pixels();drawFeedback(canvas,effects.frame(120,meta,view));const after=pixels();
 if(before.every((x,i)=>x===after[i]))throw new Error('Expected hit particles and reaction text');
 drawCommands(canvas,[c('clear','blue')],new Map(),'pixel');drawFeedback(canvas,effects.frame(120,meta,view,true));const reduced=pixels();
 if(!before.every((x,i)=>x===reduced[i]))throw new Error('Reduced motion must suppress optional feedback');
});
document.querySelector('#summary').textContent=[...result.children].every(x=>x.textContent.startsWith('PASS'))?'All four canvas checks passed.':'A canvas check needs attention.';
drawCommands(canvas,[c('clear','#17203d'),c('text','SHARED FEEDBACK · STATIC SAMPLE',320,45,22,'#e0f2fe','center'),c('text','CATCH',140,290,18,'#86efac','center'),c('text','HIT',320,290,18,'#fde68a','center'),c('text','MISS',500,290,18,'#fda4af','center')],new Map(),'pixel');
const preview=new FeedbackEffects();preview.add([{id:'catch',kind:'catch',x:140,y:200},{id:'hit',kind:'hit',x:320,y:200,text:'+1'},{id:'miss',kind:'miss',x:500,y:200}],0);drawFeedback(canvas,preview.frame(120,{world:'shared',style:'pixel'},{game:{}}));`;
const bundle=(await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
const html=`<!doctype html><meta charset="utf-8"><title>Microfinity renderer regression</title><style>body{font:18px system-ui;margin:32px;max-width:900px}canvas{width:100%;max-width:640px;border:2px solid #222}li{margin:16px 0}</style><h1>Canvas regression checks</h1><p id="summary">Running checks…</p><ul id="results"></ul><canvas width="640" height="400" aria-label="Regression canvas"></canvas><script src="/fixture.js"></script>`;
await mkdir('evidence/runtime',{recursive:true});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:html);});
server.listen(0,'127.0.0.1',async()=>{const address=server.address();if(!address||typeof address==='string')return;const url=`http://127.0.0.1:${address.port}`;await writeFile(resolve('evidence/runtime/renderer-fixture.json'),JSON.stringify({at:new Date().toISOString(),url,method:'Visible regression fixture. Browser inspection is recorded in PLAYTEST.md.'},null,2));console.log(url);});
process.on('SIGINT',()=>server.close());
