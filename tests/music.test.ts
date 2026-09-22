import test from 'node:test';import assert from 'node:assert/strict';import {stockScore,synthesize,validateScore} from '../runtime/music';
test('all reference loops have distinct motifs, bounded peaks and exact musical durations',()=>{
  const names=['asteroid-scramble','skill-continue','toast-catch','umbrella-panic','cup-shuffle','odd-snack-out','patchwork-pass','conveyor-clash'];const fingerprints=new Set();
  for(const name of names){const score=stockScore(name),pcm=synthesize(score),duration=score.bars*score.beatsPerBar*60/score.bpm;assert.equal(pcm.length,Math.round(duration*22050));let peak=0,energy=0;for(const sample of pcm){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}assert.ok(peak<.81&&energy>1);assert.ok(Math.abs(pcm[0]-pcm[pcm.length-1])<.01);fingerprints.add(JSON.stringify(score.notes));}
  assert.equal(fingerprints.size,8);assert.throws(()=>validateScore({...stockScore('toast-catch'),bpm:10000}));
});
