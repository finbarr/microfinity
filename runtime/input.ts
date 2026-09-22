import { BUTTONS, emptyButtons, type Button, type Buttons, type Edge, type Input } from '../sdk/index';

/** Physical sources are independent: keyboard aliases, two touch contacts, and bots. */
export class InputCollector {
  private sources = new Map<string, Set<Button>>();
  private held: Buttons = emptyButtons();
  private pending: Edge[] = [];
  private suppressAction = false;
  set(source: string, buttons: Button[]) {
    this.sources.set(source,new Set(buttons));
    const next=emptyButtons();
    for(const set of this.sources.values()) for(const b of set) next[b]=true;
    if(this.suppressAction && !next.action) this.suppressAction=false;
    for(const b of BUTTONS) if(next[b]!==this.held[b]) this.pending.push({button:b,down:next[b]});
    this.held=next;
  }
  release(source: string) { this.set(source,[]);this.sources.delete(source); }
  clear() { for(const source of [...this.sources.keys()]) this.release(source); }
  transition() { this.suppressAction=this.held.action;this.pending=[]; }
  drain(): Edge[] {
    const edges=this.pending;this.pending=[];
    return this.suppressAction ? edges.filter(e=>e.button!=='action') : edges;
  }
  getHeld() { return {...this.held,action:this.held.action&&!this.suppressAction}; }
}
export function advanceInput(previous: Buttons, edges: Edge[]): Input {
  const held={...previous}, pressed=emptyButtons(),released=emptyButtons(),accepted:Edge[]=[],pressAge:Input['pressAge']={};
  for(const edge of edges) {
    if(!BUTTONS.includes(edge.button)||typeof edge.down!=='boolean') throw new Error('Invalid controller edge');
    if(held[edge.button]===edge.down) continue;
    held[edge.button]=edge.down;accepted.push({...edge});
    (edge.down?pressed:released)[edge.button]=true;
    if(edge.down)pressAge[edge.button]=Number.isFinite(edge.age)?Math.max(0,Math.min(.15,edge.age!)):0;
  }
  let x=Number(held.right)-Number(held.left), y=Number(held.down)-Number(held.up);
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  return {held,pressed,released,edges:accepted,x,y,pressAge};
}
export function buttonEdges(from:Buttons,to:Buttons):Edge[] { return BUTTONS.filter(b=>from[b]!==to[b]).map(button=>({button,down:to[button]})); }
export const keyMap: Record<string,Button>={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'action'};
export function padButtons(x:number,y:number):Button[] {
  if(Math.hypot(x,y)<0.22)return [];
  const a=Math.atan2(y,x),sector=((Math.round(a/(Math.PI/4))+8)%8);
  return [['right'],['right','down'],['down'],['down','left'],['left'],['left','up'],['up'],['up','right']][sector] as Button[];
}
