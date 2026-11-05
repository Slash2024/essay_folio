import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {after, beforeEach, test} from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'folio-consistency-'));
const archive = `
export const db = new Map();
export const failures = new Set();
export const decode = row => JSON.parse(row.payload);
export async function find(id) { return db.get(id) || null; }
export async function put(id, kind, payload, existing) {
  if (failures.delete(kind)) throw Error('Injected storage failure');
  if (!existing && db.has(id)) throw Error('Duplicate ID');
  const row = {_id: id, kind, writingId: payload.writingId || '', payload: JSON.stringify(payload)};
  db.set(id, row);
  return row;
}
export async function list(kind, {writingId = '', offset = 0, limit = 50} = {}) {
  const rows = [...db.values()].filter(row => row.kind === kind && (!writingId || row.writingId === writingId));
  return {rows: rows.slice(offset, offset + limit), total: rows.length, hasNext: rows.length > offset + limit};
}
export async function all(kind) { return [...db.values()].filter(row => row.kind === kind); }
export async function deleteRow(id) { db.delete(id); }
`;
await build({
  stdin: {contents: "export {POST} from './src/pages/api/folio'; export {db, failures} from './src/server/archive'; export {modelCalls} from './src/server/annotation-provider';", resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'),
  plugins: [{name: 'isolated-storage', setup(b) {
    b.onResolve({filter: /server\/archive$|^\.\/archive$/}, () => ({path: 'archive', namespace: 'test'}));
    b.onResolve({filter: /server\/session$|^\.\/session$/}, () => ({path: 'session', namespace: 'test'}));
    b.onResolve({filter: /annotation-config$/}, () => ({path: 'config', namespace: 'test'}));
    b.onResolve({filter: /annotation-provider$/}, () => ({path: 'provider', namespace: 'test'}));
    b.onLoad({filter: /.*/, namespace: 'test'}, ({path}) => ({loader: 'js', contents: path === 'archive' ? archive : path==='config' ? `
      export class AlignmentError extends Error {constructor(message,status=400){super(message);this.status=status;}}
      export const getAnnotationConfig=async()=>({enabled:true,apiKey:'fake'});
    ` : path==='provider' ? `
      export const modelCalls=[];
      export async function requestModelJSON(config,prompt,body){
        modelCalls.push(body);
        return {items:body.items.map(({id})=>({id,categories:['词义与主题'],reason:'语境中的含义不匹配'}))};
      }
    ` : `
      export const authorized=async()=>true, sameOrigin=()=>true, equal=(a,b)=>a===b,
        makeSession=async()=>'', accessConfig=async()=>({signing:'synthetic'}),
        sign=async message=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message))).toString('base64url'),
        secret=async()=>{throw Error('No external services in tests')}, SITE_ORIGIN='https://test.invalid';
    `}));
  }}],
});
const {POST, db, failures, modelCalls} = await import(join(dir, 'api.mjs'));
after(() => rm(dir, {recursive: true, force: true}));
beforeEach(() => { db.clear(); failures.clear(); modelCalls.length=0; });
async function raw(body) {
  const response = await POST({request: new Request('https://test.invalid/api/folio', {
    method: 'POST', headers: {'content-type': 'application/json'}, body,
  })});
  return {status: response.status, ...await response.json()};
}
const call = (action, data = {}) => raw(JSON.stringify({action, ...data}));
const writing = {id: 'synthetic-writing', questionId: '2024-large', text: 'A synthetic essay.', prompt: 'Test prompt', rubric: 'Test rubric'};
const review = {id: 'synthetic-review', writingId: writing.id, markdown: '8. 评分\n预估分数：14/20分。', filename: 'synthetic.md', label: 'Synthetic review'};

test('stale draft save and submit preserve the newer cloud text', async () => {
  const first = await call('draft', writing);
  const next = await call('draft', {...writing, text: 'Newer cloud text.', baseUpdatedAt: first.writing.updatedAt});
  assert.equal(next.status, 200);
  assert.notEqual(next.writing.updatedAt, first.writing.updatedAt);
  for (const action of ['draft', 'submit']) {
    const stale = await call(action, {...writing, text: 'Stale tab text.', baseUpdatedAt: first.writing.updatedAt});
    assert.equal(stale.status, 409);
    assert.equal(JSON.parse(db.get(writing.id).payload).text, 'Newer cloud text.');
  }
  assert.equal((await call('draft', {...writing, text: 'Missing version.'})).status, 409);
  assert.equal((await call('draft', {...writing, questionId: '2023-large', baseUpdatedAt: next.writing.updatedAt})).status, 409);
});

test('identical draft retries return the saved revision without rewriting', async () => {
  const first = await call('draft', writing);
  const stored = db.get(writing.id);
  const retry = await call('draft', {...writing, baseUpdatedAt: null});
  assert.equal(db.get(writing.id), stored);
  assert.equal(retry.status, 200);
  assert.equal(retry.writing.updatedAt, first.writing.updatedAt);
});

test('submit retry recovers a missing version after partial persistence', async () => {
  failures.add('revision');
  assert.equal((await call('submit', writing)).status, 500);
  assert.equal(db.has(writing.id), true);
  const retry = await call('submit', writing);
  assert.equal(retry.status, 200);
  assert.equal(retry.versions.length, 1);
  assert.equal(retry.versions[0].text, writing.text);
  assert.equal(retry.alreadySubmitted, true);
  assert.equal((await call('submit', {...writing, text: 'Different retry body.'})).status, 409);
});

test('review retry repairs the writing status and returns a complete response', async () => {
  const submitted = await call('submit', writing);
  const request = {...review, baseUpdatedAt: submitted.writing.updatedAt};
  failures.add('writing');
  assert.equal((await call('review', request)).status, 500);
  assert.equal(db.has(review.id), true);
  const retry = await call('review', request);
  assert.equal(retry.status, 200);
  assert.equal(retry.writing.status, 'reviewed');
  assert.equal(retry.review.analysis.score.point, 14);
  assert.equal(retry.versions.length, 1);
  const repeated = await call('review', request);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.writing.updatedAt, retry.writing.updatedAt);
  assert.equal([...db.values()].filter(row => row.kind === 'review').length, 1);
  assert.equal((await call('review', {...request, markdown: 'Different retry content.'})).status, 409);
  const other = await call('submit', {...writing, id: 'another-writing'});
  assert.equal((await call('review', {...request, writingId: other.writing.id, baseUpdatedAt: other.writing.updatedAt})).status, 409);
});

