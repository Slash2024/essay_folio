import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'folio-recall-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({ stdin: { contents: "export {GET as mapGET,POST as mapPOST} from './src/pages/api/call-map';export {GET,POST} from './src/pages/api/recall-cards';export {GET as home} from './src/pages/api/laboratory-home';export {POST as feedback} from './src/pages/api/laboratory-feedback';export {db,put,failures} from './src/server/archive';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'), plugins: [{ name: 'isolate', setup(b) {
 b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({path:'archive',namespace:'test'}));
 b.onResolve({ filter: /server\/session$/ }, () => ({path:'session',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:"export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');"}));
} }] });
const m = await import(join(dir, 'api.mjs'));
after(() => rm(dir, {recursive:true,force:true}));
const expression={id:'test-stem',category:'原因',title:'原因句式',template:'It stems from {{reason}}.',notes:'填入原因',substitutions:'',enabled:true};
beforeEach(async()=>{
 m.db.clear();m.failures.clear();
 await m.put('expression-library','expressions',{revision:1,sentences:[expression,{...expression,id:'backup',title:'备用',template:'Underlying {{A}} were {{B}}.'}],words:[{id:'word',term:'for example',meaning:'举例',forms:[],enabled:true}],tolerance:'balanced',sourceText:''});
 await m.put('formal-writing','writing',{id:'formal-writing',text:'Keep original.',revision:1});
});
async function get(query='',handler=m.GET,headers={'x-auth':'1'}){const response=await handler({request:new Request('https://test.invalid/api/test'+query,{headers})});return {status:response.status,...await response.json()};}
async function post(body,handler=m.POST,headers={'x-auth':'1'}){const response=await handler({request:new Request('https://test.invalid/api/test',{method:'POST',headers,body:JSON.stringify(body)})});return {status:response.status,...await response.json()};}
const operationId='lab-map-save-12345678-1234-1234-1234-123456789abc';
const recallId='lab-recall-12345678-1234-1234-1234-123456789abc';
async function mapBody(extra={}){const overview=await get('',m.mapGET);return {operationId,taskId:'reason',baseRevision:0,scope:'large',cue:'需要解释这个现象的原因。',signature:overview.signature,confirmed:true,primary:{key:'sentence:test-stem',applies:'用于解释有依据的原因。',variables:'替换原因与结果。',example:''},backup:{key:'sentence:backup',applies:'用于说明多个原因。',variables:'替换主题和原因。',example:''},...extra};}
async function start(extra={}){const overview=await get();return post({action:'start',id:recallId,maps:overview.maps.map(({taskId,revision})=>({taskId,revision})),limit:3,...extra});}
const call=(action,extra={})=>post({action,id:recallId,index:0,...extra});
test('map validates confirmation, Chinese-only cues, distinct bindings and source revision; preserves the original library',async()=>{
 const before=JSON.stringify([...m.db]);const body=await mapBody();
 assert.equal((await post({...body,confirmed:false},m.mapPOST)).status,400);
 assert.equal((await post({...body,cue:'回想 It stems from 原因'},m.mapPOST)).status,400);
 assert.equal((await post({...body,backup:{...body.backup,key:body.primary.key}},m.mapPOST)).status,400);
 assert.equal((await post({...body,signature:'stale'},m.mapPOST)).status,409);
 assert.equal((await post(body,m.mapPOST)).status,200);assert.equal((await post(body,m.mapPOST)).maps[0].revision,1);
 assert.equal((await post({...body,cue:'另外一个任务。'},m.mapPOST)).status,409);
 assert.equal((await post({...body,operationId:'lab-map-save-22222222-1234-1234-1234-123456789abc'},m.mapPOST)).status,409);
 assert.equal(JSON.stringify([...m.db].filter(([,r])=>r.kind!=='labCallMap')),before);
});
test('unrevealed overview and session expose no target text, names, notes, examples or later card answers',async()=>{
 await post(await mapBody(),m.mapPOST);
 const overview=await get();assert.equal(overview.maps.length,1);assert.equal(JSON.stringify(overview).includes('test-stem'),false);
 const s=await start();assert.equal(s.status,200);assert.equal(s.progress.session.total,1);assert.equal(s.progress.reveals.length,0);
 for(const text of ['It stems','Underlying','填入原因','用于解释有依据','sentence:test-stem'])assert.equal(JSON.stringify(s.progress).includes(text),false,text);
 assert.equal((await start()).progress.session.createdAt,s.progress.session.createdAt);
 const opened=await call('reveal',{recalled:true});assert.equal(opened.progress.reveals[0].primary.expression.text,expression.template);
});
test('hint and pre-reveal claim constrain self-report, survive reloads and cannot be relabelled after saving',async()=>{
 await post(await mapBody(),m.mapPOST);await start();
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 await call('hint');assert.equal((await get('?session='+recallId)).progress.hints[0].text,'It stems');
 await call('reveal',{recalled:true});
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 assert.equal((await call('assess',{assessment:'prompted',confirmed:true})).status,200);
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,409);
 assert.equal((await call('reveal',{recalled:false})).status,409);
});
test('seeing the answer after failure cannot become independent recall; retries retain durable results and queue',async()=>{
 await post(await mapBody(),m.mapPOST);await start();
 assert.equal((await get('',m.home)).items[0].route.view,'recall');
 await call('reveal',{recalled:false});
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 m.failures.add('labRecallResult');assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,503);
 assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,200);assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,200);
 assert.equal([...m.db.values()].filter(r=>r.kind==='labRecallResult').length,1);assert.deepEqual((await get('',m.home)).items,[]);
});
test('changed or disabled sources stop new cards while snapshots and word entries remain readable',async()=>{
 const body=await mapBody();await post(body,m.mapPOST);await start();
 const row=m.db.get('expression-library'),library=JSON.parse(row.payload);library.sentences[0].template='Changed content.';row.payload=JSON.stringify(library);
 const overview=await get('',m.mapGET);assert.equal(overview.maps[0].current,false);assert.equal((await get()).staleCount,1);
 assert.equal((await start({id:'lab-recall-22222222-1234-1234-1234-123456789abc',maps:[{taskId:'reason',revision:1}]})).status,409);
 const result=await call('reveal',{recalled:true});assert.equal(result.progress.reveals[0].primary.expression.text,expression.template);
 const updated=await mapBody({operationId:'lab-map-save-22222222-1234-1234-1234-123456789abc',baseRevision:1,primary:{key:'word:word',applies:'引出事例。',variables:'补入事例。',example:''},backup:null});
 assert.equal((await post(updated,m.mapPOST)).status,200);assert.equal((await get()).maps[0].revision,2);
});
test('independent recall works without hints and late hints do not rewrite a pre-reveal outcome',async()=>{
 await post(await mapBody(),m.mapPOST);await start();await call('reveal',{recalled:true});await call('hint');
 assert.equal((await get('?session='+recallId)).progress.hints.length,0);
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,200);
 assert.equal((await get('?session='+recallId)).progress.results[0].assessment,'independent');
});
test('map can be unbound without deleting history; authentication, origin and feedback contexts are enforced',async()=>{
 const body=await mapBody();assert.equal((await post(body,m.mapPOST,{})).status,401);assert.equal((await get('',m.GET,{})).status,401);
 assert.equal((await post(body,m.mapPOST,{'x-auth':'1','x-foreign':'1'})).status,403);await post(body,m.mapPOST);await start();
 const feedback={id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'recall',contextId:recallId,phase:'practice',ease:'smooth',value:'helpful',factors:['retrieval','hint']};
 assert.equal((await post(feedback,m.feedback)).status,200);assert.equal((await post({...feedback,id:'lab-feedback-22222222-1234-1234-1234-123456789abc',feature:'callmap',contextId:'lab-call-map-reason',factors:['finding']},m.feedback)).status,200);
 assert.equal((await post({...feedback,id:'lab-feedback-33333333-1234-1234-1234-123456789abc',contextId:'formal-writing'},m.feedback)).status,404);
 const unbind=await mapBody({operationId:'lab-map-save-22222222-1234-1234-1234-123456789abc',baseRevision:1,primary:null,backup:null});assert.equal((await post(unbind,m.mapPOST)).status,200);assert.equal((await get()).maps.length,0);assert.equal((await get('?session='+recallId)).progress.session.total,1);
});
