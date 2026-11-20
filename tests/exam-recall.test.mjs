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
const expression={id:'test-stem',category:'大作文 / 原因 / 通用',title:'原因句式',template:'It stems from {{reason}}.',notes:'填入原因',substitutions:'',enabled:true};
const recallId='lab-recall-12345678-1234-1234-1234-123456789abc';
const range={main:'大作文',sub:'原因'};
beforeEach(async()=>{
 m.db.clear();m.failures.clear();
 await m.put('expression-library','expressions',{revision:1,sentences:[expression,{...expression,id:'invite',category:'小作文 / 邀请 / 中间段',title:'邀请句式',template:'We invite you to {{event}}.'}],words:[{id:'word',term:'for example',meaning:'举例（来源：大作文.docx）',forms:[],enabled:true}],tolerance:'balanced',sourceText:''});
 await m.put('lab-quiz-cue-pack','labQuizCuePack',{version:1,sourceRevision:1,entries:[
  {key:'sentence:test-stem',text:expression.template,meaning:'这个现象源于所列原因。',scenario:'需要解释一个现象的原因。'},
  {key:'sentence:invite',text:'We invite you to {{event}}.',meaning:'邀请对方参加活动。',scenario:'需要邀请对方参加一场活动。'},
  {key:'word:word',text:'for example',sourceMeaning:'举例（来源：大作文.docx）',meaning:'例如。',scenario:'需要引出一个具体例子。'},
 ]});
 await m.put('formal-writing','writing',{id:'formal-writing',text:'Keep original.',revision:1});
 // Old configuration rows can remain, even without a decodable payload. Nothing
 // in the independent recall flow may consult or update them.
 await m.put('retired-map','labCallMap',{opaque:'retained archive data'});
});
async function get(query='',handler=m.GET,headers={'x-auth':'1'}){const response=await handler({request:new Request('https://test.invalid/api/test'+query,{headers})});return {status:response.status,...await response.json()};}
async function post(body,handler=m.POST,headers={'x-auth':'1'}){const response=await handler({request:new Request('https://test.invalid/api/test',{method:'POST',headers,body:JSON.stringify(body)})});return {status:response.status,...await response.json()};}
async function start(extra={}){const overview=await get();return post({action:'start',id:recallId,range,signature:overview.signature,limit:1,...extra});}
const call=(action,extra={})=>post({action,id:recallId,index:0,...extra});
const protectedRows=()=>JSON.stringify([...m.db].filter(([,r])=>['writing','expressions','labCallMap'].includes(r.kind)));
test('retired API returns 410 for reads and writes, protects auth/origin, rejects new feedback, and changes no data',async()=>{
 const before=JSON.stringify([...m.db]);
 assert.equal((await get('',m.mapGET)).status,410);assert.equal((await post({primary:'anything'},m.mapPOST)).status,410);
 assert.equal((await get('',m.mapGET,{})).status,401);assert.equal((await post({},m.mapPOST,{})).status,401);
 assert.equal((await post({},m.mapPOST,{'x-auth':'1','x-foreign':'1'})).status,403);
 const feedback={id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'callmap',phase:'reading',ease:'smooth',value:'helpful',factors:['finding']};
 assert.equal((await post(feedback,m.feedback)).status,400);assert.equal(JSON.stringify([...m.db]),before);
});
test('independent recall counts current cues by category without exposing target text and needs no map configuration',async()=>{
 const before=protectedRows(),overview=await get();assert.equal(overview.ranges.find(r=>!r.main).count,3);assert.equal(overview.ranges.find(r=>r.main==='大作文'&&!r.sub).count,2);assert.equal(overview.ranges.find(r=>r.main==='小作文'&&r.sub==='邀请').count,1);
 for(const text of ['It stems','invite you','for example','test-stem','填入原因'])assert.equal(JSON.stringify(overview).includes(text),false,text);
 const s=await start();assert.equal(s.status,200);assert.equal(s.progress.session.total,1);assert.equal(s.progress.reveals.length,0);
 for(const text of ['It stems','invite you','填入原因','sentence:test-stem'])assert.equal(JSON.stringify(s.progress).includes(text),false,text);
 assert.equal((await start()).progress.session.createdAt,s.progress.session.createdAt);
 assert.equal((await start({range:{main:'小作文',sub:'邀请'}})).status,409);
 const opened=await call('reveal',{recalled:true});assert.equal(opened.progress.reveals[0].primary.expression.text,expression.template);assert.equal(protectedRows(),before);
});
test('hint and pre-reveal claim constrain self-report, survive reloads and cannot be relabelled after saving',async()=>{
 await start();assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 await call('hint');assert.equal((await get('?session='+recallId)).progress.hints[0].text,'It stems');await call('reveal',{recalled:true});
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);assert.equal((await call('assess',{assessment:'prompted',confirmed:true})).status,200);
 assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,409);assert.equal((await call('reveal',{recalled:false})).status,409);
});
test('seeing an answer after failure cannot become independent recall; retries retain durable results and queue',async()=>{
 await start();assert.equal((await get('',m.home)).items[0].route.view,'recall');await call('reveal',{recalled:false});
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,400);
 m.failures.add('labRecallResult');assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,503);
 assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,200);assert.equal((await call('assess',{assessment:'unrecalled',confirmed:true})).status,200);
 assert.equal([...m.db.values()].filter(r=>r.kind==='labRecallResult').length,1);assert.deepEqual((await get('',m.home)).items,[]);
});
test('changed or disabled sources stop new cards while old snapshots stay readable without configuration rows',async()=>{
 await start();const row=m.db.get('expression-library'),library=JSON.parse(row.payload);library.sentences[0].template='Changed content.';row.payload=JSON.stringify(library);
 assert.equal((await get()).ranges.some(r=>r.main==='大作文'&&r.sub==='原因'),false);
 assert.equal((await start({id:'lab-recall-22222222-1234-1234-1234-123456789abc'})).status,409);
 assert.equal((await call('reveal',{recalled:true})).progress.reveals[0].primary.expression.text,expression.template);
 library.words[0].enabled=false;row.payload=JSON.stringify(library);assert.equal((await get()).ranges.find(r=>!r.main).count,1);
 const wordRound=await start({id:'lab-recall-33333333-1234-1234-1234-123456789abc',range:{main:'小作文',sub:'邀请'}});assert.equal(wordRound.status,200);
});
test('invalid ranges, limits and stale cues are rejected; random rounds have unique sources and preserve original records',async()=>{
 const before=protectedRows();
 for(const selection of [null,{},[],{main:'',sub:'原因'},{main:'大作文',sub:3}])assert.equal((await start({range:selection})).status,400);
 assert.equal((await start({range:{main:'大作文',sub:'邀请'}})).status,409);assert.equal((await start({signature:'stale'})).status,409);
 for(const limit of [0,6,1.5])assert.equal((await start({limit})).status,400);
 const all=await start({range:{main:'',sub:''},limit:5});assert.equal(all.progress.session.total,3);
 const saved=JSON.parse(m.db.get(recallId).payload);assert.equal(new Set(saved.cards.map(c=>c.sourceKey)).size,3);assert.equal(saved.version,2);assert.equal(protectedRows(),before);
});
test('independent recall works without hints; late hints cannot rewrite a pre-reveal outcome; feedback remains available',async()=>{
 await start();await call('reveal',{recalled:true});await call('hint');assert.equal((await get('?session='+recallId)).progress.hints.length,0);
 assert.equal((await call('assess',{assessment:'independent',confirmed:true})).status,200);
 const feedback={id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'recall',contextId:recallId,phase:'practice',ease:'smooth',value:'helpful',factors:['retrieval','hint']};
 assert.equal((await post(feedback,m.feedback)).status,200);assert.equal((await post({...feedback,id:'lab-feedback-33333333-1234-1234-1234-123456789abc',contextId:'formal-writing'},m.feedback)).status,404);
 assert.equal((await get('',m.GET,{})).status,401);assert.equal((await post({},m.POST,{'x-auth':'1','x-foreign':'1'})).status,403);
});
test('historical card snapshots, old start retries and pending queue remain usable after the map is removed',async()=>{
 await start();const session=JSON.parse(m.db.get(recallId).payload);session.version=1;delete session.range;
 session.cards[0].mapId='old-map';session.cards[0].mapRevision=1;session.cards[0].taskId='reason';
 session.requestKey=JSON.stringify({limit:1,maps:[{revision:1,taskId:'reason'}]});m.db.get(recallId).payload=JSON.stringify(session);
 const before=JSON.stringify(m.db.get(recallId));m.db.delete('retired-map');
 assert.equal((await get('?session='+recallId)).progress.cards[0].taskId,'reason');
 assert.equal((await start({maps:[{taskId:'reason',revision:1}]})).status,200);
 assert.equal((await start({id:'lab-recall-99999999-1234-1234-1234-123456789abc',maps:[{taskId:'reason',revision:1}]})).status,410);
 assert.equal((await get('',m.home)).items[0].route.view,'recall');await call('reveal',{recalled:true});await call('assess',{assessment:'independent',confirmed:true});
 assert.equal((await get('?session='+recallId)).progress.results[0].assessment,'independent');assert.equal(JSON.stringify(m.db.get(recallId)),before);
});
test('concurrent starts reopen the first saved random draw instead of replacing its cards',async()=>{
 const overview=await get(),body={action:'start',id:recallId,range:{main:'',sub:''},limit:3,signature:overview.signature};
 const results=await Promise.all([post(body),post(body)]);
 assert.equal(results[0].status,200);assert.equal(results[1].status,200);assert.deepEqual(results[0].progress,results[1].progress);
 assert.equal([...m.db.values()].filter(r=>r.kind==='labRecallSession').length,1);
});
