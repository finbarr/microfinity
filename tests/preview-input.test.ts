import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewInput} from '../client/preview-input';
import {actionButtons} from '../runtime/headless';
import {advanceInput, buttonEdges} from '../runtime/input';
import {emptyButtons} from '../sdk/index';

test('quick taps between frames survive as distinct presses in gameplay and replay', () => {
  const input = new PreviewInput(['p0']);
  for (let i = 0; i < 3; i++) input.enqueue('p0', [{button: 'action', down: true}, {button: 'action', down: false}]);
  const recording = Array.from({length: 8}, () => input.frame().p0);
  let held = emptyButtons(), presses = 0;
  for (const action of recording) {
    const next = actionButtons[action];
    presses += Number(advanceInput(held, buttonEdges(held, next)).pressed.action);
    held = next;
  }
  assert.equal(presses, 3);
  assert.equal(held.action, false);
});

test('preview chords and player inputs stay isolated; pausing clears buffered taps', () => {
  const input = new PreviewInput(['p0', 'p1']);
  input.enqueue('p1', [{button: 'right', down: true}, {button: 'action', down: true}, {button: 'action', down: false}]);
  assert.deepEqual(input.frame(), {p0: 0, p1: 9});
  input.releaseAll();
  assert.deepEqual(input.frame(), {p0: 0, p1: 0});
  input.enqueue('p0', [{button: 'action', down: true}, {button: 'action', down: false}]);
  input.releaseAll();
  assert.deepEqual(input.frame(), {p0: 0, p1: 0});
});
