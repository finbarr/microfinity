export type Note={pitch:number;beat:number;duration:number;velocity:number;instrument:'square'|'triangle'|'sine'|'noise'};
export type Score={title:string;bpm:number;beatsPerBar:number;bars:number;notes:Note[]};
export function validateScore(score:Score){
  if(!score||typeof score.title!=='string'||!Number.isFinite(score.bpm)||score.bpm<60||score.bpm>180||![3,4].includes(score.beatsPerBar)||![4,8].includes(score.bars)||!Array.isArray(score.notes)||score.notes.length<8||score.notes.length>256)throw new Error('Invalid musical score');
  for(const [i,n] of score.notes.entries()){
    if(!Number.isFinite(n.pitch)||n.pitch<24||n.pitch>96)throw new Error(`Note ${i}: pitch must be 24..96, got ${n.pitch}`);
    if(!Number.isFinite(n.beat)||n.beat<0||n.beat>=score.beatsPerBar*score.bars)throw new Error(`Note ${i}: beat is outside this ${score.beatsPerBar*score.bars}-beat loop`);
    if(!Number.isFinite(n.duration)||n.duration<.05||n.duration>4)throw new Error(`Note ${i}: duration must be .05..4 beats, got ${n.duration}`);
    if(n.beat+n.duration>score.beatsPerBar*score.bars+.001)throw new Error(`Note ${i}: beat ${n.beat} + duration ${n.duration} extends beyond loop end ${score.beatsPerBar*score.bars}; shorten the duration`);
    if(!Number.isFinite(n.velocity)||n.velocity<0||n.velocity>1)throw new Error(`Note ${i}: velocity must be 0..1, got ${n.velocity}; use decimals such as 0.5`);
    if(!['square','triangle','sine','noise'].includes(n.instrument))throw new Error(`Note ${i}: unsupported instrument`);
  }
  let voices=0;const events=score.notes.flatMap(n=>[{beat:n.beat,delta:1},{beat:n.beat+n.duration,delta:-1}]).sort((a,b)=>a.beat-b.beat||a.delta-b.delta);
  for(const event of events){voices+=event.delta;if(voices>8)throw new Error(`Polyphony exceeds 8 voices at beat ${event.beat}`);}
  return score;
}
export function synthesize(score:Score,rate=22050):Float32Array {
  validateScore(score);const seconds=60/score.bpm,total=score.bars*score.beatsPerBar*seconds,data=new Float32Array(Math.round(total*rate));
  for(const [ni,note] of score.notes.entries()){
    const start=Math.round(note.beat*seconds*rate),length=Math.round(note.duration*seconds*rate),hz=440*Math.pow(2,(note.pitch-69)/12);let rng=ni+17;
    for(let j=0;j<length&&start+j<data.length;j++){
      const t=j/rate,phase=(t*hz)%1,envelope=Math.min(1,t/.009,(length-j)/rate/.04)*Math.exp(-t*(note.instrument==='noise'?18:1.2));
      rng=(Math.imul(rng,1664525)+1013904223)>>>0;
      const wave=note.instrument==='sine'?Math.sin(t*hz*Math.PI*2):note.instrument==='triangle'?1-4*Math.abs(phase-.5):note.instrument==='square'?(phase<.5?.6:-.6):(rng/4294967296*2-1);
      data[start+j]+=wave*envelope*note.velocity*.16;
    }
  }
  let peak=0;for(const n of data)peak=Math.max(peak,Math.abs(n));if(peak>.8)for(let i=0;i<data.length;i++)data[i]*=.8/peak;
  return data;
}
export function stockScore(gameId:string):Score {
  const motifs:Record<string,number[]>={'toast-catch':[72,76,79,76,74,72,67,69],'asteroid-scramble':[64,71,76,79,76,71,67,74],'skill-continue':[60,60,67,60,63,60,67,70],'umbrella-panic':[74,77,81,77,72,76,79,76],'cup-shuffle':[60,63,67,66,65,62,59,62],'odd-snack-out':[72,79,76,84,81,76,79,72],'patchwork-pass':[60,64,67,71,69,67,64,62],'conveyor-clash':[48,55,48,58,48,55,60,55]};
  motifs['nose-dive']=[60,67,66,67,72,67,63,62];motifs['crawl-for-gold']=[67,67,72,74,76,74,72,69];
  const motif=motifs[gameId]??[72,74,79,76,72,67,69,71],bpm=gameId==='patchwork-pass'?90:gameId==='skill-continue'?120:gameId==='nose-dive'?104:gameId==='crawl-for-gold'?126:112;
  const notes:Note[]=Array.from({length:32},(_,i)=>({pitch:motif[i%8],beat:i/2,duration:.4,velocity:.45,instrument:'triangle'}));
  for(let i=0;i<16;i++){notes.push({pitch:36+(i%4===2?7:0),beat:i,duration:.2,velocity:.5,instrument:'sine'});if(i%2)notes.push({pitch:40,beat:i,duration:.12,velocity:.3,instrument:'noise'});}
  return {title:`${gameId} original sketch`,bpm,beatsPerBar:4,bars:4,notes};
}
