/** The entire cartridge authoring surface. No browser, network, storage or provider APIs. */
export const SDK_VERSION = '1.0.0';
export const WIDTH = 640, HEIGHT = 400;
export const BUTTONS = ['up', 'down', 'left', 'right', 'action'] as const;
export type Button = typeof BUTTONS[number];
export type Buttons = Record<Button, boolean>;
/** age is engine-owned; browser wire messages cannot set it. */
export type Edge = { button: Button; down: boolean; age?: number };
export type Input = {
  /** held is the final state; a quick tap can be both pressed and released.
   * Use pressed.action for confirmation, or (held.action || pressed.action)
   * with a cooldown for actions that also repeat while held. */
  held: Buttons; pressed: Buttons; released: Buttons;
  edges: Edge[]; x: number; y: number; pressAge: Partial<Record<Button,number>>;
};
export type Inputs = Record<string, Input>;
export type Player = { id: string; name: string; color: string };
export type Style = 'pixel' | 'cartoon' | 'doodle' | 'collage';
export type Outcome = 'success' | 'failure' | 'complete' | 'eliminated';
export type SoundVariant = { pitch?: number; timbre?: 'square' | 'triangle' | 'sine' };
export type FeedbackData = { playerId?: string; x?: number; y?: number; text?: string; sound?: SoundVariant };
export type Feedback = FeedbackData & { id: string; tick: number; kind: string };
export type Metadata = {
  id: string; title: string; instruction: string; description: string;
  /** Optional public rulebook: conditions, units and press/hold/release semantics. No hidden answers. */
  rules?: string;
  players: [number, number]; clock: 'realtime' | 'action';
  participation: 'individual' | 'simultaneous' | 'rotating';
  world: 'shared' | 'independent'; duration: number;
  style: Style; score: { unit: string; order: 'higher' | 'lower' };
  controls: { directions: boolean; action: string };
  tags: string[]; modifiers: ('race' | 'obstruction' | 'pressure')[];
};
export type Context = {
  players: Player[]; tick: number; time: number; duration: number; dt: number; difficulty: number;
  readonly scores: Readonly<Record<string,number>>;
  event: 'tick' | 'input' | 'timeout';
  random(): number; integer(min: number, max: number): number;
  addScore(playerId: string, points: number): void;
  setScore(playerId: string, points: number): void;
  finishPlayer(playerId: string, outcome: Outcome): void;
  finishRound(reason?: string): void;
  /** Optional sound.pitch is a semitone offset (-12..12); variants never alter rules. */
  feedback(kind: string, data?: FeedbackData): void;
};
/** Plain text for the cabinet, computed from this player's already filtered view. */
export type Hud = {message?:string; activePlayerId?:string; items?:{label:string;value:string|number}[]};
export type Game<S = any, V = any> = {
  meta: Metadata; assets?: string[]; audio?: { music: string; soundPack: string };
  init(ctx: Context): S;
  step(state: S, inputs: Inputs, ctx: Context): void;
  observe(state: S, playerId: string, ctx: Readonly<Pick<Context, 'players' | 'tick' | 'time' | 'difficulty'>>): V;
  draw(view: V, gfx: Graphics): void;
  /** Scores, title, instructions and time are automatic; use this for turn/progress/status. */
  hud?(view: V): Hud;
  /** Informational roles and controller validity, never solution-bearing action masks. */
  role?(state: S, playerId: string): string;
};
/** New cartridges omit player limits. Shared games handle ctx.players (1–4);
 * individual games receive one player per engine-managed, equal-seed attempt.
 * Explicit limits remain readable for saved/legacy rule compatibility. */
