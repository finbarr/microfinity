import test from 'node:test';import assert from 'node:assert/strict';
import { InputCollector, advanceInput, padButtons } from '../runtime/input';
import { emptyButtons } from '../sdk/index';
test('aliases, repeated keydown, quick taps, cancellation and diagonal parity',()=>{
  const c=new InputCollector();c.set('KeyA',['left']);c.set('ArrowLeft',['left']);c.set('ArrowLeft',['left']);c.release('KeyA');
  assert.equal(c.getHeld().left,true);assert.deepEqual(c.drain(),[{button:'left',down:true}]);
  c.release('ArrowLeft');c.set('Space',['action']);c.release('Space');
  const input=advanceInput({...emptyButtons(),left:true},c.drain());assert.equal(input.pressed.action,true);assert.equal(input.released.action,true);assert.equal(input.held.action,false);
  const diagonal=advanceInput(emptyButtons(),[{button:'up',down:true},{button:'right',down:true}]);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);
  const opposites=advanceInput(emptyButtons(),[{button:'left',down:true},{button:'right',down:true}]);assert.equal(opposites.x,0);
  assert.deepEqual(padButtons(.8,-.8),['up','right']);c.set('touch:1',['up','left']);c.set('touch:2',['action']);c.clear();assert.deepEqual(c.getHeld(),emptyButtons());
});
test('round transition suppresses inherited action until release and repress',()=>{
  const c=new InputCollector();c.set('Space',['action']);c.drain();c.transition();assert.equal(c.getHeld().action,false);c.set('Space',['action']);assert.deepEqual(c.drain(),[]);
  c.release('Space');c.drain();c.set('Space',['action']);assert.deepEqual(c.drain(),[{button:'action',down:true}]);
});
test('ordered repeated action sequence preserves every physical press',()=>{
  const c=new InputCollector();for(let i=0;i<4;i++){c.set('Space',['action']);c.release('Space');}
  const input=advanceInput(emptyButtons(),c.drain());assert.equal(input.edges.filter(e=>e.down).length,4);assert.equal(input.held.action,false);
});
