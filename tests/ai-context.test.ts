import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedChoices,jevDecision,jevState} from '../server/controllers';
import {emptyButtons,type Metadata} from '../sdk/index';
const meta:Metadata={id:'unseen-game',title:'Fixture',instruction:'Hold to score',description:'A fixture',rules:'Hold until charged, then release.',players:[1,4],clock:'realtime',participation:'individual',world:'independent',duration:10,style:'pixel',score:{unit:'points',order:'lower'},controls:{directions:false,action:'Charge'},tags:[],modifiers:[]};
const context={source:'export default defineGame({step(s, inputs, ctx){},draw(v,g){}})',intervalMs:200,expectedLatencyMs:160,observationAgeMs:40};

test('both experimental contexts map private world identity and expose only visible evidence',()=>{
  for(const strategy of ['compact-v5','source-v5','target-v9'] as const){
    const view={playerId:'p3',gamePlayerId:'p0',roles:{p3:'player'},scores:{p3:7,p2:8},gameScores:{p0:7},time:2,game:{me:'p0',avatars:[{id:'p0',charge:.5}]},hud:{message:'Hold'},seed:123,secret:'PRIVATE_ANSWER_SENTINEL_92'};
    const state=jevState(meta,view,{...emptyButtons(),action:true},[{time:1.8,tick:108,game:{charge:.3},buttons:emptyButtons()}],{...context,strategy});
    assert.ok('objective' in state);
    assert.equal(state.you.playerId,'p0');assert.equal(state.you.role,'player');
    assert.deepEqual(state.scores,{p0:7});assert.equal(state.objective.score.order,'lower');
    assert.equal(state.clock.applicationTimeSeconds,2.2);assert.equal(state.history[0].time,1.8);
    assert.deepEqual(state.visibleNow,view.game);assert.equal(state.you.entities[0].entity,view.game.avatars[0]);
    assert.ok(!JSON.stringify(state).includes('PRIVATE_ANSWER_SENTINEL_92'));assert.ok(!('seed' in state));
    assert.equal(!!state.referenceRules,strategy==='source-v5');
    if(strategy==='target-v9')assert.ok('computedEvidence' in state);
    assert.deepEqual(view.roles,{p3:'player'},'context does not mutate the original observation');
  }
});

test('provider request preserves holds, rejects invalid buttons, and supports any cartridge ID',async t=>{
  const oldKey=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='local-fixture';
  let choice='neutral_action';const bodies:any[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,request:RequestInit)=>{
    bodies.push(JSON.parse(request.body as string));
    return new Response(JSON.stringify({model:'fixture',answers:{action:{choice,confidence:.9}}}),{status:200});
  });
  try{
    const held={...emptyButtons(),action:true},view={playerId:'p2',roles:{p2:'player'},time:1,game:{charge:.2}};
    const result=await jevDecision(meta,view,held,[],undefined,{...context,strategy:'source-v5'});
    assert.equal(result.buttons.action,true);assert.equal(result.contextVersion,'source-v5');
    assert.match(bodies[0].questions.action.criteria.neutral_action,/KEEP HOLDING/);
    assert.match(bodies[0].questions.action.criteria.neutral,/RELEASE action/);
    assert.deepEqual(Object.keys(bodies[0].questions.action.criteria),Object.keys(allowedChoices(meta)));
    choice='left_action';await assert.rejects(()=>jevDecision(meta,view,held),/invalid controller choice/);
  }finally{if(oldKey===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=oldKey;}
});

