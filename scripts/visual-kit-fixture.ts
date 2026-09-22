/** Local visual regression and preview; drive its controls through CUA. */
import {createServer} from 'node:http';import {build} from 'esbuild';import {writeFile,mkdir} from 'node:fs/promises';
const source=`import {Graphics,actorBounds} from './sdk/index';import {drawCommands} from './client/renderer';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),checks=document.querySelector('#checks'),slider=document.querySelector('#time'),reduced=document.querySelector('#reduced'),toggle=document.querySelector('#toggle');
function paint(time,reduce){
 const g=new Graphics('cartoon',[],.1,{time,reducedMotion:reduce});g.clear('#f5ecd6');
 g.text('TINY ACTORS, BIG FEELINGS',320,30,21,'#322637','center');
 const motions=['bounce','squash','stretch','wobble','recoil'];
 motions.forEach((motion,i)=>{const x=70+i*125,age=motion==='bounce'||motion==='wobble'?time:time%.8;
  g.line(x-30,143,x+30,143,'#c6b397',2);g.actor('toast',x,142,54,['#fde68a','#f9a8d4','#86efac','#c4b5fd','#93c5fd'][i],'happy',{anchor:'feet',pose:g.motion(motion,age),blink:false});g.text(motion.toUpperCase(),x,170,14,'#322637','center');});
 ['happy','neutral','sad','angry','surprised','sleepy'].forEach((expression,i)=>{const x=58+i*105;g.actor('snack',x,236,55,'#f4a8a0',expression,{from:'neutral',age:time%1.5,duration:.4,blink:false});g.text(expression.toUpperCase(),x,285,12,'#322637','center');});
 g.actor('cup',130,354,46,'#c4b5fd','happy',{anchor:'feet',blink:g.blink(time)});g.text('BLINK',130,382,14,'#322637','center');
 g.withPose(340,344,g.motion('wobble',time),()=>{g.rect(-60,-23,120,46,'#fde68a','#322637',8);g.face('surprised',0,0,32,{from:'happy',age:time%1.5,duration:.4,blink:false});});g.text('POSE A GROUP',340,382,14,'#322637','center');
 g.text(reduce?'REDUCED MOTION':'OPTIONAL MOTION',528,345,13,'#322637','center');
 drawCommands(canvas,g.commands,new Map(),'cartoon');return ctx.getImageData(0,0,640,400).data;
}
function check(name,run){const li=document.createElement('li');try{run();li.textContent='PASS: '+name;}catch(e){li.textContent='FAIL: '+name+' — '+e.message;}checks.append(li);}
const equal=(a,b)=>a.every((v,i)=>v===b[i]);
check('Different animation times change actual canvas pixels',()=>{if(equal(paint(.08,false),paint(.16,false)))throw Error('No animation');});
check('Reduced motion paints the same pixels at different times',()=>{if(!equal(paint(.08,true),paint(.16,true)))throw Error('Motion remained');});
check('The same presentation time repaints identical pixels',()=>{if(!equal(paint(.13,false),paint(.13,false)))throw Error('Not deterministic');});
check('Blink is visible and the reduced-motion preview suppresses it',()=>{const face=(time,reduce)=>{const g=new Graphics('cartoon',[],0,{time,reducedMotion:reduce});g.clear('#f5ecd6');g.actor('cup',320,200,120);drawCommands(canvas,g.commands,new Map(),'cartoon');return ctx.getImageData(250,100,140,200).data;};if(equal(face(2.8,false),face(2.95,false)))throw Error('No blink');if(!equal(face(2.8,true),face(2.95,true)))throw Error('Blink remained');});
document.querySelector('#summary').textContent=[...checks.children].every(x=>x.textContent.startsWith('PASS'))?'All four visual-kit pixel checks passed.':'A visual-kit check needs attention.';
let playing=false,time=.12,last=performance.now();slider.value=String(time);paint(time,false);
toggle.onclick=()=>{playing=!playing;toggle.textContent=playing?'Pause animation':'Animate';};slider.oninput=()=>{playing=false;toggle.textContent='Animate';time=Number(slider.value);paint(time,reduced.checked);};reduced.onchange=()=>paint(time,reduced.checked);
function frame(now){if(playing){time=(time+Math.min(.05,(now-last)/1000))%3.4;slider.value=String(time);paint(time,reduced.checked);}last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
`;
const bundle=(await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
const html=`<!doctype html><meta charset="utf-8"><title>Microfinity visual kit</title><style>body{font:16px system-ui;background:#f9f5ee;color:#322637;margin:24px;max-width:900px}canvas{width:100%;max-width:800px;border:2px solid #322637}label,button{margin:8px;display:inline-block}input[type=range]{width:220px}li{margin:8px}</style><h1>Visual kit preview</h1><p id="summary">Running checks…</p><ul id="checks"></ul><div><button id="toggle">Animate</button><label>Preview time <input id="time" type="range" min="0" max="3.4" step=".01"></label><label><input id="reduced" type="checkbox">Reduced motion preview</label></div><canvas width="640" height="400" aria-label="Visual kit canvas"></canvas><p>This checkbox tests the presentation flag. It does not change the operating system preference.</p><script src="/fixture.js"></script>`;
await mkdir('evidence/runtime',{recursive:true});const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:html);});
server.listen(0,'127.0.0.1',async()=>{const address=server.address();if(!address||typeof address==='string')return;const url=`http://127.0.0.1:${address.port}`;await writeFile('evidence/runtime/visual-kit-fixture.json',JSON.stringify({at:new Date().toISOString(),url,method:'Actual canvas pixel checks and interactive preview; browser inspection recorded in PLAYTEST.md.'},null,2));console.log(url);});process.on('SIGINT',()=>server.close());
