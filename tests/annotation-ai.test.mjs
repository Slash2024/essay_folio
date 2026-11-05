import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-annotation-'));
const archive=`export const db=new Map();export async function find(id){return db.get(id)||null}export const decode=r=>JSON.parse(r.payload);export async function put(id,kind,p,existing){if(!existing&&db.has(id))throw Error('duplicate');const row={_id:id,kind,writingId:p.writingId||'',payload:JSON.stringify(p)};db.set(id,row);return row}export async function list(){return {rows:[],total:0,hasNext:false}}export async function all(kind){return [...db.values()].filter(r=>r.kind===kind)}export async function deleteRow(id){db.delete(id)}`;
const secrets=`export const values=new Map();export const secrets={listSecretInfo:async()=>({secrets:[...values].map(([name,v])=>({_id:name,name}))}),getSecretValue:async name=>({value:values.get(name)}),createSecret:async s=>{values.set(s.name,s.value);return {_id:s.name}},updateSecret:async(id,s)=>{values.set(id,s.value)}}`;
let providerCalls=0,latestBody=null;const realFetch=globalThis.fetch;
try{
 await build({stdin:{contents:"export {POST} from './src/pages/api/annotation-ai';export {db,put} from './src/server/archive';export * from './src/lib/annotation-alignment';export * from './src/lib/review-interactions';export {readingRows,sentenceDisplays} from './src/lib/sentence-reading';export {endpoint} from './src/server/annotation-config';export {values} from '@wix/secrets';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'isolated',setup(b){
  b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'test'}));b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'test'}));b.onResolve({filter:/^@wix\/secrets$/},()=>({path:'secrets',namespace:'test'}));b.onResolve({filter:/^@wix\/essentials$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:path==='secrets'?secrets:path==='auth'?'export const auth={elevate:f=>f}':'export const authorized=async r=>r.headers.get("x-auth")!=="no",sameOrigin=r=>r.headers.get("origin")!=="https://foreign.invalid";'}));
 }}]});
 const m=await import(join(dir,'api.mjs'));const call=async(action,data={},headers={})=>{const r=await m.POST({request:new Request('https://test.invalid/api/annotation-ai',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action,...data})})});return {status:r.status,...await r.json()};};
 assert.equal((await call('config',{}, {'x-auth':'no'})).status,401);assert.equal((await call('config',{}, {origin:'https://foreign.invalid'})).status,403);
 assert.equal((await call('config')).config.configured,false);assert.equal(providerCalls,0);
 for(const url of ['http://api.example.com','https://127.0.0.1','https://localhost','https://api.example.com?apiKey=private'])assert.throws(()=>m.endpoint(url));assert.equal(m.endpoint('https://api.example.com/v1'),'https://api.example.com/v1/chat/completions');
 let result=await call('saveConfig',{baseURL:'https://api.example.com/v1',model:'test-model',apiKey:'test-private-key',enabled:true,jsonMode:true,revision:''});assert.equal(result.status,200);assert(!JSON.stringify(result).includes('test-private-key'));const revision=result.config.revision;
 assert.equal((await call('saveConfig',{baseURL:'https://api.example.com',model:'wrong',apiKey:'key',enabled:true,revision:'stale'})).status,409);
 result=await call('saveConfig',{baseURL:'https://api.example.com/v1',model:'test-model',apiKey:'',enabled:true,jsonMode:true,revision});assert.equal(result.status,200);assert.equal(JSON.parse(m.values.get('ESSAY_ANNOTATION_LLM')).apiKey,'test-private-key');
 const original='People pay more attention to their health.',revised='People attach greater importance to their health.';
 const segments=[{type:'keep',before:'People ',after:'People '},{type:'replace',before:'pay more attention to',after:'attach greater importance to'},{type:'keep',before:' their health.',after:' their health.'}];
 const pair={original,revised,display:'auto'};assert.deepEqual(m.validateSegments({segments},pair),segments);assert.throws(()=>m.validateSegments({segments:[{type:'replace',before:original,after:revised+' '}]},pair));assert.throws(()=>m.validateSegments({segments:[{type:'keep',before:original,after:revised}]},pair));
 const markdown=`## 3. 逐句批改\n【原句】：${original}\n【修改与说明】\n修改为：${revised}\n说明：固定搭配。`;
 const noteId=m.interactionId('c',original+'\n'+revised+'\n固定搭配。');
 const review={id:'review-ai',writingId:'writing-ai',questionId:'2024-large',label:'批阅',filename:'review.md',createdAt:'2026-11-05T00:00:00Z',revisionId:'writing-ai-v1',markdown,study:{revision:1,entries:{[noteId]:{starred:true,status:'revisit'}}}};
 await m.put('writing-ai','writing',{id:'writing-ai',status:'reviewed',text:original});await m.put('writing-ai-v1','revision',{writingId:'writing-ai',text:original});await m.put(review.id,'review',review);
 let invalid=false;globalThis.fetch=async(url,init)=>{providerCalls++;latestBody=JSON.parse(init.body);assert.equal(init.headers.Authorization,'Bearer test-private-key');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({segments:invalid?[{type:'replace',before:original,after:revised+'Extra.'}]:segments})}}]}),{headers:{'content-type':'application/json'}});};
 const request={reviewId:review.id,noteId,requestId:'request-one'};
 result=await call('generate',request);assert.equal(result.status,200);assert.equal(providerCalls,1);assert.equal(latestBody.model,'test-model');assert(!latestBody.messages[1].content.includes('2024'));assert(!JSON.parse(m.db.get(review.id).payload).alignments);const candidate=result.candidate;
 assert.equal((await call('generate',request)).cached,true);assert.equal(providerCalls,1);
 assert.equal((await call('accept',{...request,candidateId:candidate.id,baseRevision:2})).status,409);
 result=await call('accept',{...request,candidateId:candidate.id,baseRevision:0});assert.equal(result.status,200);assert.equal(result.review.markdown,markdown);assert.equal(result.review.study.entries[noteId].starred,true);assert.equal(result.review.alignments.revision,1);
 const active=m.currentAlignment(result.review.alignments,noteId,pair);assert(active);const parts=m.alignmentParts(active.segments);assert(parts.every(p=>p.locked));assert.equal(parts.filter(p=>p.type!=='add').map(p=>p.value).join(''),original);assert.equal(parts.filter(p=>p.type!=='remove').map(p=>p.value).join(''),revised);
 const display=m.sentenceDisplays(original,m.readingRows(original).rows,[{note:{id:noteId,kind:'correction',title:'纠错',original,replacement:revised,explanation:'固定搭配。',position:null,categories:[]},range:{start:0,end:original.length},source:'quote'}],result.review.alignments)[0];assert(display.parts.some(p=>p.locked));assert.equal(display.parts.find(p=>p.type==='remove').value,'pay more attention to');
 assert.equal(m.currentAlignment(result.review.alignments,noteId,{...pair,revised:'Changed.'}),null);
 assert.equal((await call('accept',{...request,candidateId:candidate.id,baseRevision:0})).unchanged,true);
 result=await call('undo',{...request,baseRevision:1});assert.equal(result.status,200);assert.equal(result.review.alignments.entries[noteId].current,null);assert.equal(providerCalls,1);
 invalid=true;result=await call('generate',{...request,requestId:'request-invalid'});assert.equal(result.status,502);assert(result.error.includes('文字'));assert.equal(providerCalls,2);assert.equal((await call('generate',{...request,requestId:'request-invalid'})).status,502);assert.equal(providerCalls,2);
 // A candidate cannot overwrite an edited correction.
 const row=m.db.get(review.id),changed=JSON.parse(row.payload);changed.markdown=markdown.replace(revised,'People care about health.');row.payload=JSON.stringify(changed);assert.equal((await call('accept',{...request,candidateId:candidate.id,baseRevision:2})).status,400);
 assert(!JSON.stringify(JSON.parse(row.payload)).includes('test-private-key'));
 console.log('PASS annotation API: auth/origin, secret redaction, config revision, no implicit calls, generation replay, strict text validation, preview isolation, adoption, locked rendering, undo, stale rejection and failure handling.');
}finally{globalThis.fetch=realFetch;await rm(dir,{recursive:true,force:true});}
