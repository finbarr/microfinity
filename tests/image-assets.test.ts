import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {normalizeSprite} from '../server/image-assets';

test('sprite input limits precede decoding and normalized output is a bounded RGBA PNG',async()=>{
 await assert.rejects(()=>normalizeSprite('A'.repeat(26_666_669)),/asset limit/);
 await assert.rejects(()=>normalizeSprite('<svg/>'),/encoding/);
 await assert.rejects(()=>normalizeSprite(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')),/PNG/);
 const wide=await sharp({create:{width:4097,height:1,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();await assert.rejects(()=>normalizeSprite(wide.toString('base64')),/dimensions/);
 const large=await sharp({create:{width:2200,height:2100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();await assert.rejects(()=>normalizeSprite(large.toString('base64')),/pixel limit/);
 const opaque=await sharp({create:{width:32,height:32,channels:4,background:{r:100,g:20,b:10,alpha:1}}}).png().toBuffer();await assert.rejects(()=>normalizeSprite(opaque.toString('base64')),/transparent/);
 const valid=await sharp(opaque).extend({top:8,bottom:8,left:16,right:16,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();const normalized=await normalizeSprite(valid.toString('base64'));const meta=await sharp(normalized).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);assert.equal(meta.hasAlpha,true);
});
