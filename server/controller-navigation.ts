import {emptyButtons,type Buttons} from '../sdk/index';
type Reference={path:string[];id?:string|number;idKey?:'id'|'playerId'};
export type NavigationTarget={self:Reference;target:Reference;axes:('x'|'y')[]};
const describe=(value:any)=>Object.fromEntries(Object.entries(value).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v)).slice(0,24).map(([key,v])=>[key,typeof v==='string'?v.slice(0,120):v]));
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const reference=(path:string[],value:any):Reference=>({path,...(typeof value.id==='string'||finite(value.id)?{id:value.id,idKey:'id' as const}:typeof value.playerId==='string'?{id:value.playerId,idKey:'playerId' as const}:{})});
function locate(game:any,ref:Reference){
  let current=game;
  for(let index=0;index<ref.path.length;index++){
    const key=ref.path[index];
    // Track entity identity when arrays reorder after another object disappears.
    if(index===ref.path.length-1&&Array.isArray(current)&&ref.idKey)return current.find(value=>value?.[ref.idKey!]===ref.id);
    if(!current||typeof current!=='object'||!Object.hasOwn(current,key))return undefined;
    current=current[key];
  }
  if(ref.idKey&&current?.[ref.idKey]!==ref.id)return undefined;
  return current;
}
/** Candidate targets use only visible positions. Jev decides which object matters. */
export function navigationChoices(game:any,playerId:string){
  const objects:{ref:Reference;value:any}[]=[],choices:Record<string,{navigation:NavigationTarget;description:unknown}>={};
  let visited=0;
  const visit=(value:any,path:string[],depth:number)=>{
    if(!value||typeof value!=='object'||depth>6||++visited>500||objects.length>=32)return;
    if(finite(value.x)||finite(value.y))objects.push({ref:reference(path,value),value});
    for(const [key,child] of Object.entries(value))visit(child,[...path,key],depth+1);
  };visit(game,[],0);
  const self=objects.find(o=>o.value.id===playerId||o.value.playerId===playerId)??objects.find(o=>o.ref.path.length===0);
  if(!self)return choices;
  for(const target of objects){
    if(self===target)continue;
    const axes=(['x','y'] as const).filter(axis=>finite(self.value[axis])&&finite(target.value[axis]));
    for(const axis of axes){
      if(Object.keys(choices).length>=24)break;
      const key=`align_${Object.keys(choices).length}`;
      choices[key]={navigation:{self:self.ref,target:target.ref,axes:[axis]},description:{intent:`Align YOUR ${axis} with this visible object's ${axis}, then stop within 12 canvas pixels. Use only for continuous canvas coordinates, not discrete grids or normalized positions. The backend follows the object's latest position while this decision remains active.`,objectPath:target.ref.path.join('.'),object:describe(target.value),selfPosition:{x:self.value.x,y:self.value.y}}};
    }
  }
  return choices;
}
/** A target is a motor intention, not a game rule. No scoring or hidden state is read. */
export function navigationButtons(game:any,target:NavigationTarget,held:Buttons):Buttons{
  const buttons={...emptyButtons(),action:held.action},self=locate(game,target.self),other=locate(game,target.target);
  if(!self||!other)return buttons;
  for(const axis of target.axes){
    if(!finite(self[axis])||!finite(other[axis]))continue;
    const difference=other[axis]-self[axis];
    // Twelve canvas pixels avoids oscillation at the 20Hz observation cadence.
    if(Math.abs(difference)<=12)continue;
    buttons[axis==='x'?(difference<0?'left':'right'):(difference<0?'up':'down')]=true;
  }
  return buttons;
}
