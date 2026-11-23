import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {test,beforeEach,after} from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-translation-'));
export const syntheticStore=`
export const db=new Map();
export async function findRow(id){return db.get(id);}
export const unpack=r=>JSON.parse(r.payload);
export async function addRow(id,kind,payload){if(db.has(id))throw Error('duplicate');const row={_id:id,kind,writingId:payload.writingId||payload.id||'',revision:payload.revision||0,modified:payload.updatedAt||new Date().toISOString(),payload:JSON.stringify(payload)};db.set(id,row);return row;}
export async function rows(kind,writingId='',offset=0,limit=30){const all=[...db.values()].filter(r=>r.kind===kind&&(!writingId||r.writingId===writingId)).sort((a,b)=>kind==='practiceVersion'?b.revision-a.revision:b.modified.localeCompare(a.modified));return {rows:all.slice(offset,offset+limit),total:all.length};}
export async function removeRow(id){db.delete(id);}
`;
await build({stdin:{contents:"export {GET,POST} from './src/pages/api/translation';export {db} from './src/server/translation-store';export {calls} from './src/server/annotation-provider';export {reviewSections,reviewScore,translationQuestions,replaceReviewSection} from './src/lib/translation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'isolated-translation',setup(b){
 b.onResolve({filter:/translation-store$/},()=>({path:'store',namespace:'test'}));b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'test'}));b.onResolve({filter:/annotation-config$/},()=>({path:'config',namespace:'test'}));b.onResolve({filter:/annotation-provider$/},()=>({path:'model',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='store'?syntheticStore:path==='session'?`export const authorized=async r=>r.headers.get('x-test-auth')!=='no';export const sameOrigin=r=>r.headers.get('origin')!=='https://evil.invalid';`:path==='config'?`export class AlignmentError extends Error{constructor(m,status=400){super(m);this.status=status;}}export const getAnnotationConfig=async()=>({enabled:true,apiKey:'synthetic-secret',model:'synthetic-model'});`:`export const calls=[];export async function requestModelJSON(config,prompt,body){calls.push(body);return {reply:'这是测试解答，不更改正式批阅。',replacement:body.mode==='appeal'?body.target+'\\n\\n补充：这一表达可接受，不扣分。':''};}`}));
}}]});
const m=await import(join(dir,'api.mjs'));
after(()=>rm(dir,{recursive:true,force:true}));beforeEach(()=>{m.db.clear();m.calls.length=0;});
const id='tr-2026',imageId='tri-00000000-0000-4000-8000-000000000001',requestId='trm-00000000-0000-4000-8000-000000000001';
const input={id,questionId:'translation-2026',baseRevision:0,answers:['译文46','译文47','译文48','译文49','译文50'],referenceText:'用户指定的参考答案',referenceIds:[]};
const md='## 1. 总分与整体评价\n\n总分：7.5/10\n理解基本准确。\n\n## 2. 逐句批阅\n\n### 第46题\n得分：1.5/2。\n\n## 3. 与参考答案的差异判定\n\n不同但正确，不扣分。\n\n## 4. 语法理解与纠正\n\n先讲知识点，再给例句。\n\n## 5. 词汇与中文表达建议\n\n保留正确表达。\n\n## 6. 完善后的完整译文\n\n46. 完整译文。';
async function call(action,data={},headers={}){const r=await m.POST({request:new Request('https://test.invalid/api/translation',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action,...data})})});return {status:r.status,...await r.json()};}
async function submitted(){return (await call('submit',input)).practice;}
async function reviewed(){const p=await submitted();return (await call('importReview',{id,baseRevision:p.revision,markdown:md,filename:'test.md',confirmed:true})).practice;}
test('corpus has only seven English I papers, exact 46–50 ranges, full context, and no reference answers',()=>{assert.deepEqual(m.translationQuestions.map(q=>q.year),[2020,2021,2022,2023,2024,2025,2026]);for(const q of m.translationQuestions){assert.equal(q.exam,'one');assert.deepEqual(q.sentences.map(s=>s.number),[46,47,48,49,50]);assert(q.paragraphs.length>0);for(const s of q.sentences)assert(q.paragraphs.some(p=>p.includes(s.text)));assert(!('referenceText' in q));}const fifty=m.translationQuestions[0].sentences[4].text;assert(!fifty.includes('Immanuel Kant'));});
test('parses six review sections without absorbing sentence subheadings or fabricating scores',()=>{const parts=m.reviewSections(md);assert(parts.every(s=>s.body));assert(parts[1].body.includes('第46题'));assert.equal(m.reviewScore(md),7.5);assert.equal(m.reviewScore('## 1. 总分与整体评价\n总分：7—8分'),null);assert.equal(m.reviewScore('## 1. 总分与整体评价\n总分：12/10'),null);assert.equal(m.reviewScore('## 1. 总分与整体评价\n总分：7.3/10'),null);const changed=m.replaceReviewSection(md,2,'仅调整差异部分。');assert(changed.includes('先讲知识点'));assert(changed.includes('仅调整差异部分'));});
async function upload(owner=id,bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64'),img=imageId,type='image/png'){
 const parts=Math.max(1,Math.ceil(bytes.length/240000));
 for(let index=0;index<parts;index++){const r=await call('uploadReferenceChunk',{id:owner,imageId:img,index,data:bytes.subarray(index*240000,(index+1)*240000).toString('base64')});assert.equal(r.status,200);}
 return call('uploadReference',{id:owner,imageId:img,name:'original.png',type,parts,size:bytes.length});
}
test('one record per year: rewriting replaces review and removes historical bodies',async()=>{
 assert.equal((await call('submit',{...input,referenceText:''})).status,400);
 const first=await call('save',input);assert.equal(first.status,200);
 assert.equal((await call('save',{...input,referenceText:'different stale content'})).status,409);
 let p=(await call('submit',{...input,baseRevision:1})).practice;
 p=(await call('importReview',{id,baseRevision:p.revision,markdown:md,filename:'first.md',confirmed:true})).practice;
 const next=await call('save',{...input,baseRevision:p.revision,answers:['覆盖后的译文','47','48','49','50']});
 assert.equal(next.status,200);assert.equal(next.practice.review,undefined);assert.equal(next.practice.id,id);
 assert.equal([...m.db.values()].filter(r=>r.kind==='practiceVersion').length,1);
 assert.equal([...m.db.values()].filter(r=>r.kind==='practice').length,1);
 assert.equal((await call('save',{...input,id:'tr-00000000-0000-4000-8000-000000000001'})).status,409);
 assert.equal((await m.GET({request:new Request('https://test.invalid/api/translation')})).status,400);
});
test('different concurrent saves cannot overwrite the current record',async()=>{
 const saved=await call('save',input),next={...input,baseRevision:saved.practice.revision};
 const values=await Promise.all([call('save',{...next,referenceText:'first'}),call('save',{...next,referenceText:'second'})]);
 assert.equal(values.filter(value=>value.status===200).length,1);assert.equal(values.filter(value=>value.status===409).length,1);
 assert.equal([...m.db.values()].filter(r=>r.kind==='practiceVersion').length,1);
});
test('large original upload is byte-identical without image content, type or dimension inspection',async()=>{
 const bytes=Buffer.alloc(790123);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const up=await upload(id,bytes,imageId,'application/octet-stream');assert.equal(up.status,200);assert.equal(up.image.size,bytes.length);
 const response=await m.GET({request:new Request('https://test.invalid/api/translation?image='+imageId)});
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 assert.equal((await call('submit',{...input,referenceText:'',referenceIds:[imageId]})).status,200);
 assert.equal((await call('submit',{...input,id:'tr-2025',questionId:'translation-2025',referenceIds:[imageId]})).status,400);
 assert.equal((await m.GET({request:new Request('https://test.invalid/api/translation?image='+imageId,{headers:{'x-test-auth':'no'}})})).status,401);
});
test('newest submission retains originals while older yearly records retain only compact image data',async()=>{
 const original=Buffer.alloc(600001,77);await upload(id,original);
 const first=(await call('submit',{...input,referenceIds:[imageId]})).practice;
 assert.equal((await call('archiveReference',{id,imageId,data:'data:image/jpeg;base64,YWJj',type:'image/jpeg'})).status,409);
 await new Promise(resolve=>setTimeout(resolve,2));
 const secondId='tri-00000000-0000-4000-8000-000000000002',second=Buffer.from('new unmodified original');
 await upload('tr-2025',second,secondId);
 assert.equal((await call('submit',{...input,id:'tr-2025',questionId:'translation-2025',referenceIds:[secondId]})).status,200);
 const pending=await m.GET({request:new Request('https://test.invalid/api/translation?retired=tr-2025')});
 assert.equal((await pending.json()).images[0].id,imageId);
 assert.equal((await call('archiveReference',{id,imageId,data:'data:image/jpeg;base64,YWJj',type:'image/jpeg'})).status,200);
 assert(!m.db.has(imageId));assert(![...m.db.values()].some(r=>r.kind==='imageChunk'&&JSON.parse(r.payload).imageId===imageId));
 const archived=await m.GET({request:new Request('https://test.invalid/api/translation?image='+imageId)});assert.equal(await archived.text(),'abc');
 const current=await m.GET({request:new Request('https://test.invalid/api/translation?image='+secondId)});assert.deepEqual(Buffer.from(await current.arrayBuffer()),second);
 const old=await m.GET({request:new Request('https://test.invalid/api/translation?id='+id)});assert.deepEqual((await old.json()).practice.answers,first.answers);
 assert.equal((await call('save',{...input,baseRevision:first.revision,referenceIds:[imageId]})).status,200);
});
test('legacy year opens without losing current review and discards superseded bodies',async()=>{
 const legacy='tr-11111111-1111-4111-8111-111111111111';
 m.db.set(legacy,{_id:legacy,kind:'practice',writingId:legacy,modified:'2026-01-01',payload:JSON.stringify({id:legacy,questionId:'translation-2020'})});
 for(const revision of [1,2]){
  const p={...input,id:legacy,questionId:'translation-2020',revision,status:revision===2?'reviewed':'submitted',createdAt:'2026-01-01',updatedAt:'2026-01-0'+revision,answers:input.answers,references:[],review:revision===2?{original:md,markdown:md,filename:'existing.md',importedAt:'2026-01-02'}:undefined};
  m.db.set(legacy+'-v'+revision,{_id:legacy+'-v'+revision,kind:'practiceVersion',writingId:legacy,revision,payload:JSON.stringify(p)});
 }
 const opened=await call('open',{questionId:'translation-2020'});assert.equal(opened.status,200);
 assert.equal(opened.practice.review.markdown,md);assert.equal(opened.practice.id,legacy);
 assert.equal([...m.db.values()].filter(r=>r.kind==='practiceVersion').length,1);
 assert.equal((await call('save',{...input,id:'tr-2020',questionId:'translation-2020'})).status,409);
});
test('manual previews, replay protection, adoption and undo need only the current practice body',async()=>{
 let p=await reviewed();assert.equal(m.calls.length,0);
 const query={id,requestId,section:2,mode:'appeal',message:'这一表达等值，为什么扣分？',includeContext:true};
 const result=await call('ask',query);assert.equal(result.status,200);assert.equal((await call('ask',query)).status,200);assert.equal(m.calls.length,1);
 assert.equal((await call('ask',{...query,message:'另一个问题'})).status,409);
 const accepted=await call('acceptAppeal',{id,requestId});assert.equal(accepted.status,200);p=accepted.practice;
 assert(p.review.markdown.includes('补充'));assert.equal(p.review.original,md);
 assert.equal([...m.db.values()].filter(r=>r.kind==='practiceVersion').length,1);
 assert.equal((await call('acceptAppeal',{id,requestId})).status,409);
 const undone=await call('undoAppeal',{id,baseRevision:p.revision});assert.equal(undone.status,200);assert.equal(undone.practice.review.markdown,md);
 assert.equal((await call('undoAppeal',{id,baseRevision:undone.practice.revision})).status,400);
 assert(!JSON.stringify(result).includes('synthetic-secret'));
});
test('chat is read-only, rewrite clears old conversation, and auth and origin stay enforced',async()=>{
 const p=await reviewed(),chat=await call('ask',{id,requestId,section:0,mode:'chat',message:'解释一下。',includeContext:false});
 assert.equal(chat.result.replacement,'');assert.equal(m.calls[0].passage,undefined);
 assert.equal((await call('acceptAppeal',{id,requestId})).status,400);
 assert.equal((await call('save',input,{'x-test-auth':'no'})).status,401);
 assert.equal((await call('save',input,{origin:'https://evil.invalid'})).status,403);
 const saved=await call('save',{...input,baseRevision:p.revision,answers:['新的译文','47','48','49','50']});
 assert.equal(saved.status,200);assert.equal([...m.db.values()].filter(r=>r.kind==='conversation').length,0);
});