export type GameDefinition<S = any, V = any> = Omit<Game<S,V>, 'meta'> & {
  meta: Omit<Metadata,'players'|'modifiers'> & {players?:[number,number];modifiers?:Metadata['modifiers']};
};
export function defineGame<S, V>(game: GameDefinition<S, V>): Game<S, V> {
  return {...game,meta:{...game.meta,players:game.meta.players??[1,4],modifiers:game.meta.modifiers??[]}};
}
export const colors = ['#86efac', '#f9a8d4', '#93c5fd', '#fde047'];
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);
export const overlaps = (a: {x:number;y:number;w:number;h:number}, b: {x:number;y:number;w:number;h:number}) => a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
export function move(body: {x:number;y:number}, input: Input, speed: number, dt: number, bounds = {x:0,y:0,w:WIDTH,h:HEIGHT}) {
  body.x=clamp(body.x+input.x*speed*dt,bounds.x,bounds.x+bounds.w);
  body.y=clamp(body.y+input.y*speed*dt,bounds.y,bounds.y+bounds.h);
}
export function focus(index: number, input: Input, count: number, columns = count): number {
  // Ordered press edges preserve even a complete fast tap between engine ticks.
  for (const e of input.edges) if (e.down) {
    const delta = e.button==='left' ? -1 : e.button==='right' ? 1 : e.button==='up' ? -columns : e.button==='down' ? columns : 0;
    index=(index+delta+count)%count;
  }
  return index;
}
export function timer(period: number, time: number, dt: number): boolean { return Math.floor(time/period)>Math.floor((time-dt)/period); }
/** A timed press along a continuous sweep, compensated by at most 150 ms. */
export function timedPress(input:Input,position:number,velocity:number,target:number,halfWidth:number,button:Button='action'){
  const age=clamp(input.pressAge?.[button]??0,0,.15);
  return input.pressed[button]&&Math.abs(position-velocity*age-target)<=halfWidth;
}
export function emptyButtons(): Buttons { return {up:false,down:false,left:false,right:false,action:false}; }
export function emptyInput(): Input { return {held:emptyButtons(),pressed:emptyButtons(),released:emptyButtons(),edges:[],x:0,y:0,pressAge:{}}; }

