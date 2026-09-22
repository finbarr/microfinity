/** Offline evidence check: use only while the local server is stopped. */
import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';import {Store} from '../server/store';
const [jobId,draftMatchId,finishedMatchId]=process.argv.slice(2);if(!jobId||!draftMatchId||!finishedMatchId)throw new Error('Usage: check-music-pinning.ts JOB_ID DRAFT_MATCH_ID FINISHED_MATCH_ID');
const store=new Store();await store.init();
try{
 const [jobRow]=await store.query('SELECT record FROM jobs WHERE id=$1',[jobId]),job=jobRow.record;
 const [draftMatch]=await store.query('SELECT id,created_at,record FROM matches WHERE id=$1',[draftMatchId]);
 const [finishedMatch]=await store.query('SELECT id,record FROM matches WHERE id=$1',[finishedMatchId]);
 const original=await store.version(job.remix),draft=await store.version(draftMatch.record.rounds[0].versionId),finished=await store.version(job.finishedVersion);
 assert.equal(job.musicOnly,true);assert.equal(job.status,'ready');assert.equal(draft.manifest.provenance.draft,true);assert.equal(draft.manifest.music,null);assert.equal(finished.manifest.provenance.draft,false);assert.ok(finished.manifest.music);
 for(const v of [draft,finished]){assert.equal(v.source,original.source);assert.equal(v.code,original.code);assert.equal(v.manifest.runtimeVersion,original.manifest.runtimeVersion);assert.deepEqual(v.manifest.assets,original.manifest.assets);assert.deepEqual(v.manifest.meta,original.manifest.meta);}
 assert.notEqual(draft.id,finished.id);assert.equal(finishedMatch.record.rounds[0].versionId,finished.id);
 const [challenge]=await store.query('SELECT definition FROM challenges WHERE id=$1',[draftMatch.record.challengeId]);assert.deepEqual(challenge.definition.versions,[draft.id]);
 const roomStartedAt=new Date(draftMatch.created_at).getTime();assert.ok(roomStartedAt<job.timings.musicEnd);
 const report={jobId,draftMatchId,finishedMatchId,sourceVersion:original.id,draftVersion:draft.id,finishedVersion:finished.id,draftMusic:null,finishedMusic:finished.manifest.music,previewMs:job.timings.previewMs,finishedMs:job.timings.totalMs,matchCreatedBeforeMusicFinishedMs:job.timings.musicEnd-roomStartedAt,preserved:{source:true,compiledCode:true,runtime:true,artwork:true,metadata:true,existingChallenge:true},browserObservation:'Creation showed music working before Play draft preview. The round retained Draft preview · stock soundtrack. Reopening the finished job started its separate ready version without a draft badge.',listening:'not performed'};
 await mkdir('evidence/audio',{recursive:true});await writeFile('evidence/audio/pinning-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:true,jobId,previewMs:report.previewMs,finishedMs:report.finishedMs,matchCreatedBeforeMusicFinishedMs:report.matchCreatedBeforeMusicFinishedMs}));
}finally{await store.close();}
