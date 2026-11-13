import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'folio-transfer-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({ stdin: { contents: "export {GET,POST} from './src/pages/api/transfer-review';export {POST as feedback} from './src/pages/api/laboratory-feedback';export {db,put,failures} from './src/server/archive';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'), plugins: [{ name: 'isolate', setup(b) {
  b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({path:'archive',namespace:'test'}));
  b.onResolve({ filter: /server\/session$/ }, () => ({path:'session',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:"export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');"}));
} }] });
const m = await import(join(dir, 'api.mjs'));
after(() => rm(dir, { recursive:true, force:true }));
beforeEach(async () => {
  m.db.clear(); m.failures.clear();
  for (const [id,questionId,original,reference] of [['old','2024-large','Parks serves residents.','Parks serve residents.'],['new','2023-large','Trees grows tall.','Trees grow tall.'],['same','2024-large','People enjoys parks.','People enjoy parks.']]) {
    await m.put('w-'+id,'writing',{id:'w-'+id,questionId,text:original,status:'reviewed',revision:1});
    await m.put('v-'+id,'revision',{writingId:'w-'+id,text:original,version:1});
    await m.put('r-'+id,'review',{id:'r-'+id,writingId:'w-'+id,questionId,revisionId:'v-'+id,createdAt:'2026-11-13T08:00:00Z',label:id,markdown:`3. 逐句批改\n【原句】：${original}\n【修改与说明】\n修改为：${reference}\n说明：主谓一致。`});
  }
});
async function get(query='') { const response=await m.GET({request:new Request('https://test.invalid/api/transfer-review'+query,{headers:{'x-auth':'1'}})}); return {status:response.status,...await response.json()}; }
async function post(body,handler=m.POST,headers={'x-auth':'1'}) {const response=await handler({request:new Request('https://test.invalid/api/transfer-review',{method:'POST',headers,body:JSON.stringify(body)})});return {status:response.status,...await response.json()};}
async function selection(target='new') {
  const {source:origin}=await get('?type=review&source=r-old'),{source:newSource}=await get('?type=review&source=r-'+target);
  return {action:'start',id:'lab-transfer-12345678-1234-1234-1234-123456789abc',originType:'review',originId:'r-old',originSignature:origin.signature,originNoteId:origin.items[0].noteId,targetReviewId:newSource.reviewId,targetSignature:newSource.signature,targetNoteId:newSource.items[0].noteId,confirmed:true};
}
test('transfer requires different questions and confirmed, current source snapshots',async()=>{
 const before=JSON.stringify([...m.db]);await get();
 assert.equal((await post(await selection('same'))).status,400);
 const body=await selection();assert.equal((await post({...body,confirmed:false})).status,400);
 assert.equal((await post({...body,targetSignature:'stale'})).status,409);
 assert.equal(JSON.stringify([...m.db]),before);
 const saved=await post(body);assert.equal(saved.status,200);
 assert.notEqual(saved.progress.session.origin.questionId,saved.progress.session.target.questionId);
 assert.equal((await post(body)).progress.session.createdAt,saved.progress.session.createdAt);
 assert.equal((await post({...body,targetReviewId:'r-same'})).status,409);
});
test('independent answers, hint usage and self-assessment persist through failed saves and retries',async()=>{
 const before=JSON.stringify([...m.db]),body=await selection();await post(body);
 assert.equal((await post({action:'assess',id:body.id,assessment:'understood'})).status,400);
 await post({action:'hint',id:body.id});
 assert.equal((await get('?session='+body.id)).progress.hintUsed,true);
 const answer={action:'answer',id:body.id,answer:'Trees grow tall.',unable:false,hintUsed:false};
 m.failures.add('labTransferAttempt');assert.equal((await post(answer)).status,503);
 assert.equal((await post(answer)).status,200);await Promise.all([post(answer),post(answer)]);
 await post({action:'assess',id:body.id,assessment:'uncertain'});
 const {progress}=await get('?session='+body.id);assert.equal(progress.attempt.hintUsed,true);assert.equal(progress.result.assessment,'uncertain');
 assert.equal([...m.db.values()].filter(row=>row.kind==='labTransferAttempt').length,1);
 assert.equal(JSON.stringify([...m.db].filter(([,row])=>!row.kind.startsWith('labTransfer'))),before);
 m.db.delete('r-new');assert.equal((await get('?session='+body.id)).progress.session.target.item.reference,'Trees grow tall.');
});
test('transfer feedback is linked to this experiment and access is enforced',async()=>{
 const body=await selection();assert.equal((await post(body,m.POST,{})).status,401);
 assert.equal((await post(body,m.POST,{'x-auth':'1','x-foreign':'1'})).status,403);
 await post(body);
 const feedback={id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'transfer',contextId:body.id,phase:'result',ease:'smooth',value:'helpful',factors:['applying','hint']};
 assert.equal((await post(feedback,m.feedback)).status,200);assert.equal((await post(feedback,m.feedback)).status,200);
 assert.equal((await post({...feedback,id:'lab-feedback-22222222-1234-1234-1234-123456789abc',contextId:'r-old'},m.feedback)).status,404);
});