export type Direction = Exclude<Button,'action'>;
const directions:Direction[]=['up','down','left','right'];
const opposite:Record<Direction,Direction>={up:'down',down:'up',left:'right',right:'left'};
function boundedNumber(value:number,min:number,max:number,name:string){if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be finite and within ${min}..${max}`);return value;}
/** Keep one repeat state per player and menu/phase in init, never at module scope. */
export type DirectionRepeat = {next:Record<Direction,number|null>};
export function createDirectionRepeat():DirectionRepeat{return {next:{up:null,down:null,left:null,right:null}};}
/** Ordered taps plus optional held repeats, using simulation seconds. No action repeat. */
export function directionPresses(input:Input,time:number,repeat?:DirectionRepeat,delay=.32,interval=.12):Direction[]{
  boundedNumber(time,0,1e9,'time');boundedNumber(delay,.05,5,'repeat delay');boundedNumber(interval,.025,2,'repeat interval');
  const result:Direction[]=[],pressed=new Set<Direction>(),held={...input.held};
  for(let i=input.edges.length-1;i>=0;i--)held[input.edges[i].button]=!input.edges[i].down;
  for(const edge of input.edges){
    held[edge.button]=edge.down;
    if(edge.down&&edge.button!=='action'&&!held[opposite[edge.button]]&&!(input.held[edge.button]&&input.held[opposite[edge.button]])){result.push(edge.button);pressed.add(edge.button);}
  }
  if(repeat)for(const button of directions){
    if(!input.held[button]||input.held[opposite[button]]){repeat.next[button]=null;continue;}
    if(pressed.has(button)){repeat.next[button]=time+delay;continue;}
    const next=repeat.next[button];
    if(next===null){result.push(button);repeat.next[button]=time+delay;}
    else if(time+1e-9>=next){
      const due=Math.floor((time-next+1e-9)/interval)+1;
      // A stall cannot produce an unbounded menu jump or a debt of old repeats.
      for(let i=0;i<Math.min(4,due);i++)result.push(button);
      repeat.next[button]=next+due*interval;
    }
  }
  return result;
}
/** A clamped grid cursor. columns=1 is a vertical list; columns=count is horizontal. */
export function focusGrid(index:number,input:Input,count:number,columns=count,repeat?:DirectionRepeat,time=0):number{
  if(!Number.isInteger(count)||count<1||count>256||!Number.isInteger(columns)||columns<1||columns>count)throw new Error('Grid needs 1..256 items and 1..count columns');
  index=clamp(Math.floor(boundedNumber(index,-1e6,1e6,'grid index')),0,count-1);
  for(const direction of directionPresses(input,time,repeat)){
    let x=index%columns,y=Math.floor(index/columns);
    if(direction==='left')x=Math.max(0,x-1);
    if(direction==='right')x=Math.min(Math.min(columns,count-y*columns)-1,x+1);
    if(direction==='up')y=Math.max(0,y-1);
    if(direction==='down')y=Math.min(Math.ceil(count/columns)-1,y+1);
    index=Math.min(count-1,y*columns+x);
  }
  return index;
}

export type ButtonHold={since:number|null};
export function createButtonHold():ButtonHold{return {since:null};}
/** Returns each real release's duration, including zero-length between-tick taps. */
export function trackHold(state:ButtonHold,input:Input,time:number,button:Button='action'):{seconds:number;releases:number[]}{
  boundedNumber(time,0,1e9,'time');const releases:number[]=[];
  for(const edge of input.edges)if(edge.button===button){
    if(edge.down){if(state.since===null)state.since=time;}
    else if(state.since!==null){releases.push(Math.max(0,time-state.since));state.since=null;}
  }
  // Role suppression/cancellation can supply neutral input without a release.
  if(!input.held[button])state.since=null;
  else if(state.since===null)state.since=time;
  return {seconds:state.since===null?0:Math.max(0,time-state.since),releases};
}

/** Rotate with left/right at a fixed rate. Full-circle limits wrap; smaller arcs clamp. */
export function aimAngle(angle:number,input:Input,speed:number,dt:number,min=-Math.PI,max=Math.PI):number{
  boundedNumber(angle,-1e6,1e6,'angle');boundedNumber(speed,0,100,'angular speed');boundedNumber(dt,0,120,'dt');
  boundedNumber(min,-1e6,1e6,'minimum angle');boundedNumber(max,min+1e-9,1e6,'maximum angle');
  const next=angle+(Number(input.held.right)-Number(input.held.left))*speed*dt,span=max-min;
  return span>=Math.PI*2-1e-9?min+((next-min)%span+span)%span:clamp(next,min,max);
}
export type Projectile={x:number;y:number;vx:number;vy:number;life:number};
export function projectile(x:number,y:number,angle:number,speed:number,life=3):Projectile{
  boundedNumber(x,-1e5,1e5,'x');boundedNumber(y,-1e5,1e5,'y');boundedNumber(angle,-1e6,1e6,'angle');boundedNumber(speed,0,1e4,'projectile speed');boundedNumber(life,.01,120,'projectile life');
  return {x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life};
}
/** Mutate then filter: shots = shots.filter(p => stepProjectile(p, ctx.dt)). */
export function stepProjectile(body:Projectile,dt:number,bounds={x:-50,y:-50,w:740,h:500}):boolean{
  boundedNumber(dt,0,120,'dt');const elapsed=Math.min(dt,Math.max(0,body.life));body.x+=body.vx*elapsed;body.y+=body.vy*elapsed;body.life=Math.max(0,body.life-dt);
  return body.life>0&&body.x>=bounds.x&&body.y>=bounds.y&&body.x<=bounds.x+bounds.w&&body.y<=bounds.y+bounds.h;
}
export type SpawnClock={next:number;serial:number};
export function createSpawnClock(firstAt=0):SpawnClock{return {next:boundedNumber(firstAt,0,1e9,'first spawn time'),serial:0};}
/** Bounded catch-up without losing events; overdue work remains for the next step. */
export function spawnDue(clock:SpawnClock,time:number,period:number,limit=8):{id:number;time:number}[]{
  boundedNumber(time,0,1e9,'time');boundedNumber(period,.01,120,'spawn period');if(!Number.isInteger(limit)||limit<1||limit>64)throw new Error('Spawn batch limit must be 1..64');
  const due=[];while(clock.next<=time+1e-9&&due.length<limit){due.push({id:clock.serial++,time:clock.next});clock.next+=period;}return due;
}

export type SequenceState={pattern:Button[];index:number;deadline:number;secondsPerPress:number;result:'waiting'|'complete'|'wrong'|'timeout'};
export function createSequence(pattern:readonly Button[],time:number,secondsPerPress=1.2):SequenceState{
  boundedNumber(time,0,1e9,'time');boundedNumber(secondsPerPress,.05,60,'sequence window');
  if(pattern.length<1||pattern.length>32||pattern.some(b=>!BUTTONS.includes(b)))throw new Error('Sequence needs 1..32 controller buttons');
  return {pattern:[...pattern],index:0,deadline:time+secondsPerPress,secondsPerPress,result:'waiting'};
}
/** Feed ordered edges once per step. Several prompts can advance at once: score the index or its delta. Every correct press renews the deadline; call on realtime steps to expire without input. */
export function advanceSequence(state:SequenceState,input:Input,time:number):SequenceState['result']{
  boundedNumber(time,0,1e9,'time');if(state.result!=='waiting')return state.result;
  if(time>state.deadline+1e-9)return state.result='timeout';
  for(const edge of input.edges)if(edge.down){
    if(edge.button!==state.pattern[state.index])return state.result='wrong';
    state.index++;if(state.index===state.pattern.length)return state.result='complete';state.deadline=time+state.secondsPerPress;
  }
  return state.result;
}

export type ActorKind='ship'|'toast'|'hand'|'umbrella'|'cup'|'snack'|'parcel'|'asteroid'|'star';
export type Expression='happy'|'neutral'|'sad'|'angry'|'surprised'|'sleepy';
export type Pose={x:number;y:number;scaleX:number;scaleY:number;rotation:number};
export type Motion='bounce'|'squash'|'stretch'|'wobble'|'recoil';
export type FaceOptions={from?:Expression;age?:number;duration?:number;blink?:boolean};
export type ActorOptions=FaceOptions&{pose?:Pose;anchor?:'center'|'feet'};
const actorBoxes:Record<ActorKind,[number,number,number,number]>={ship:[-19,-24,38,54],toast:[-20,-26,40,47],hand:[-27,-14,54,29],umbrella:[-29,-25,58,50],cup:[-25,-27,50,49],snack:[-21,-24,42,45],parcel:[-20,-18,40,36],asteroid:[-23,-21,47,42],star:[-24,-24,48,48]};
/** Conservative unanimated visual bounds including strokes; never an automatic hitbox. */
export function actorBounds(kind:ActorKind,size=40,anchor:'center'|'feet'='center'){
  boundedNumber(size,1,640,'actor size');if(!Object.hasOwn(actorBoxes,kind))throw new Error('Unknown actor');
  const [x,y,w,h]=actorBoxes[kind],scale=size/40;return {x:x*scale,y:(anchor==='feet'?-h:y)*scale,w:w*scale,h:h*scale};
}
const expressions:Record<Expression,{eyes:number;curve:number;open:number;brow:number}>={happy:{eyes:1,curve:4,open:0,brow:0},neutral:{eyes:1,curve:0,open:0,brow:0},sad:{eyes:.8,curve:-3,open:0,brow:-3},angry:{eyes:.7,curve:-2,open:0,brow:3},surprised:{eyes:1.4,curve:0,open:4,brow:-1},sleepy:{eyes:0,curve:0,open:0,brow:0}};
export type DrawCommand = { op: string; args: any[] };
export class Graphics {
  readonly commands: DrawCommand[] = [];
  readonly time:number;readonly reducedMotion:boolean;
  constructor(public style: Style = 'cartoon',private availableAssets:string[]=[],private renderAhead=0,presentation:{time?:number;reducedMotion?:boolean}={}) {
    this.time=Number.isFinite(presentation.time)?clamp(presentation.time!,0,1e9):0;this.reducedMotion=presentation.reducedMotion===true;
  }
  /** Optional presentation only. Bounce/wobble loop; squash/stretch/recoil end at duration. */
  motion(kind:Motion,age=this.time,options:{duration?:number;amount?:number}={}):Pose{
    if(!['bounce','squash','stretch','wobble','recoil'].includes(kind))throw new Error('Unknown motion');
    boundedNumber(age,-1e9,1e9,'animation age');const duration=boundedNumber(options.duration??(kind==='bounce'?.6:kind==='wobble'?.8:.22),.05,10,'animation duration');
    const amount=boundedNumber(options.amount??(kind==='bounce'?7:kind==='recoil'?6:kind==='wobble'?.12:.18),0,kind==='bounce'||kind==='recoil'?24:kind==='wobble'?.35:.3,'animation amount');
    const pose={x:0,y:0,scaleX:1,scaleY:1,rotation:0};if(this.reducedMotion||age<0)return pose;
    if(kind==='bounce')pose.y=-amount*Math.abs(Math.sin(Math.PI*(age%duration)/duration));
    else if(kind==='wobble')pose.rotation=amount*Math.sin(Math.PI*2*(age%duration)/duration);
    else if(age<duration){const wave=amount*Math.sin(Math.PI*age/duration);
      if(kind==='squash'){pose.scaleX=1+wave;pose.scaleY=1/(1+wave);}
      if(kind==='stretch'){pose.scaleY=1+wave;pose.scaleX=1/(1+wave);}
      if(kind==='recoil')pose.x=-amount*(1-age/duration)**2;
    }
    return pose;
  }
  /** Apply a pose around the given anchor to actors, sprites or any small drawing group. */
  withPose(x:number,y:number,pose:Pose,draw:()=>void){
    boundedNumber(x,-1e5,1e5,'anchor x');boundedNumber(y,-1e5,1e5,'anchor y');
    boundedNumber(pose.x,-1000,1000,'pose x');boundedNumber(pose.y,-1000,1000,'pose y');boundedNumber(pose.scaleX,.1,8,'pose scale');boundedNumber(pose.scaleY,.1,8,'pose scale');boundedNumber(pose.rotation,-Math.PI*2,Math.PI*2,'pose rotation');
    this.save();try{this.translate(x+pose.x,y+pose.y);this.rotate(pose.rotation);this.scale(pose.scaleX,pose.scaleY);draw();}finally{this.restore();}
  }
  blink(time=this.time,period=3,duration=.12){
    boundedNumber(time,0,1e9,'blink time');boundedNumber(period,.5,30,'blink period');boundedNumber(duration,.03,Math.min(.3,period/2),'blink duration');
    return !this.reducedMotion&&time%period>=period-duration;
  }
  /** Standalone expressive features; a transition changes presentation, never game state. */
  face(expression:string,x:number,y:number,size=40,options:FaceOptions={}){
    boundedNumber(size,1,640,'face size');const target=expressions[Object.hasOwn(expressions,expression)?expression as Expression:'neutral'];
    const from=options.from&&Object.hasOwn(expressions,options.from)?expressions[options.from]:target;
    const duration=boundedNumber(options.duration??.18,.05,1,'expression duration'),age=boundedNumber(options.age??duration,-1e9,1e9,'expression age');
    const t=this.reducedMotion?1:clamp(age/duration,0,1),mix=(a:number,b:number)=>a+(b-a)*t,eyes=mix(from.eyes,target.eyes),curve=mix(from.curve,target.curve),open=mix(from.open,target.open),brow=mix(from.brow,target.brow),ink='#322637';
    this.save();try{this.translate(x,y);this.scale(size/40);
      for(const eye of [-7,7]){
        if(eyes<.1||(!this.reducedMotion&&(options.blink??this.blink())))this.line(eye-2,-2,eye+2,-2,ink,2);
        else this.rect(eye-2.2,-2-2.2*eyes,4.4,4.4*eyes,ink,undefined,2);
        if(Math.abs(brow)>.1){const sign=eye<0?1:-1;this.line(eye-3,-9-brow*sign/2,eye+3,-9+brow*sign/2,ink,1.5);}
      }
      if(open>.3)this.circle(0,7,open,ink);
      else this.path([[-5,6],[-2.5,6+curve*.75],[0,6+curve],[2.5,6+curve*.75],[5,6]],'transparent',ink);
    }finally{this.restore();}
  }
  /** Project only explicitly supplied public motion. No rule state is advanced. */
  project(value:number,velocity:number,min=-100000,max=100000){return clamp(value+velocity*clamp(this.renderAhead,0,.25),min,max);}
  hasAsset(name:string){return this.availableAssets.includes(name);}
  private push(op: string, ...args: any[]) {
    if (this.commands.length >= 1200) throw new Error('Drawing budget exceeded (1200 commands)');
    this.commands.push({op,args});
  }
  clear(color: string) { this.push('clear',color); }
  rect(x:number,y:number,w:number,h:number,fill:string,stroke?:string,radius=0) { this.push('rect',x,y,w,h,fill,stroke??null,radius); }
  circle(x:number,y:number,r:number,fill:string,stroke?:string) { this.push('circle',x,y,r,fill,stroke??null); }
  line(x1:number,y1:number,x2:number,y2:number,color:string,width=3) { this.push('line',x1,y1,x2,y2,color,width); }
  path(points: number[][], fill:string, stroke?:string) { this.push('path',points,fill,stroke??null); }
  text(text:string,x:number,y:number,size=24,color='#fff',align:'left'|'center'|'right'='left') { this.push('text',String(text).slice(0,240),x,y,size,color,align); }
  sprite(name:string,x:number,y:number,w:number,h:number,rotation=0,frame?:{x:number;y:number;w:number;h:number}) { this.push('sprite',name,x,y,w,h,rotation,frame??null); }
  save() { this.push('save'); } restore() { this.push('restore'); }
  translate(x:number,y:number) { this.push('translate',x,y); }
  rotate(radians:number) { this.push('rotate',radians); }
  scale(x:number,y=x) { this.push('scale',x,y); }
  opacity(alpha:number) { this.push('opacity',clamp(alpha,0,1)); }
  clip(x:number,y:number,w:number,h:number) { this.push('clip',x,y,w,h); }
  label(text:string,x:number,y:number,color='#fef3c7') {
    const w=Math.min(590,text.length*11+30); this.rect(x-w/2,y-24,w,36,color,'#25213b',8); this.text(text,x,y,17,'#25213b','center');
  }
  backdrop(kind:'space'|'kitchen'|'rain'|'paper'|'stage'|'factory',time=0) {
    if(this.reducedMotion)time=0;
    const palette={space:'#17203d',kitchen:'#f5dcc1',rain:'#273756',paper:'#f5ecd6',stage:'#5c3764',factory:'#273a38'};
    this.clear(palette[kind]);
    if(kind==='space') for(let i=0;i<44;i++) this.rect((i*113+31)%640,(i*i*29+time*9)%400,2+(i%2),2,'#aec2e5');
    if(kind==='kitchen') { for(let i=0;i<16;i++) this.line(i*48,0,i*48,340,'#ebcbb2',2);this.rect(0,340,640,60,'#c58b69');this.rect(0,340,640,8,'#a87359'); }
    if(kind==='rain') for(let i=0;i<35;i++) {const x=(i*89)%640,y=(i*71+time*70)%400;this.line(x,y,x-4,y+13,'#7184ac',2);}
    if(kind==='paper') for(let y=30;y<400;y+=28)this.line(0,y,640,y,'#e7dbbe',1);
    if(kind==='stage') {this.rect(0,330,640,70,'#392942');for(let i=0;i<7;i++)this.rect(i*108,0,18,330,'#4a2c54');}
    if(kind==='factory') {for(let i=0;i<6;i++)this.line(0,65+i*52,640,65+i*52,'#3d514d',2);this.rect(0,350,640,50,'#1c2b29');}
  }
  actor(kind:ActorKind,x:number,y:number,size=40,color='#fde68a',expression='happy',options:ActorOptions={}) {
    const bounds=actorBounds(kind,size),pose=options.pose??{x:0,y:0,scaleX:1,scaleY:1,rotation:0};
    this.withPose(x,y,pose,()=>{
    if(options.anchor==='feet')this.translate(0,-(bounds.y+bounds.h));
    const s=size/40;this.scale(s);
    if(kind==='ship') {this.path([[0,-23],[18,18],[0,10],[-18,18]],color,'#17203d');this.rect(-5,-8,10,13,'#e0f2fe');this.path([[-6,18],[0,29],[6,18]],'#fb923c');}
    else if(kind==='asteroid') {this.path([[-19,-8],[-8,-20],[13,-16],[23,2],[10,20],[-12,17],[-22,3]],color,'#554d73');this.circle(-7,-4,5,'#82758f');this.circle(7,8,3,'#82758f');}
    else if(kind==='toast') {this.rect(-18,-15,36,34,'#c88745','#664329',7);this.circle(-9,-15,10,'#c88745');this.circle(9,-15,10,'#c88745');this.rect(-13,-18,26,31,color,undefined,6);}
    else if(kind==='hand') {this.rect(-26,-3,52,17,color,'#9a6550',8);for(let i=0;i<4;i++)this.rect(-22+i*12,-13,10,24,color,undefined,5);}
    else if(kind==='umbrella') {this.path([[-28,1],[-22,-14],[-10,-24],[9,-24],[23,-13],[28,1]],color,'#17203d');this.line(0,0,0,23,'#f8fafc',3);this.line(0,23,9,23,'#f8fafc',3);}
    else if(kind==='cup') {this.path([[-23,-24],[23,-24],[17,21],[-17,21]],color,'#33233b');this.rect(-24,-26,48,7,'#f5e7cd',undefined,3);}
    else if(kind==='parcel') {this.rect(-19,-17,38,34,color,'#423927',3);this.rect(-4,-17,8,34,'#f5e9cb');this.rect(-19,-3,38,6,'#f5e9cb');}
    else if(kind==='star') {const p=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?10:23;p.push([Math.cos(a)*r,Math.sin(a)*r]);}this.path(p,color,'#bd8f30');}
    else {this.circle(0,0,20,color,'#5c3e4e');this.circle(-12,-16,7,color);this.circle(12,-16,7,color);}
    if(['toast','cup','snack','parcel'].includes(kind))this.face(expression,0,0,40,options);
    });
  }
}
