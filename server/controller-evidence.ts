/** Arithmetic over public observations, independent of cartridge ID or controller type.
 * These are labelled estimates, never an action mask or a replacement game simulation. */
export function motionEvidence(game:any,playerId:string,delaySeconds:number,history:any[]=[]){
  const measurements:any[]=[],comparisons:any[]=[],spatial:any[]=[];
  if(!game||typeof game!=='object')return {measurements,comparisons,spatial};
  const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
  const wrap=(n:number,period:number)=>((n%period)+period)%period;
  const round=(n:number)=>Math.round(n*10000)/10000;
  const travel=finite(game.travel)?game.travel:finite(game.travelSeconds)?game.travelSeconds:0;
  const axes:Record<string,string[]>={x:['vx','velocityX'],y:['vy','velocityY'],angle:['angularVelocity','angularSpeed','speed'],phase:['rate','speed']};
  let visited=0;
  const visit=(object:any,path:string,depth:number)=>{
    if(!object||typeof object!=='object'||depth>6||++visited>300)return;
    const owner=object.id??object.playerId;
    // Keep global evidence and this player's motion; raw observations retain all opponents.
    if(typeof owner==='string'&&/^p[0-3]$/.test(owner)&&owner!==playerId)return;
    for(const [axis,rates] of Object.entries(axes)){
      const rateKey=rates.find(key=>finite(object[key]));
      if(!finite(object[axis])||!rateKey)continue;
      const value=object[axis],rate=object[rateKey];
      // Phase progression can stop during holds/recovery; report that assumption explicitly.
      const samples:{at:string;seconds:number;linearValue:number;wrappedRadians?:number;wrappedUnitPhase?:number}[]=[{at:'observation',seconds:0},{at:'response',seconds:delaySeconds},...(travel>0&&travel<=5?[{at:'response_plus_travel',seconds:delaySeconds+travel}]:[])].map(({at,seconds})=>{
        const raw=value+rate*seconds;
        return {at,seconds:round(seconds),linearValue:round(raw),...(axis==='angle'?{wrappedRadians:round(wrap(raw,Math.PI*2))}:axis==='phase'?{wrappedUnitPhase:round(wrap(raw,1))}:{})};
      });
      measurements.push({path:`${path}.${axis}`,ratePath:`${path}.${rateKey}`,stage:object.stage,assumption:'Constant visible rate; use only while this motion is active. angle wrap assumes radians; phase wrap assumes a 0..1 cycle. Check rules.',samples});
      const target=finite(object.target)?object.target:finite(game.target)?game.target:undefined;
      const half=finite(object.half)?object.half:finite(game.half)?game.half:undefined;
      if(axis==='phase'&&target!==undefined){
        comparisons.push({moving:`${path}.${axis}`,target,halfWidth:half,samples:samples.map(sample=>{
          const error=sample.wrappedUnitPhase!-target;
          return {at:sample.at,signedError:round(error),absoluteError:round(Math.abs(error)),...(half===undefined?{}:{withinWindow:Math.abs(error)<=half})};
        })});
      }
      if(axis==='angle'&&path==='visibleNow'){
        // Compare a global moving angle with any visible angle owned by this player.
        const collect=(value:any,targetPath:string,level:number)=>{
          if(!value||typeof value!=='object'||level>5)return;
          if((value.id===playerId||value.playerId===playerId)&&finite(value.angle)){
            comparisons.push({moving:`${path}.angle`,target:`${targetPath}.angle`,targetRadians:value.angle,tolerance:finite(game.tolerance)?game.tolerance:undefined,samples:samples.map(sample=>{
              const error=wrap(sample.wrappedRadians!-value.angle+Math.PI,Math.PI*2)-Math.PI;
              return {at:sample.at,signedCircularError:round(error),absoluteCircularError:round(Math.abs(error)),...(finite(game.tolerance)?{withinTolerance:Math.abs(error)<=game.tolerance}:{})};
            })});return;
          }
          for(const [key,child] of Object.entries(value))collect(child,`${targetPath}.${key}`,level+1);
        };collect(game,'visibleNow',0);
      }
    }
    for(const [key,child] of Object.entries(object))visit(child,`${path}.${key}`,depth+1);
  };
  visit(game,'visibleNow',0);
  const subjects:{path:string;value:any}[]=[];
  const entities:{path:string;value:any}[]=[];
  const collect=(value:any,path:string,depth:number)=>{
    if(!value||typeof value!=='object'||depth>6||entities.length>100)return;
    if(finite(value.x)||finite(value.y)){
      entities.push({path,value});
      if(path==='visibleNow'||value.id===playerId||value.playerId===playerId)subjects.push({path,value});
    }
    for(const [key,child] of Object.entries(value))collect(child,`${path}.${key}`,depth+1);
  };collect(game,'visibleNow',0);
  const previous=history.filter(sample=>finite(sample.time)&&sample.time<game.time).at(-1);
  for(const subject of subjects.slice(0,4))for(const other of entities){
    if(subject===other||subject.path===other.path||spatial.length>=24)continue;
    const relative:any={from:subject.path,to:other.path};
    for(const axis of ['x','y'])if(finite(subject.value[axis])&&finite(other.value[axis])){
      const delta=other.value[axis]-subject.value[axis];
      relative[axis]={difference:round(delta),direction:delta===0?'aligned':axis==='x'?(delta<0?'left':'right'):(delta<0?'up':'down')};
      // Root coordinates commonly describe a private single-player avatar. Infer
      // its motion from public history; never guess a movement speed from a title.
      if(subject.path==='visibleNow'&&previous&&finite(previous.game?.[axis])){
        const velocity=(subject.value[axis]-previous.game[axis])/(game.time-previous.time);
        relative[axis].estimatedSelfVelocity=round(velocity);
        relative[axis].differenceAtResponseIfMotionContinues=round(delta-velocity*delaySeconds);
      }
    }
    if(relative.x||relative.y)spatial.push(relative);
  }
  return {measurements:measurements.slice(0,16),comparisons:comparisons.slice(0,16),spatial};
}
