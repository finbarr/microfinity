import { z } from 'zod';
export const metadataSchema=z.object({
  id:z.string().regex(/^[a-z0-9-]{1,64}$/), title:z.string().min(1).max(80), instruction:z.string().min(1).max(100),description:z.string().max(500),rules:z.string().max(2000).optional(),
  players:z.tuple([z.number().int().min(1).max(4),z.number().int().min(1).max(4)]).refine(([a,b])=>a<=b),
  clock:z.enum(['realtime','action']), participation:z.enum(['individual','simultaneous','rotating']),world:z.enum(['shared','independent']),
  duration:z.number().min(3).max(120), style:z.enum(['pixel','cartoon','doodle','collage']),
  score:z.object({unit:z.string().max(30),order:z.enum(['higher','lower'])}),
  controls:z.object({directions:z.boolean(),action:z.string().max(24)}),tags:z.array(z.string().max(30)).max(12),
  modifiers:z.array(z.enum(['race','obstruction','pressure'])).max(3)
});
export const edgeSchema=z.object({button:z.enum(['up','down','left','right','action']),down:z.boolean()}).strict();
const assetName=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const cartridgeInfoSchema=z.object({
  meta:metadataSchema,
  assets:z.array(assetName).max(32).refine(names=>new Set(names).size===names.length,'Asset names must be unique'),
  audio:z.object({music:assetName,soundPack:assetName})
});
export function safeJSON(value:unknown,maxBytes=256_000):string {
  let nodes=0;
  const inspect=(v:unknown,depth:number)=>{
    if(depth>32||++nodes>30000)throw new Error('Value nesting/size limit exceeded');
    if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Non-finite number');
    if(typeof v==='string'&&v.length>64000)throw new Error('String limit exceeded');
    if(v&&typeof v==='object')for(const [key,child] of Object.entries(v)){if(key==='__proto__'||key==='constructor'||key==='prototype')throw new Error('Reserved property');inspect(child,depth+1);}
    if(['function','symbol','bigint','undefined'].includes(typeof v))throw new Error('Non-JSON value');
  };inspect(value,0);
  const json=JSON.stringify(value);if(new TextEncoder().encode(json).byteLength>maxBytes)throw new Error('Output size limit exceeded');return json;
}
const arities:Record<string,number>={clear:1,rect:7,circle:5,line:6,path:3,text:6,sprite:7,save:0,restore:0,translate:2,rotate:1,scale:2,opacity:1,clip:4};
export function validateCommands(value:unknown) {
  safeJSON(value,180_000);
  if(!Array.isArray(value)||value.length>1200)throw new Error('Invalid draw buffer');
  let matrix=[1,0,0,1,0,0];const stack:number[][]=[];
  const number=(v:unknown,min=-100000,max=100000)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid drawing number or coordinate limit');};
  const color=(v:unknown,optional=false)=>{if(optional&&v===null)return;if(typeof v!=='string'||!v.length||v.length>128)throw new Error('Invalid drawing color');};
  for(const c of value){
    if(!c||typeof c.op!=='string'||!Object.hasOwn(arities,c.op)||Object.keys(c).some(k=>k!=='op'&&k!=='args')||!Array.isArray(c.args)||c.args.length!==arities[c.op])throw new Error('Invalid draw command');
    const a=c.args;
    switch(c.op){
      case 'clear':color(a[0]);break;
      case 'rect':a.slice(0,4).forEach((v:unknown)=>number(v));color(a[4]);color(a[5],true);number(a[6],0);break;
      case 'circle':number(a[0]);number(a[1]);number(a[2],0);color(a[3]);color(a[4],true);break;
      case 'line':a.slice(0,4).forEach((v:unknown)=>number(v));color(a[4]);number(a[5],.01,512);break;
      case 'path':
        if(!Array.isArray(a[0])||a[0].length<1||a[0].length>256||a[0].some((p:any)=>!Array.isArray(p)||p.length!==2))throw new Error('Invalid path');
        for(const point of a[0])point.forEach((v:unknown)=>number(v));color(a[1]);color(a[2],true);break;
      case 'text':
        if(typeof a[0]!=='string'||a[0].length>240||!['left','center','right'].includes(a[5]))throw new Error('Invalid drawing text');
        number(a[1]);number(a[2]);number(a[3],.01,512);color(a[4]);break;
      case 'sprite':
        if(typeof a[0]!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(a[0]))throw new Error('Invalid asset name');
        a.slice(1,6).forEach((v:unknown)=>number(v));
        if(a[6]!==null){const f=a[6];if(!f||Array.isArray(f)||Object.keys(f).sort().join(',')!=='h,w,x,y')throw new Error('Invalid sprite frame');number(f.x,0);number(f.y,0);number(f.w,.01);number(f.h,.01);}
        break;
      case 'save':if(stack.length>=32)throw new Error('Draw stack limit');stack.push([...matrix]);break;
      case 'restore':if(!stack.length)throw new Error('Unbalanced draw stack');matrix=stack.pop()!;break;
      case 'translate':{
        a.forEach((v:unknown)=>number(v));const [ma,mb,mc,md,mx,my]=matrix;matrix=[ma,mb,mc,md,mx+ma*a[0]+mc*a[1],my+mb*a[0]+md*a[1]];break;
      }
      case 'rotate':{
        number(a[0]);const cos=Math.cos(a[0]),sin=Math.sin(a[0]),[ma,mb,mc,md,mx,my]=matrix;matrix=[ma*cos+mc*sin,mb*cos+md*sin,mc*cos-ma*sin,md*cos-mb*sin,mx,my];break;
      }
      case 'scale':a.forEach((v:unknown)=>number(v,-64,64));matrix=[matrix[0]*a[0],matrix[1]*a[0],matrix[2]*a[1],matrix[3]*a[1],matrix[4],matrix[5]];break;
      case 'opacity':number(a[0],0,1);break;
      case 'clip':a.forEach((v:unknown)=>number(v));break;
    }
    if(matrix.some((n,i)=>!Number.isFinite(n)||Math.abs(n)>(i<4?64:100000)))throw new Error('Drawing transform limit exceeded');
  }
  if(stack.length)throw new Error('Unbalanced draw stack');return value;
}
