import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'strong-advice-'));
const library={revision:1,updatedAt:null,tolerance:'loose',sourceText:'',sentences:[{id:'heart',category:'大作文/论证',title:'核心',template:'At its heart lies {{C}}',notes:'核心因素',substitutions:'',enabled:true}],words:[{id:'word',term:'effort',forms:[],meaning:'努力',enabled:true}]};
const kinds=['cooperation','patience','persistence','courage','kindness','integrity','confidence','determination','responsibility','respect','support','learning','practice','understanding'];
const row=(term,i)=>({entryKey:'sentence:heart',paragraph:Math.floor(i/5)+1,stage:'论证',cue:'当你想指出某件事背后的核心因素时。',why:'可用于本题论证',example:`At its heart lies our shared determination to improve society through ${term}.`,translation:'核心在于共同努力。',adaptation:'将空位替换为对应主题。',avoid:'its须有明确指代。'});
const good={angle:'按题目展开论证',title:'',salutation:'',signoff:'',items:kinds.map(row)};
// 14 cards and the same library sentence reused, without any word requirement.
const archive=`export const db=new Map();export const decode=r=>JSON.parse(r.payload);export const find=async id=>db.get(id)||null;export async function put(id,kind,p,old){if(!old&&db.has(id))throw Error('duplicate');const row={_id:id,kind,questionId:p.questionId||'',payload:JSON.stringify(p)};db.set(id,row);return row}export async function list(kind,{questionId='',offset=0,limit=100}={}){return {rows:[...db.values()].filter(r=>r.kind===kind&&(!questionId||r.questionId===questionId)).slice(offset,offset+limit)}}`;
const provider=`export const calls=[];let responses=[];export const setResponses=value=>responses=[...value];export async function requestAdviceJSON(config,prompt,input,onProgress=()=>{}){calls.push({prompt,input});onProgress({receivedItems:14,receivedCharacters:3000});if(!responses.length)throw Error('unexpected paid call');return responses.shift()}`;
try {
 await build({stdin:{contents:"export * from './src/lib/strong-advice';export {adviceEntries} from './src/lib/expression-advice';export {collectAdviceWritingUsage} from './src/lib/expression-advice-usage';export {POST} from './src/pages/api/expression-advice';export {db,put} from './src/server/archive';export {calls,setResponses} from './src/server/expression-advice-provider';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'m.mjs'),plugins:[{name:'private-adapters',setup(b){b.onResolve({filter:/(?:server\/|^\.\/)(archive|session|annotation-config|expression-advice-provider)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'js',contents:path==='archive'?archive:path==='expression-advice-provider'?provider:path==='session'?"export const authorized=async r=>r.headers.has('x-auth'),sameOrigin=()=>true;":"export class AlignmentError extends Error{constructor(m,status=400){super(m);this.status=status}}export const getAnnotationConfig=async()=>({enabled:true,apiKey:'fake',model:'test'});"}));}}]});
 const m=await import(join(dir,'m.mjs')),entries=m.adviceEntries(library);
 assert(m.strongSentenceMatch('At its heart lies {{C}}','At its heart lies persistence.'));
 for(const text of ['At its heart lie persistence.','At its heart exists persistence.','At its heart lies.','At its heart lies persistence. Another sentence is unrelated.','Indeed, at its heart lies persistence.'])assert(!m.strongSentenceMatch(library.sentences[0].template,text),text);
 assert(m.strongSentenceMatch('We value {{A}}. At its heart lies {{B}}.','We value learning. At its heart lies curiosity.'));
 assert(!m.strongSentenceMatch('We value {{A}}. At its heart lies {{B}}.','We value learning. This is unrelated.'));
 let c=m.checkStrongAdvice(good,entries,{type:'large'});assert.deepEqual(c.issues,[]);assert.equal(c.result.coverage.sentences,14);assert.equal(c.result.items.length,14);
 assert(c.result.coverage.words>=160&&c.result.coverage.words<=200);
 const filled={...structuredClone(good),items:good.items.map(r=>{const {example,...rest}=r;return {...rest,fills:[example.slice('At its heart lies '.length,-1)]};})};
 const composed=m.checkStrongAdvice(filled,entries,{type:'large'});assert.deepEqual(composed.issues,[]);assert.equal(composed.result.essay,c.result.essay);
 const ellipsisEntry={...entries[0],expression:'...naturally translates into...'};
 const ellipsisRow={...good.items[0],fills:['Honest communication','greater mutual trust']};
 const ellipsis=m.checkStrongAdvice({angle:'测试省略号',items:[ellipsisRow]},[ellipsisEntry],{type:'large'});
 assert(!ellipsis.issues.some(i=>i.index===0),'adjacent ellipsis slots must preserve word boundaries');
 assert.equal(ellipsis.result.items[0].example,'Honest communication naturally translates into greater mutual trust.');
 const invented={...structuredClone(filled),essay:'Invented extra sentence.'};invented.items[0].example='A model-invented sentence outside the library.';
 assert.equal(m.checkStrongAdvice(invented,entries,{type:'large'}).result.essay,c.result.essay,'model-generated fixed English is ignored when composing filled templates');
 const extra=structuredClone(filled);extra.items[0].fills=['persistence. An unrelated sentence.'];assert(m.checkStrongAdvice(extra,entries,{type:'large'}).issues.length);
 const missingFill=structuredClone(filled);missingFill.items[0].fills=[];assert(m.checkStrongAdvice(missingFill,entries,{type:'large'}).issues.length);

 const usage=m.collectAdviceWritingUsage(c.result,{id:'w',text:'At its heart lies persistence.',createdAt:'2026-11-27',updatedAt:'2026-11-27',status:'submitted'},library,'latest');assert.equal(usage.usedCount,1,'reused patterns count once in original-manuscript statistics');
 for(const mutate of [x=>x.items[2].entryKey='sentence:invented',x=>x.items[2].entryKey='word:word',x=>x.items[2].example+=' A fake sentence.',x=>x.items[2].example=x.items[2].example.replace('lies','exists'),x=>x.items[2].example='At its heart lies {{C}}.',x=>x.items[2].paragraph=9]){const invalid=structuredClone(good);mutate(invalid);assert(m.checkStrongAdvice(invalid,entries,{type:'large'}).issues.length);}
 assert(m.checkStrongAdvice({...good,items:good.items.slice(0,2)},entries,{type:'large'}).issues.some(i=>i.index===undefined));
 assert(m.checkStrongAdvice({...good,salutation:'Dear Friends,'},entries,{type:'large'}).issues.length);
 const small={...good,salutation:'Dear Friends,',signoff:'Yours sincerely,\nLi Ming',items:good.items.slice(0,8)};assert.deepEqual(m.checkStrongAdvice(small,entries,{type:'small'}).issues,[]);
 const bad=structuredClone(good);bad.items[2].example=bad.items[2].example.replace('lies','exists');
 const issues=m.checkStrongAdvice(bad,entries,{type:'large'}).issues;
 const repaired=m.mergeStrongRepair(bad,{items:[{index:2,...good.items[2]}]},issues);assert.deepEqual(repaired,good);
 assert.throws(()=>m.mergeStrongRepair(bad,{items:[]},issues));assert.throws(()=>m.mergeStrongRepair(bad,{items:[{index:3,...good.items[2]}]},issues));
 const post=async body=>{const r=await m.POST({request:new Request('https://test.invalid/api/expression-advice',{method:'POST',headers:{'x-auth':'yes'},body:JSON.stringify(body)})});return {status:r.status,...await r.json()};};
 const q='supplement-english-one-large-uncertainty-trust';await m.put('expression-library','expressions',library);await m.put('w','writing',{id:'w',questionId:q,status:'submitted',text:'Private original manuscript must not reach generation.',createdAt:'2026-11-27',updatedAt:'2026-11-27'});
 assert.equal((await post({action:'read',questionId:q,mode:'other'})).status,400);
 await post({action:'prepare',questionId:q,requestId:'prepare',mode:'strong'});assert.equal(m.calls.length,0);
 m.setResponses([bad,{items:[{index:2,...good.items[2]}]}]);let v=await post({action:'generate',questionId:q,requestId:'first',mode:'strong'});assert.equal(v.status,200);assert.equal(v.result.coverage.repairs,1);assert.equal(v.result.items.length,14);assert.equal(m.calls.length,2);
 assert(!JSON.stringify(m.calls).includes('Private original manuscript'));
 assert.equal((await post({action:'read',questionId:q})).result,null,'strong results must not appear in normal mode');
 const id=v.result.id;await post({action:'generate',questionId:q,requestId:'cached',mode:'strong'});assert.equal(m.calls.length,2);
 const before=JSON.stringify([...m.db]);await post({action:'read',questionId:q,mode:'strong'});assert.equal(JSON.stringify([...m.db]),before,'mode switches and reads never write or generate');
 m.setResponses([bad,{items:[{index:2,...bad.items[2]}]}]);v=await post({action:'generate',questionId:q,requestId:'failed',mode:'strong',regenerate:true});assert.equal(v.status,422);assert.equal(m.calls.length,4,'at most one repair');
 v=await post({action:'read',questionId:q,mode:'strong'});assert.equal(v.result.id,id);assert.equal(v.task.status,'failed','failed repair preserves successful cards and exposes failure');
 m.setResponses([filled]);v=await post({action:'generate',questionId:q,requestId:'filled',mode:'strong',regenerate:true});assert.equal(v.status,200);assert.equal(v.result.essay,c.result.essay);assert.equal(v.result.coverage.repairs,0);
 console.log('Strong advice: strict skeletons, multi-sentence templates, 14 cards, repeated patterns, word limits, mode isolation, one targeted repair, cached reads and failure preservation passed');
}finally{await rm(dir,{recursive:true,force:true});}
