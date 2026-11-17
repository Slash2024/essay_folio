import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'folio-template-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({ stdin: { contents: "export {GET,POST} from './src/pages/api/template-training';export {GET as home} from './src/pages/api/laboratory-home';export {POST as feedback} from './src/pages/api/laboratory-feedback';export {db,put,failures} from './src/server/archive';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'), plugins: [{ name: 'isolate', setup(b) {
  b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({path:'archive',namespace:'test'}));
  b.onResolve({ filter: /server\/session$/ }, () => ({path:'session',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:"export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');"}));
} }] });
const m = await import(join(dir, 'api.mjs'));
after(() => rm(dir, {recursive:true,force:true}));
beforeEach(async () => {
 m.db.clear();m.failures.clear();
 await m.put('formal-writing','writing',{id:'formal-writing',questionId:'2024-large',text:'Unchanged original',revision:1});
 await m.put('expression-library','expressions',{revision:1,sentences:[{id:'test-template',category:'原因',title:'Practice template',template:'Underlying {{A}} were {{B}}.',notes:'填入主题和原因',substitutions:'',enabled:true}],words:[],tolerance:'balanced',sourceText:''});
});
async function get(query='',handler=m.GET,headers={'x-auth':'1'}) { const response=await handler({request:new Request('https://test.invalid/api/template-training'+query,{headers})});return {status:response.status,...await response.json()}; }
async function post(body,handler=m.POST,headers={'x-auth':'1'}) {const response=await handler({request:new Request('https://test.invalid/api/template-training',{method:'POST',headers,body:JSON.stringify(body)})});return {status:response.status,...await response.json()};}
const id='lab-template-12345678-1234-1234-1234-123456789abc';
const checks={topic:'matched',reference:'na',support:'matched',task:'matched'};
async function selection(){const overview=await get();const q=overview.questions.filter(q=>q.type==='small').slice(0,3);return {action:'start',id,expressionId:'test-template',mode:'small',questionIds:q.map(q=>q.id),signature:overview.signature,confirmed:true};}
const answer=(index,extra={})=>({action:'answer',id,index,task:'Respond to the current task',decision:'adapt',answer:'This message responds to the current task.',unable:false,confirmed:true,elapsedSeconds:31,...extra});
async function complete(index){await post(answer(index));return post({action:'assess',id,index,checks});}
test('selection validates distinct same-type questions and source revision without changing formal records',async()=>{
 const before=JSON.stringify([...m.db]);const start=await selection();
 assert.equal((await post({...start,confirmed:false})).status,400);
 assert.equal((await post({...start,questionIds:[start.questionIds[0],start.questionIds[0],start.questionIds[2]]})).status,400);
 assert.equal((await post({...start,mode:'picture'})).status,409);
 assert.equal((await post({...start,signature:'stale'})).status,409);
 const saved=await post(start);assert.equal(saved.status,200);assert.equal(saved.progress.session.questions.length,3);
 assert.equal((await post(start)).progress.session.createdAt,saved.progress.session.createdAt);
 assert.equal((await post({...start,questionIds:[...start.questionIds].reverse()})).status,409);
 assert.equal(JSON.stringify([...m.db].filter(([,row])=>!row.kind.startsWith('labTemplate'))),before);
 // Preserve snapshots even if the expression library changes.
 m.db.delete('expression-library');assert.equal((await get('?session='+id)).progress.session.expression.title,'Practice template');
});
test('ordered answers and self-checks are durable, idempotent, conflict-safe and recover after failures',async()=>{
 await post(await selection());
 assert.equal((await post(answer(1))).status,400);
 assert.equal((await post({action:'assess',id,index:0,checks})).status,400);
 assert.equal((await post(answer(0,{confirmed:false}))).status,400);
 m.failures.add('labTemplateAttempt');assert.equal((await post(answer(0))).status,503);
 assert.equal((await post(answer(0))).status,200);assert.equal((await post(answer(0))).status,200);
 assert.equal((await post(answer(0,{answer:'A changed answer'}))).status,409);
 assert.equal((await post({action:'assess',id,index:0,checks:{...checks,topic:'na'}})).status,400);
 m.failures.add('labTemplateResult');assert.equal((await post({action:'assess',id,index:0,checks})).status,503);
 assert.equal((await post({action:'assess',id,index:0,checks})).status,200);
 const queue=await get('',m.home);assert.equal(queue.items[0].route.view,'template');assert.equal(queue.items[0].route.sessionId,id);
 await complete(1);await complete(2);assert.deepEqual((await get('',m.home)).items,[]);
});
test('fourth question is unused and same-type; validation persists hint use and returns only self-reported checks',async()=>{
 const start=await selection();await post(start);
 const all=await get(),fourth=all.questions.find(q=>q.type==='small'&&!start.questionIds.includes(q.id));
 assert.equal((await post({action:'validation',id,questionId:fourth.id,confirmed:true})).status,400);
 for(const i of [0,1,2])await complete(i);
 assert.equal((await post({action:'validation',id,questionId:start.questionIds[0],confirmed:true})).status,400);
 const validation={action:'validation',id,questionId:fourth.id,confirmed:true};assert.equal((await post(validation)).status,200);assert.equal((await post(validation)).status,200);
 assert.match((await get('',m.home)).items[0].title,/独立验证/);
 await post({action:'hint',id});await post(answer(3));
 const p=(await get('?session='+id)).progress;assert.equal(p.attempts.find(a=>a.index===3).hintUsed,true);
 assert.equal((await post({action:'assess',id,index:3,checks})).status,200);
 assert.deepEqual((await get('',m.home)).items,[]);assert.equal(Object.hasOwn(p,'score'),false);
 assert.equal((await post({...validation,questionId:all.questions.find(q=>q.type==='small'&&!start.questionIds.includes(q.id)&&q.id!==fourth.id).id})).status,409);
});
test('unable answers cannot be marked matched, feedback links to experiment and access is enforced',async()=>{
 const start=await selection();assert.equal((await post(start,m.POST,{})).status,401);assert.equal((await get('',m.GET,{})).status,401);
 assert.equal((await post(start,m.POST,{'x-auth':'1','x-foreign':'1'})).status,403);await post(start);
 assert.equal((await post(answer(0,{unable:true,answer:''}))).status,200);
 assert.equal((await post({action:'assess',id,index:0,checks})).status,400);
 assert.equal((await post({action:'assess',id,index:0,checks:{topic:'uncertain',reference:'na',support:'uncertain',task:'uncertain'}})).status,200);
 const feedback={id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'template',contextId:id,phase:'result',ease:'smooth',value:'helpful',factors:['applying','checking']};
 assert.equal((await post(feedback,m.feedback)).status,200);assert.equal((await post(feedback,m.feedback)).status,200);
 assert.equal((await post({...feedback,id:'lab-feedback-22222222-1234-1234-1234-123456789abc',contextId:'formal-writing'},m.feedback)).status,404);
});