test('backend arithmetic derives timing and directions from visible fields for arbitrary games',async()=>{
  const {motionEvidence}=await import('../server/controller-evidence');
  const game={angle:6,speed:2,travel:.2,tolerance:.3,hands:[{id:'p1',angle:.5}],crawlers:[{id:'p1',phase:.3,rate:.5,target:.5,stage:'reach'}],half:.15};
  const evidence=motionEvidence(game,'p1',.2);
  const angular=evidence.comparisons.find(c=>c.moving==='visibleNow.angle');
  assert.equal(angular.samples.find((s:any)=>s.at==='response_plus_travel').withinTolerance,true);
  const phase=evidence.comparisons.find(c=>c.moving.endsWith('.phase'));
  assert.equal(phase.samples.find((s:any)=>s.at==='response').withinWindow,true);
  const spatial=motionEvidence({time:2,x:400,items:[{id:5,x:120,y:290,vy:100}]},'p0',.2,[{time:1.8,game:{x:360}}]);
  assert.equal(spatial.spatial[0].x.direction,'left');
  assert.equal(spatial.spatial[0].x.differenceAtResponseIfMotionContinues,-320);
  assert.ok(spatial.measurements.some(m=>m.path==='visibleNow.items.0.y'),'numeric entity IDs are objects, not other player identities');
  assert.deepEqual(motionEvidence({answer:null},'p0',.2),{measurements:[],comparisons:[],spatial:[]});
});

test('separate movement and action answers combine into one complete ordinary controller state',async t=>{
  const oldKey=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='local-fixture';
  let movement='left',action='released';let body:any;
  t.mock.method(globalThis,'fetch',async(_url:unknown,request:RequestInit)=>{
    body=JSON.parse(request.body as string);
    return new Response(JSON.stringify({answers:{movement:{choice:movement},action:{choice:action,confidence:.8}}}));
  });
  try{
    const directional={...meta,controls:{directions:true,action:'Grab'}};
    const view={playerId:'p1',roles:{p1:'player'},time:1,game:{x:100}};
    const result=await jevDecision(directional,view,{...emptyButtons(),right:true,action:true},[],undefined,{...context,strategy:'factor-v7'});
    assert.deepEqual(result.buttons,{...emptyButtons(),left:true});
    assert.equal(Object.keys(body.questions.movement.criteria).length,9);
    assert.equal(Object.keys(body.questions.action.criteria).length,2);
    movement='teleport';await assert.rejects(()=>jevDecision(directional,view,emptyButtons(),[],undefined,{...context,strategy:'factor-v7'}),/invalid controller choice/);
  }finally{if(oldKey===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=oldKey;}
});

test('backend target tracking stops at alignment, survives array reordering, and releases a vanished target',async()=>{
  const {navigationChoices,navigationButtons}=await import('../server/controller-navigation');
  const view={x:100,items:[{id:5,x:300,y:20},{id:9,x:500,y:80}]};
  const options=navigationChoices(view,'p0'),goal=Object.values(options).find(o=>(o.description as any).object.id===9)!.navigation;
  assert.deepEqual(navigationButtons(view,goal,emptyButtons()),{...emptyButtons(),right:true});
  assert.deepEqual(navigationButtons({x:495,items:[view.items[1]]},goal,{...emptyButtons(),action:true}),{...emptyButtons(),action:true});
  assert.deepEqual(navigationButtons({x:530,items:[view.items[1]]},goal,emptyButtons()),{...emptyButtons(),left:true});
  assert.deepEqual(navigationButtons({x:100,items:[view.items[0]]},goal,emptyButtons()),emptyButtons());
  assert.deepEqual(navigationChoices({cursor:2,answers:[1,2,3]},'p0'),{},'discrete games continue using ordinary directional choices');
});

test('Jev target decisions use local player identity and cannot return an arbitrary target',async t=>{
  const oldKey=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='local-fixture';
  let movement='align_0';
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({answers:{movement:{choice:movement},action:{choice:'released',confidence:.9}}})));
  try{
    const directional={...meta,controls:{directions:true,action:'Grab'}},view={playerId:'p3',gamePlayerId:'p0',time:1,roles:{p3:'player'},game:{avatars:[{id:'p0',x:100,y:200}],items:[{id:7,x:300,y:50}]}};
    const decision=await jevDecision(directional,view,emptyButtons(),[],undefined,{...context,strategy:'target-v9'});
    assert.ok(decision.navigation);assert.equal(decision.buttons.right,true);
    assert.equal(decision.navigation.self.id,'p0');
    movement='align_99';await assert.rejects(()=>jevDecision(directional,view,emptyButtons(),[],undefined,{...context,strategy:'target-v9'}),/invalid controller choice/);
  }finally{if(oldKey===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=oldKey;}
});