test('malformed JSON and non-object bodies are client errors', async () => {
  for (const body of ['{', 'null', '[]', '1', '"text"']) {
    assert.equal((await raw(body)).status, 400);
  }
});

test('analytics returns bound reviewed texts and rewrite links without writing data',async()=>{
 const seed=(id,kind,data)=>db.set(id,{_id:id,kind,writingId:data.writingId||'',payload:JSON.stringify(data)});
 seed('w1','writing',{id:'w1',questionId:'2024-large',status:'reviewed',createdAt:'2026-01-01',parentId:'w0',revision:2,text:'CURRENT UNREVIEWED TEXT'});
 seed('v1','revision',{id:'v1',writingId:'w1',text:'BOUND REVIEWED TEXT'});
 seed('v-other','revision',{id:'v-other',writingId:'another-writing',text:'UNRELATED TEXT'});
 seed('r1','review',{id:'r1',writingId:'w1',questionId:'2024-large',revisionId:'v1',markdown:'8. 评分\n预估分数：14/20分。'});
 seed('r2','review',{id:'r2',writingId:'w1',questionId:'2024-large',revisionId:'v-other',markdown:''});
 seed('r3','review',{id:'r3',writingId:'w1',questionId:'2024-large',markdown:''});
 seed('orphan','review',{id:'orphan',writingId:'deleted-writing',questionId:'2024-large',revisionId:'v1',markdown:''});
 const before=JSON.stringify([...db]);const result=await call('analytics');
 assert.equal(result.status,200);assert.equal(result.writings[0].parentId,'w0');
 assert.deepEqual(result.texts,{r1:'BOUND REVIEWED TEXT'});assert.equal(result.reviews.length,3);
 assert(!JSON.stringify(result).includes('CURRENT UNREVIEWED TEXT'));assert(!JSON.stringify(result).includes('UNRELATED TEXT'));
 assert.equal(JSON.stringify([...db]),before);
});

test('opening a writing includes every related review beyond the first 100', async () => {
 await call('submit', writing);
 for(let i=0;i<121;i++){
  const payload={id:`review-${i}`,writingId:writing.id,questionId:writing.questionId,label:`Review ${i}`,filename:'synthetic.md',markdown:'8. 评分\n预估分数：14/20分。',createdAt:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString()};
  db.set(payload.id,{_id:payload.id,kind:'review',writingId:payload.writingId,payload:JSON.stringify(payload)});
 }
 db.set('foreign-review',{_id:'foreign-review',kind:'review',writingId:'other-writing',payload:JSON.stringify({id:'foreign-review',writingId:'other-writing',markdown:''})});
 const result=await call('get',{id:writing.id});
 assert.equal(result.status,200);assert.equal(result.reviews.length,121);
 assert.equal(result.reviews[0].id,'review-120');assert.equal(result.reviews.at(-1).id,'review-0');
 assert(result.reviews.every(r=>r.writingId===writing.id));
});


test('classification is explicit, caches identical inputs, validates stale previews and preserves manual precedence',async()=>{
 const submitted=await call('submit',writing);
 const imported=await call('review',{...review,baseUpdatedAt:submitted.writing.updatedAt,
  markdown:'5. 最值得记住的错误\n- 此处措辞不妥。\n'+review.markdown});
 assert.equal(imported.status,200);
 const issue=imported.review.analysis.issues[0];
 assert.deepEqual(issue.categories,[]);
 const items=[{reviewId:review.id,issueId:issue.id}];
 await call('analytics');
 assert.equal(modelCalls.length,0);
 const generated=await call('classifyIssues',{items});
 assert.equal(generated.status,200);
 const candidate=generated.candidates[0];
 assert.equal((await call('classifyIssues',{items})).status,200);
 assert.equal(modelCalls.length,1);
 assert(!JSON.stringify(modelCalls[0]).includes(writing.text));
 assert.equal((await call('acceptIssueClassification',{items:[{...candidate,expiresAt:0}]})).status,409);
 assert.equal((await call('acceptIssueClassification',{items:[candidate]})).status,200);
 assert.equal((await call('analytics')).reviews[0].issueDecisions[0].source,'llm');
 assert.equal((await call('saveIssueCategories',{reviewId:review.id,issueId:issue.id,categories:['主谓一致']})).status,200);
 assert.equal((await call('analytics')).reviews[0].issueDecisions.length,0);
 assert.equal((await call('classifyIssues',{items})).status,409);
});
