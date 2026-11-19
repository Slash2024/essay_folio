import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const dir = await mkdtemp(join(tmpdir(), 'folio-completion-'));
const realFetch = globalThis.fetch;
const archive = `export const db = new Map();
export async function find(id) { return db.get(id) || null; }
export const decode = row => JSON.parse(row.payload);
export async function put(id, kind, payload, existing) {
  if (!existing && db.has(id)) throw Error('duplicate');
  const row = {_id:id,kind,writingId:payload.writingId || '',payload:JSON.stringify(payload)};
  db.set(id,row); return row;
}
export async function list(kind, {writingId, limit=100, offset=0}={}) {
  const rows = [...db.values()].filter(row => row.kind === kind && (!writingId || row.writingId === writingId));
  return {rows:rows.slice(offset, offset+limit),total:rows.length,hasNext:false};
}
export async function all(kind) { return [...db.values()].filter(row=>row.kind===kind); }
export async function deleteRow(id) { db.delete(id); }`;
const secrets = `export const values = new Map();
export const secrets = {
  listSecretInfo:async()=>({secrets:[...values.keys()].map(name=>({_id:name,name}))}),
  getSecretValue:async name=>({value:values.get(name)}),
  createSecret:async()=>{},updateSecret:async()=>{}
};`;

try {
  await build({
    stdin:{contents:`export {POST} from './src/pages/api/folio';
export {prepareCompletionMessage} from './src/server/completion-encouragement';
export * from './src/lib/completion-encouragement';
export {db,put} from './src/server/archive';
export {values} from '@wix/secrets';`,resolveDir:process.cwd()},
    bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),
    plugins:[{name:'isolated',setup(b) {
      b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'test'}));
      b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'test'}));
      b.onResolve({filter:/^@wix\/secrets$/},()=>({path:'secrets',namespace:'test'}));
      b.onResolve({filter:/^@wix\/essentials$/},()=>({path:'auth',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:
        path==='archive'?archive:path==='secrets'?secrets:path==='auth'?'export const auth={elevate:f=>f}':
          'export const authorized=async r=>r.headers.get("x-auth")!=="no",sameOrigin=r=>r.headers.get("origin")!=="https://foreign.invalid",accessConfig=async()=>({}),equal=(a,b)=>a===b,makeSession=async()=>"",secret=async()=>"",SITE_ORIGIN="https://test.invalid";'}));
    }}],
  });
  const m = await import(join(dir,'api.mjs'));
  const source = 'Beneath the surface lies a steady determination to keep moving.';
  const answer = {
    zh:'你把继续向前的决心写进了这篇作文，也让自己的坚持又有了一次具体的落笔。',
    en:'Beneath the surface of this finished essay lies your steady determination to keep moving.',
    sourcePhrase:'determination to keep moving',
  };
  assert.deepEqual(m.validateCompletionMessage(answer, source),{zh:answer.zh,en:answer.en});
  assert.throws(()=>m.validateCompletionMessage({...answer,sourcePhrase:'surpassing all expectations'},source));
  assert.throws(()=>m.validateCompletionMessage({...answer,en:'You are the best writer and will achieve everything.'},source));
  assert.throws(()=>m.validateCompletionMessage({...answer,zh:answer.zh+'\nMore'},source));

  const config = {baseURL:'https://model.test.invalid/v1',model:'test-model',apiKey:'private-test-key',enabled:true,jsonMode:true,revision:'r1'};
  m.values.set('ESSAY_ANNOTATION_LLM',JSON.stringify(config));
  const writing = {id:'completion-writing',questionId:'2024-large',text:source,status:'draft',createdAt:'2026-11-19T00:00:00Z',updatedAt:'2026-11-19T00:00:00Z'};
  await m.put(writing.id,'writing',writing);
  const call = async (action,data={},headers={}) => {
    const response = await m.POST({request:new Request('https://test.invalid/api/folio',{
      method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action,...data}),
    })});
    return {status:response.status,...await response.json()};
  };
  const input = {writingId:writing.id,text:source};
  assert.equal((await call('prepareCompletionMessage',input,{'x-auth':'no'})).status,401);
  assert.equal((await call('prepareCompletionMessage',input,{origin:'https://foreign.invalid'})).status,403);

  let calls=0, release, sent;
  globalThis.fetch = async (_url, init) => {
    calls++;
    sent=JSON.parse(init.body);
    await new Promise(resolve=>{release=resolve;});
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));
  };
  const first = call('prepareCompletionMessage',input);
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(release);
  assert.deepEqual(JSON.parse(sent.messages[1].content),{essay:source});
  assert(sent.messages[0].content.includes('优先沿用作者原本的句型'));
  assert.equal(calls,1);
  assert.deepEqual((await call('prepareCompletionMessage',input)).message,m.COMPLETION_FALLBACK);
  assert.equal(calls,1,'concurrent generation must not duplicate provider costs');

  const submitted = await call('submit',{id:writing.id,questionId:writing.questionId,text:source,prompt:'Test',baseUpdatedAt:writing.updatedAt});
  assert.equal(submitted.status,200,'submission succeeds while model generation is still pending');
  assert.equal(submitted.writing.status,'submitted');
  release();
  assert.deepEqual((await first).message,{zh:answer.zh,en:answer.en});
  assert.deepEqual((await call('prepareCompletionMessage',{...input,text:source.replace('.', '。')})).message,{zh:answer.zh,en:answer.en});
  assert.equal(calls,1,'first-round punctuation changes share the same result');
  assert.deepEqual((await call('prepareCompletionMessage',{...input,text:'A different essay.'})).message,m.COMPLETION_FALLBACK);
  assert.equal(calls,1,'a stale source must not trigger generation');

  const failedWriting={...writing,id:'failed-writing'};
  await m.put(failedWriting.id,'writing',failedWriting);
  globalThis.fetch=async()=>{calls++;throw Error('provider unavailable');};
  assert.deepEqual(await m.prepareCompletionMessage(failedWriting.id,source),m.COMPLETION_FALLBACK);
  assert.deepEqual(await m.prepareCompletionMessage(failedWriting.id,source),m.COMPLETION_FALLBACK);
  assert.equal(calls,2,'failed calls use a cached fallback without automatic paid retries');

  const deletedWriting={...writing,id:'deleted-writing'};
  await m.put(deletedWriting.id,'writing',deletedWriting);
  globalThis.fetch=async()=>{
    calls++;
    m.db.set(deletedWriting.id,{kind:'deleted',payload:'{}'});
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));
  };
  assert.deepEqual(await m.prepareCompletionMessage(deletedWriting.id,source),m.COMPLETION_FALLBACK);
  assert(![...m.db.values()].some(row=>row.kind==='completionMessage'&&row.writingId===deletedWriting.id));

  const removed=await call('delete',{id:writing.id,confirmed:true,baseUpdatedAt:submitted.writing.updatedAt});
  assert.equal(removed.status,200);
  assert(![...m.db.values()].some(row=>row.kind==='completionMessage'&&row.writingId===writing.id));
  console.log('PASS bilingual manuscript grounding, authorization, cached early generation, concurrent deduplication, nonblocking submission, punctuation identity, fallback and deletion cleanup');
} finally {
  globalThis.fetch=realFetch;
  await rm(dir,{recursive:true,force:true});
}
