import test from 'node:test';import assert from 'node:assert/strict';
import {inspectLoop} from '../server/music-assets';import {wavBuffer} from '../server/generation';import {synthesize,stockScore} from '../runtime/music';
test('decoded WAV checks distinguish valid loops, silent/clipped output and invalid loop boundaries',()=>{
  const pcm=synthesize(stockScore('toast-catch')),wav=wavBuffer(pcm,22050),report=inspectLoop(wav,0,pcm.length/22050);
  assert.equal(report.frames,pcm.length);assert.deepEqual(report.problems,[]);assert.ok(report.rms>.01);assert.equal(report.clipped,0);
  const silence=wavBuffer(new Float32Array(22050),22050);assert.ok(inspectLoop(silence,0,1).problems.includes('silent soundtrack'));
  const hard=wavBuffer(new Float32Array(22050).fill(1),22050);assert.ok(inspectLoop(hard,0,1).problems.includes('clipped samples'));
  const seam=new Float32Array(22050);seam[0]=.5;assert.ok(inspectLoop(wavBuffer(seam,22050),0,1).problems.includes('loop boundary discontinuity'));
  assert.throws(()=>inspectLoop(wav,0,1000),/Loop points/);assert.throws(()=>inspectLoop(wav.subarray(0,100),0,1),/Truncated/);
});
