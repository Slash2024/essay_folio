import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-annotation-'));
const archive=`export const db=new Map();export async function find(id){return db.get(id)||null}export const decode=r=>JSON.parse(r.payload);export async function put(id,kind,p,existing){if(!existing&&db.has(id))throw Error('duplicate');const row={_id:id,kind,writingId:p.writingId||'',payload:JSON.stringify(p)};db.set(id,row);return row}export async function list(){return {rows:[],total:0,hasNext:false}}export async function all(kind){return [...db.values()].filter(r=>r.kind===kind)}export async function deleteRow(id){db.delete(id)}`;
// Wix reads values by name, but updates secrets by ID. Keep those distinct.
const secrets=`export const values=new Map();const id=name=>'secret-id-'+name;export const secrets={listSecretInfo:async()=>({secrets:[...values].map(([name])=>({_id:id(name),name}))}),getSecretValue:async name=>{if(!values.has(name))throw Error('Secret name not found');return {value:values.get(name)}},createSecret:async s=>{values.set(s.name,s.value);return {_id:id(s.name)}},updateSecret:async(secretId,s)=>{const name=[...values.keys()].find(n=>id(n)===secretId);if(!name)throw Error('Secret ID not found');values.set(name,s.value)}}`;
let providerCalls=0,latestBody=null;const realFetch=globalThis.fetch;
try{
 await build({stdin:{contents:"export {POST} from './src/pages/api/annotation-ai';export {POST as folioPOST} from './src/pages/api/folio';export {effectiveIssues} from './src/lib/analytics';export {newPersonalNote,curatedNotes} from './src/lib/review-curation';export {parseAppealDecision} from './src/lib/annotation-appeal';export {db,put} from './src/server/archive';export * from './src/lib/annotation-alignment';export * from './src/lib/review-interactions';export {readingRows,sentenceDisplays} from './src/lib/sentence-reading';export {endpoint} from './src/server/annotation-config';export {values} from '@wix/secrets';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'isolated',setup(b){
  b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'test'}));b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'test'}));b.onResolve({filter:/^@wix\/secrets$/},()=>({path:'secrets',namespace:'test'}));b.onResolve({filter:/^@wix\/essentials$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:path==='secrets'?secrets:path==='auth'?'export const auth={elevate:f=>f}':'export const authorized=async r=>r.headers.get("x-auth")!=="no",sameOrigin=r=>r.headers.get("origin")!=="https://foreign.invalid";export const accessConfig=async()=>({signing:"test"}),equal=(a,b)=>a===b,sign=async()=>"test",makeSession=async()=>"test",secret=async()=>"test",SITE_ORIGIN="https://test.invalid";'}));
 }}]});
 const m=await import(join(dir,'api.mjs'));const call=async(action,data={},headers={})=>{const r=await m.POST({request:new Request('https://test.invalid/api/annotation-ai',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action,...data})})});return {status:r.status,...await r.json()};};
 assert.equal((await call('config',{}, {'x-auth':'no'})).status,401);assert.equal((await call('config',{}, {origin:'https://foreign.invalid'})).status,403);
 assert.equal((await call('config')).config.configured,false);assert.equal(providerCalls,0);
 for(const url of ['http://api.example.com','https://127.0.0.1','https://localhost','https://api.example.com?apiKey=private'])assert.throws(()=>m.endpoint(url));assert.equal(m.endpoint('https://api.example.com/v1'),'https://api.example.com/v1/chat/completions');
 let result=await call('saveConfig',{baseURL:'https://api.example.com/v1',model:'test-model',apiKey:'test-private-key',enabled:true,jsonMode:true,revision:''});assert.equal(result.status,200);assert(!JSON.stringify(result).includes('test-private-key'));const revision=result.config.revision;
 assert.equal((await call('saveConfig',{baseURL:'https://api.example.com',model:'wrong',apiKey:'key',enabled:true,revision:'stale'})).status,409);
 result=await call('saveConfig',{baseURL:'https://api.example.com/v1',model:'test-model',apiKey:'',enabled:true,jsonMode:true,revision});assert.equal(result.status,200);assert.equal(JSON.parse(m.values.get('ESSAY_ANNOTATION_LLM')).apiKey,'test-private-key');
 const savedConfig=await call('config');assert.equal(savedConfig.status,200);assert.equal(savedConfig.config.configured,true);assert.equal(savedConfig.config.model,'test-model');assert(!JSON.stringify(savedConfig).includes('test-private-key'));assert.equal(providerCalls,0);
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
 // A complete appeal uses the same review and original revision as the annotation tools.
 const folio=async(action,data={})=>{
  const r=await m.folioPOST({request:new Request('https://test.invalid/api/folio',{method:'POST',body:JSON.stringify({action,...data})})});
  return {status:r.status,...await r.json()};
 };
 await m.put(review.id,'review',review,m.db.get(review.id));
 await m.put('writing-ai-v1','revision',{writingId:'writing-ai',text:original+' Another sentence.'},m.db.get('writing-ai-v1'));
 const materials=await call('appealMaterials',{reviewId:review.id,noteId});
 assert.equal(materials.status,200);assert.equal(materials.materials.original,original);assert.equal(materials.materials.context.next,'Another sentence.');
 assert.equal(materials.materials.type,'large');assert(materials.materials.wordRule.includes('少于90词'));
 assert.equal(providerCalls,2);
 let adjudication={verdict:'revise',summary:'改为可选优化',response:'原搭配正确，更换只是措辞优化。',evidence:['“People   pay more attention”'],patch:{kind:'optimization',explanation:'两种搭配均可使用。',replacement:revised},neededContext:null};
 globalThis.fetch=async(url,init)=>{
  providerCalls++;latestBody=JSON.parse(init.body);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(adjudication)}}]}));
 };
 const appealRequest={reviewId:review.id,noteId,requestId:crypto.randomUUID(),reason:'原搭配正确',fingerprint:materials.fingerprint};
 const originalReview=m.db.get(review.id).payload;
 let appeal=await call('previewAppeal',appealRequest);
 assert.equal(appeal.status,200);assert.equal(appeal.candidate.decision.verdict,'revise');assert.equal(providerCalls,3);
 assert.deepEqual(appeal.candidate.decision.evidence,['People pay more attention']);
 const sourceQuote='People’s attention\nchanged.';
 assert.deepEqual(m.parseAppealDecision({...adjudication,evidence:["People's attention changed."]},[sourceQuote]).evidence,[sourceQuote]);
 assert(latestBody.messages[0].content.includes('图画、图表和材料题各按本题要求判断'));
 assert(!latestBody.messages[0].content.includes('最值得积累的表达'));
 const sent=JSON.parse(latestBody.messages[1].content);
 assert.equal(sent.original,original);assert.equal(sent.reason,'原搭配正确');assert(!sent.context&&!sent.rubric&&!sent.task&&!sent.wordRule);
 assert.equal(m.db.get(review.id).payload,originalReview);
 assert.equal((await call('previewAppeal',appealRequest)).cached,true);assert.equal(providerCalls,3);
 assert.equal((await call('previewAppeal',{...appealRequest,reason:'另一个理由'})).status,409);assert.equal(providerCalls,3);
 const accept={reviewId:review.id,noteId,baseRevision:0,operation:'acceptAppeal',candidateId:appeal.candidate.id};
 assert.equal((await folio('saveReviewCuration',{...accept,noteId:'wrong-note'})).status,409);
 assert.equal((await folio('saveReviewCuration',{...accept,baseRevision:3})).status,409);
 const adopted=await folio('saveReviewCuration',accept);
 assert.equal(adopted.status,200);assert.equal(adopted.review.markdown,markdown);
 assert.equal(adopted.review.study.entries[noteId].starred,true);
 assert.equal(adopted.review.curation.notes[noteId].kind,'optimization');
 assert.equal(m.effectiveIssues(adopted.review).length,0);
 const remembered=markdown+'\n## 5. 最值得记住的错误\n- 需要关注固定搭配。';
 const ambiguous={...adopted.review,analysis:undefined,markdown:remembered};
 assert.equal(m.effectiveIssues(ambiguous).length,1,'an appeal must not remove a category-only summary');
 const versionId=adopted.review.curation.notes[noteId].appealVersion;
 const history=await folio('getReviewCurationVersion',{reviewId:review.id,versionId});
 assert.equal(history.version.appeal.candidate.reason,'原搭配正确');
 assert.equal((await folio('saveReviewCuration',accept)).unchanged,true);
 const restored=await folio('saveReviewCuration',{reviewId:review.id,noteId,baseRevision:1,operation:'undoAppeal',versionId});
 assert.equal(restored.status,200);assert.equal(restored.review.curation.notes[noteId],undefined);
 assert.equal(m.effectiveIssues(restored.review).length,1);
 assert.equal(providerCalls,3);
 assert.equal((await folio('saveReviewCuration',accept)).unchanged,true);

 // Invalid evidence and non-actionable rulings cannot reach curation.
 adjudication={...adjudication,evidence:['invented quote']};
 const unmatched=await call('previewAppeal',{...appealRequest,requestId:crypto.randomUUID()});
 assert.equal(unmatched.status,200);assert.deepEqual(unmatched.candidate.decision.evidence,[]);
 assert.equal(unmatched.candidate.decision.unverifiedEvidence,1);
 assert.equal(unmatched.candidate.decision.summary,adjudication.summary);
 assert.equal((await folio('saveReviewCuration',{...accept,baseRevision:2,candidateId:unmatched.candidate.id})).status,409);
 adjudication={verdict:'insufficient',summary:'证据不足',response:'需要题目要求。',evidence:[],patch:null,neededContext:'题目的文体要求'};
 const insufficient=await call('previewAppeal',{...appealRequest,requestId:crypto.randomUUID(),includeContext:true,includeTask:true,includeWordRule:true,rubricBand:0});
 assert.equal(insufficient.status,200);assert.deepEqual(insufficient.candidate.changes,[]);
 const expanded=JSON.parse(latestBody.messages[1].content);
 assert.equal(expanded.context.next,'Another sentence.');assert(expanded.task);assert(expanded.rubric.includes('17-20分'));assert(expanded.wordRule.includes('少于90词'));
 assert.equal((await folio('saveReviewCuration',{...accept,baseRevision:2,candidateId:insufficient.candidate.id})).status,409);
 adjudication={verdict:'withdraw',summary:'撤回意见',response:'原句成立。',evidence:[original],patch:null,neededContext:null};
 appeal=await call('previewAppeal',{...appealRequest,requestId:crypto.randomUUID()});
 assert.equal(appeal.status,200);assert.equal(appeal.candidate.changes[0].field,'暂不采纳');
 const latest=JSON.parse(m.db.get(review.id).payload);
 await m.put(review.id,'review',{...latest,study:{...latest.study,entries:{[noteId]:{...latest.study.entries[noteId],anchor:{start:0,end:6}}}}},m.db.get(review.id));
 assert.equal((await folio('saveReviewCuration',{...accept,baseRevision:2,candidateId:appeal.candidate.id})).status,409);
 assert.equal(JSON.parse(m.db.get(review.id).payload).curation.revision,2);

 // The two large pools share a standard. Small essays get only their own rule.
 for(const [questionId,type,clause] of [['2024-small','small','少于70词'],['2024-english-two-large','large','少于90词']]){
  const other={...review,id:'review-'+questionId,questionId};
  await m.put(other.id,'review',other);
  const data=await call('appealMaterials',{reviewId:other.id,noteId});
  assert.equal(data.status,200);assert.equal(data.materials.type,type);assert(data.materials.wordRule.includes(clause));
 }

 // Full-text alignment uses only the bound original and section six.
 const fullOriginal='People pay more attention to their health.';
 const fullRevised='People attach greater importance to their health.';
 const fullMarkdown=markdown+'\n\n## 6. 修改后的完整作文\n'+fullRevised;
 const fullReview={...review,id:'review-full',markdown:fullMarkdown};
 await m.put(fullReview.id,'review',fullReview);
 await m.put('writing-ai-v1','revision',{writingId:'writing-ai',text:fullOriginal},m.db.get('writing-ai-v1'));
 const fullRequest={reviewId:fullReview.id,noteId:'full-essay',requestId:'full-one'};
 globalThis.fetch=async(url,init)=>{
  providerCalls++;latestBody=JSON.parse(init.body);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({segments})}}]}));
 };
 const callsBefore=providerCalls;
 let full=await call('generate',fullRequest);
 assert.equal(full.status,200);assert.equal(full.candidate.original,fullOriginal);
 assert.equal(full.candidate.revised,fullRevised);assert.equal(full.candidate.display,'essay');
 assert.equal(JSON.parse(latestBody.messages[1].content).revised,fullRevised);
 assert(latestBody.messages[0].content.includes('两篇完整作文'));
 assert(!JSON.parse(m.db.get(fullReview.id).payload).alignments);
 assert.equal((await call('generate',fullRequest)).cached,true);
 assert.equal(providerCalls,callsBefore+1);
 const fullAccept={...fullRequest,candidateId:full.candidate.id,baseRevision:0};
 full=await call('accept',fullAccept);
 assert.equal(full.status,200);assert.equal(full.review.markdown,fullMarkdown);
 assert(m.currentAlignment(full.review.alignments,'full-essay',{original:fullOriginal,revised:fullRevised,display:'essay'}));
 assert(!m.currentAlignment(full.review.alignments,noteId,{original:fullOriginal,revised:fullRevised,display:'auto'}));
 full=await call('rules',{...fullRequest,baseRevision:1});
 assert.equal(full.status,200);assert.equal(full.review.alignments.entries['full-essay'].current,null);
 full=await call('undo',{...fullRequest,baseRevision:2});
 assert.equal(full.status,200);assert(full.review.alignments.entries['full-essay'].current);
 const fullRow=m.db.get(fullReview.id),fullChanged=JSON.parse(fullRow.payload);
 fullChanged.markdown=fullMarkdown+' More detail.';
 fullRow.payload=JSON.stringify(fullChanged);
 assert.equal((await call('accept',{...fullAccept,baseRevision:3})).status,409);
 fullChanged.markdown=markdown;
 fullRow.payload=JSON.stringify(fullChanged);
 assert.equal((await call('generate',{...fullRequest,requestId:'full-missing'})).status,400);
 assert.equal(providerCalls,callsBefore+1);

 // A regular personal note can be saved while a decision is pending and survives adoption/undo.
 const notedReview={...review,id:'review-with-note'};
 await m.put(notedReview.id,'review',notedReview);
 globalThis.fetch=async(url,init)=>{
  providerCalls++;
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
   verdict:'revise',summary:'改为可选优化',response:'原搭配成立，可作为措辞优化。',
   evidence:[original],patch:{kind:'optimization',explanation:'两种搭配均可使用。',replacement:revised},neededContext:null
  })}}]}));
 };
 const noteMaterials=await call('appealMaterials',{reviewId:notedReview.id,noteId});
 const pendingDecision=await call('previewAppeal',{
  reviewId:notedReview.id,noteId,requestId:crypto.randomUUID(),reason:'保留原搭配',
  fingerprint:noteMaterials.fingerprint
 });
 assert.equal(pendingDecision.status,200);
 const personal=m.newPersonalNote(original,{start:0,end:original.length});
 personal.shortNote='两种搭配均可使用';
 personal.explanation='按考场复现需要选择熟悉的搭配。';
 let noted=await folio('saveReviewCuration',{
  reviewId:notedReview.id,baseRevision:0,operation:'upsert',note:personal
 });
 assert.equal(noted.status,200);assert.equal(noted.review.markdown,markdown);
 assert.equal(noted.review.curation.notes[personal.id].origin,'personal');
 assert.equal(noted.review.curation.notes[personal.id].scope,'range');
 assert.equal(noted.review.curation.revision,1);
 assert(!noted.review.curation.notes[noteId],'saving a note must leave the disputed opinion intact');
 const repeatedSave=await folio('saveReviewCuration',{
  reviewId:notedReview.id,baseRevision:1,operation:'upsert',note:personal
 });
 assert.equal(repeatedSave.unchanged,true);
 const adopt=await folio('saveReviewCuration',{
  reviewId:notedReview.id,noteId,baseRevision:1,operation:'acceptAppeal',candidateId:pendingDecision.candidate.id
 });
 assert.equal(adopt.status,200);
 assert.equal(adopt.review.curation.notes[personal.id].explanation,personal.explanation);
 const afterUndo=await folio('saveReviewCuration',{
  reviewId:notedReview.id,noteId,baseRevision:2,operation:'undoAppeal',
  versionId:adopt.review.curation.notes[noteId].appealVersion
 });
 assert.equal(afterUndo.status,200);
 assert.equal(afterUndo.review.curation.notes[personal.id].kind,'personal');
 assert.equal(afterUndo.review.markdown,markdown);
 assert.equal(afterUndo.review.study.entries[noteId].starred,true);
 console.log('PASS appeal notes: existing upsert contract, original opinion preserved, current revision adoption, note survival through appeal undo and idempotent note retry.');
 console.log('PASS full-text API: server-owned section-six pair, preview isolation, cached generation, explicit adoption, independent history, rules/undo and stale-source rejection.');
 console.log('PASS annotation appeal: fixed criteria, exact materials, preview-only model call, verified evidence, idempotent adoption, stale checks, history and undo.');
 console.log('PASS annotation API: auth/origin, secret redaction, config revision, no implicit calls, generation replay, strict text validation, preview isolation, adoption, locked rendering, undo, stale rejection and failure handling.');
}finally{globalThis.fetch=realFetch;await rm(dir,{recursive:true,force:true});}
