import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {buttonEdges} from '../runtime/input';
import {emptyButtons,colors} from '../sdk/index';
import {scriptedDecision} from '../server/controllers';

const players=(count:number)=>Array.from({length:count},(_,i)=>({id:`p${i}`,name:`P${i}`,color:colors[i]}));
const tap=(button:'action'|'up'|'down'|'left'|'right')=>[{button,down:true},{button,down:false}];
async function game(name:string){return Sandbox.create(await compile(await readFile(`games/${name}.ts`,'utf8')),await bootstrap());}

test('Nose Dive allows repeat picks, protects pending results, and ends on its short clock',async()=>{
  const vm=await game('nose-dive');
  try{
    const meta=vm.call('meta').meta;let status=vm.call('init',{seed:17,difficulty:1,players:players(2)}),held=emptyButtons();
    let firstPick=false;
    while(!status.done){
      const view=vm.call('observe','p0');
      assert.ok(view.game.hands.every((hand:any)=>!('good' in hand)),'pending hit result stays out of player and Jev observations');
      const buttons=scriptedDecision(meta,view,held).buttons;
      status=vm.call('step',{p0:buttonEdges(held,buttons)});held=buttons;
      if(!firstPick&&status.scores.p0>0){firstPick=true;assert.equal(status.done,false,'one early pick must not end the round');}
    }
    assert.equal(firstPick,true);
    assert.ok(status.scores.p0>=2,'a player can score more than one clean pick');
    assert.ok(status.time>=13.9&&status.time<14.1);
    assert.deepEqual(status.outcomes,{p0:'success',p1:'failure'});
  }finally{vm.dispose();}
});

test('Crawl for Gold shifts its visible timing target after a held pull',async()=>{
  const vm=await game('crawl-for-gold');
  try{
    const meta=vm.call('meta').meta;let status=vm.call('init',{seed:17,difficulty:1,players:players(2)}),held=emptyButtons();
    const first=vm.call('observe','p0').game,initialTarget=first.target,initialRate=first.crawlers[0].rate;
    while(!status.done&&status.scores.p0===0){
      const view=vm.call('observe','p0'),buttons=scriptedDecision(meta,view,held).buttons;
      status=vm.call('step',{p0:buttonEdges(held,buttons)});held=buttons;
    }
    assert.equal(status.scores.p0,100);
    const view=vm.call('observe','p0').game;
    assert.notEqual(view.target,initialTarget,'the next reach asks for a different timing');
    assert.equal(view.target,view.crawlers[0].target,'controller target matches the drawn player lane');
    assert.ok(view.crawlers[0].rate>initialRate,'the race gains pace after a stride');
    assert.equal(view.crawlers[0].stage,'recover');
    vm.call('draw',view);
  }finally{vm.dispose();}
});

test('Patchwork Pass awards visible button bonuses, blocks overlaps, and bounds idle rounds',async()=>{
  const vm=await game('patchwork-pass');
  try{
    let status=vm.call('init',{seed:17,difficulty:1,players:players(2)});
    const button=vm.call('observe','p0').game.buttons[0] as number;
    status=vm.call('step',{p0:tap('action')},.05,'input');
    let view=vm.call('observe','p0').game;
    assert.equal(view.phase,'place');
    const targetX=Math.min(4,button%6),targetY=Math.floor(button/6);
    for(let i=0;i<targetX;i++)status=vm.call('step',{p0:tap('right')},.05,'input');
    for(let i=0;i<targetY;i++)status=vm.call('step',{p0:tap('down')},.05,'input');
    view=vm.call('observe','p0').game;
    assert.equal(view.valid,true);
    assert.ok(view.previewBonus>=1);
    assert.equal(view.previewPoints,2+view.previewBonus*2);
    const earned=view.previewPoints;
    vm.call('draw',view);
    status=vm.call('step',{p0:tap('action')},.05,'input');
    assert.equal(status.scores.p0,earned);
    assert.deepEqual(vm.call('observe','p0').game.used[0],[0]);
    status=vm.call('step',{},10,'timeout');
    status=vm.call('step',{p0:tap('action')},.05,'input');
    view=vm.call('observe','p0').game;
    assert.equal(view.phase,'place');
    assert.notEqual(view.piece,0,'the same player cannot reuse a patch shape');
    while(view.x>targetX){status=vm.call('step',{p0:tap('left')},.05,'input');view=vm.call('observe','p0').game;}
    while(view.x<targetX){status=vm.call('step',{p0:tap('right')},.05,'input');view=vm.call('observe','p0').game;}
    while(view.y>targetY){status=vm.call('step',{p0:tap('up')},.05,'input');view=vm.call('observe','p0').game;}
    while(view.y<targetY){status=vm.call('step',{p0:tap('down')},.05,'input');view=vm.call('observe','p0').game;}
    assert.equal(view.valid,false,'an occupied cell visibly blocks the ghost');
    status=vm.call('step',{p0:tap('action')},.05,'input');
    assert.equal(status.scores.p0,earned);
    assert.equal(vm.call('observe','p0').game.turns,2,'invalid stitching does not spend the turn');
    for(const count of [2,4]){
      status=vm.call('init',{seed:17,difficulty:1,players:players(count)});
      while(!status.done)status=vm.call('step',{},10,'timeout');
      assert.ok(status.time<=30,'idle action rounds must end by the short cap');
      assert.ok(Object.values(status.outcomes).every(outcome=>outcome==='failure'));
    }
  }finally{vm.dispose();}
});
