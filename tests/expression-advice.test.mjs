import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'folio-advice-'));
const archive=`export const db=new Map();export const decode=r=>JSON.parse(r.payload);export async function find(id){return db.get(id)||null}export async function put(id,kind,p,old){if(!old&&db.has(id))throw Error('duplicate');const row={_id:id,kind,questionId:p.questionId||'',status:p.status||'',payload:JSON.stringify(p)};db.set(id,row);return row}export async function list(kind,{questionId='',offset=0,limit=100}={}){const rows=[...db.values()].filter(r=>r.kind===kind&&(!questionId||r.questionId===questionId));return {rows:rows.slice(offset,offset+limit)}}`;
const provider=`export const calls=[];export let fail=false;export const setFail=v=>fail=v;export async function requestModelJSON(c,p,input,onProgress=()=>{}){calls.push({prompt:p,input});onProgress({receivedCharacters:0,receivedItems:0});if(fail)throw Error('provider unavailable');await new Promise(r=>setTimeout(r,5));if(input.sources){const source=input.sources[0];return {complete:true,facts:[{text:'画中两人登山，一人劝同伴继续。',evidence:[{sourceId:source.id,quote:source.text.slice(0,20)}]}],uncertainties:['细小图中文字待核对，未纳入事实']};}return {angle:'从题面的坚持与相互帮助展开，先描述动作，再解释坚持的价值。',items:input.candidateEntries.slice(0,10).map(e=>({entryKey:e.entryKey,stage:'论证段',cue:'表达在困难中坚持的品质',why:'本题涉及困难中的选择',example:e.kind==='sentence'?'At its heart lies perseverance.':'We should value '+e.expression+'.',translation:'我们应重视这些品质。',adaptation:'将品质替换为新题所需的具体内容。',avoid:'只有讨论对应品质时才使用。'})),shortfall:''};}export const requestAdviceJSON=requestModelJSON;`;
try {
 await build({stdin:{contents:"export * from './src/pages/api/expression-advice';export * from './src/lib/expression-advice';export * from './src/server/expression-advice';export {db,put} from './src/server/archive';export {calls,setFail} from './src/server/expression-advice-provider';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs'),plugins:[{name:'mock-private-services',setup(b){b.onResolve({filter:/(?:server\/|^\.\/)(archive|session|annotation-config|annotation-provider|expression-advice-provider)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'js',contents:path==='archive'?archive:(path==='annotation-provider'||path==='expression-advice-provider')?provider:path==='annotation-config'?"export class AlignmentError extends Error{constructor(m,status=400){super(m);this.status=status}}export const getAnnotationConfig=async()=>({enabled:true,apiKey:'mock',model:'mock-model'});":"export const authorized=async r=>r.headers.has('x-auth'),sameOrigin=r=>!r.headers.has('x-foreign');"}));}}]});
 const m=await import(join(dir,'test.mjs'));
 const post=async(body,headers={'x-auth':'yes'})=>{const r=await m.POST({request:new Request('https://test.invalid/api/expression-advice',{method:'POST',headers,body:JSON.stringify(body)})});return {status:r.status,...await r.json()};};
 const lib={revision:1,updatedAt:'now',tolerance:'balanced',sourceText:'',sentences:[{id:'heart',category:'大作文/原因',title:'核心',template:'At its heart lies {{C}}',notes:'指出核心因素',substitutions:'',enabled:true}],words:Array.from({length:9},(_,i)=>({id:'term'+i,term:['perseverance','resilience','cooperation','courage','support','patience','confidence','determination','effort'][i],meaning:'品质',forms:[],enabled:true}))};
 const writing={id:'w1',questionId:'2019-large',status:'submitted',revision:1,text:'Two people rest on a mountain path. One encourages the other. Private essay extension: courage leads to success.',createdAt:'2026-11-24T01:00:00Z',updatedAt:'2026-11-24T01:00:00Z'};
 await m.put('expression-library','expressions',lib);await m.put('w1','writing',writing);
 assert.equal((await post({action:'index'},{})).status,401);assert.equal((await post({action:'index'},{'x-auth':'1','x-foreign':'1'})).status,403);
 for(const body of [null,[],{}, {action:'prepare',questionId:'bad/url',requestId:'r'}, {action:'generate',questionId:'2019-large',requestId:'bad/url'}])assert.equal((await post(body)).status,400);
 assert.equal((await post({action:'read',questionId:'2024-large'})).status,403);
 assert.deepEqual((await post({action:'index'})).questionIds,['2019-large']);
 let view=await post({action:'read',questionId:'2019-large'});assert.equal(view.context,null);assert.equal(view.result,null);assert.equal(m.calls.length,0);assert.equal(m.db.size,2,'reading must not prepare any context');
 const faq={"@type":"FAQPage",mainEntity:[{name:'漫画画的是什么、说明了什么？',acceptedAnswer:{text:'本题漫画内容为：画面中两位登山者在山间小路上休息，一人递水并劝同伴休息后继续攀爬，另一人坐着表示不想继续。 就本题而言，山象征人生目标。'}}]};
 const html='<script type="application/ld+json">'+JSON.stringify(faq)+'</script>';
 assert(!m.publicDescription(html).includes('象征'));assert.equal(m.publicDescription('<img alt="a short description">'),null);
 let fetches=0;const realFetch=globalThis.fetch;globalThis.fetch=async()=>{fetches++;return new Response(html);};
 const req={questionId:'2019-large',requestId:'request-1'};
 view=await post({action:'prepare',...req});assert.equal(view.status,200);assert.equal(view.context.origin,'public-page');assert.equal(m.calls.length,0);assert.equal(fetches,1);
 await post({action:'read',questionId:'2019-large'});await post({action:'prepare',...req});assert.equal(fetches,1);
 const [generated,duplicate]=await Promise.all([post({action:'generate',...req}),post({action:'generate',...req})]);assert.equal(m.calls.length,1,'same input must claim a unique generation before paid call');
 view=await post({action:'read',questionId:'2019-large'});assert.equal(view.result.items.length,10);assert.equal(view.result.items.filter(x=>x.entry.kind==='sentence').length,1,'no separate sentence quota');
 assert.equal(JSON.stringify(m.calls[0].input).includes('Private essay extension'),false);assert.equal(m.calls[0].input.objectiveContext.includes('象征'),false);assert(!JSON.stringify(view).includes('mock-api-key'));
 await post({action:'generate',...req});assert.equal(m.calls.length,1,'saved result must be reused');
 m.setFail(true);const failed=await post({action:'generate',questionId:'2019-large',requestId:'request-2',regenerate:true});assert.equal(failed.status,502);view=await post({action:'read',questionId:'2019-large'});assert.equal(view.result.items.length,10,'failed refresh preserves last ready result');m.setFail(false);
 const oldReady=view.result.id;await post({action:'generate',questionId:'2019-large',requestId:'request-3',regenerate:true});view=await post({action:'read',questionId:'2019-large'});assert.notEqual(view.result.id,oldReady);
 const libraryRow=m.db.get('expression-library');await m.put('expression-library','expressions',{...lib,words:lib.words.map((w,i)=>i? w:{...w,enabled:false})},libraryRow);view=await post({action:'read',questionId:'2019-large'});assert.equal(view.stale,true);
 const sources=[{id:'w',text:'Two hikers rest on a mountain path.'}];assert.throws(()=>m.validateExtractedContext({complete:true,facts:[{text:'A fact',evidence:[{sourceId:'w',quote:'invented'}]}]},sources));assert.throws(()=>m.validateExtractedContext({complete:false,facts:[]},sources));
 const item={entryKey:'word:term0',stage:'论证',cue:'坚持的品质',why:'匹配主题',example:'We should value perseverance.',translation:'我们应重视坚持。',adaptation:'换题时确认语义。',avoid:'不可用于无关语境。'};
 const entries=m.adviceEntries(lib);const parsed=m.validateAdvice({angle:'思路',items:[item,item,{...item,entryKey:'not-in-library'}]},entries);assert.equal(parsed.items.length,1);assert(parsed.shortfall.includes('已过滤'));
 for(const example of ['We should value ___ .','Something unrelated.','We should value perseverance 中文.'])assert.throws(()=>m.validateAdvice({angle:'思路',items:[{...item,example}]},entries));
 // A source with no full public description uses a separate extraction request.
 await m.put('w2','writing',{...writing,id:'w2',questionId:'2009-large'});
 view=await post({action:'prepare',questionId:'2009-large',requestId:'fallback-1'});assert.equal(view.context.origin,'records');assert.equal(m.calls.at(-1).input.sources.length,1);assert.equal(view.context.evidence,undefined);
 assert(!JSON.stringify(view).includes('Private essay extension'));
 const fallbackRow=m.db.get('w2');await m.put('w2','writing',{...writing,id:'w2',questionId:'2009-large',text:writing.text+' Updated description.'},fallbackRow);
 assert.equal((await post({action:'read',questionId:'2009-large'})).contextStale,true,'changed extraction evidence must invalidate its context');
 assert.equal((await post({action:'generate',questionId:'2009-large',requestId:'stale-source'})).status,409);
 // Text-only material questions need no source fetch or extraction provider call.
 const material='supplement-english-one-large-uncertainty-trust';await m.put('w3','writing',{...writing,id:'w3',questionId:material});const before=m.calls.length;
 view=await post({action:'prepare',questionId:material,requestId:'text-only'});assert.equal(view.context.origin,'directions');assert.equal(m.calls.length,before);
 // Removal closes access even when a card is saved.
 m.db.delete('w1');assert.equal((await post({action:'read',questionId:'2019-large'})).status,403);
 globalThis.fetch=realFetch;
 console.log('Expression advice: authorization, lazy context, public parsing, separate extraction, 10 mixed entries, recall validation, caching, concurrency and failed refresh passed');
}finally{await rm(dir,{recursive:true,force:true});}
