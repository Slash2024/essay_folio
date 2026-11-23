import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-expression-performance-'));
try{
  await build({entryPoints:['src/lib/expression-performance.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
  const {collectExpressionPerformance:collect,recitationDetails:details}=await import(join(dir,'expression-performance.js'));
  const word=(id,term)=>({id,term,meaning:'释义',forms:[],enabled:true});
  const library={revision:16,updatedAt:null,tolerance:'balanced',sourceText:'',sentences:[],words:[word('a','benefit'),word('b','develop'),word('c','improve')]};
  const source=(id,text)=>({key:'word:'+id,text,kind:'word',title:text,answers:[text],meaning:'释义',scenario:'场景',signature:'s'});
  const question=(sources)=>({prompt:'测试题目',kind:'word',slots:0,sources});
  const session={id:'round',version:1,createdAt:'2026-11-22T00:00:00Z',mode:'meaning',scope:'all',requestKey:'r',librarySignature:'s',retryOf:null,questions:Array.from({length:5},()=>question([source('a','benefit')]))};
  const answer=(index,verdict='correct',extra={})=>({writingId:'round',index,answer:'benefit',skipped:false,verdict,matchedKey:verdict==='correct'?'word:a':null,reason:'判定',createdAt:`2026-11-22T00:0${index}:00Z`,...extra});
  const answers=[answer(0),answer(1,'incorrect'),answer(2,'incorrect',{skipped:true,answer:''}),answer(3),answer(4,'incorrect')];
  const records={sessions:[session],answers,reviews:[{writingId:'round',index:3,createdAt:'2026-11-22T01:00:00Z'}],corrections:[{writingId:'round',index:4,verdict:'correct',reason:'复核认可',createdAt:'2026-11-22T01:00:00Z'}],practices:[{...answer(1),id:'practice'}]};
  const snapshot=JSON.stringify({library,records});
  const result=collect(library,records),count=result.performance.entries['word:a'];
  assert.deepEqual(count,{attempts:5,correct:2,incorrect:2,pending:1,practices:1,shared:0,accuracy:50});
  assert.equal(result.performance.entries['word:b'].accuracy,null);assert.equal(result.performance.overview.practiced,1);
  assert.equal(result.performance.overview.accuracy,50);assert.equal(result.performance.overview.pending,1);
  assert.equal(details(result,'word:a',0,2).items.length,2);assert(details(result,'word:a',0,2).hasNext);
  assert.equal(details(result,'word:a',4,2).hasNext,false);assert.equal(details(result,'word:a',4,2).items.length,1);
  assert.equal(result.occurrences['word:a'][0].corrected,true);
  assert.equal(result.occurrences['word:a'].find(r=>r.index===3).verdict,'pending');
  assert.equal(result.occurrences['word:a'].find(r=>r.index===1).practice.verdict,'correct');
  assert.equal(JSON.stringify({library,records}),snapshot);
  // A started round with no submitted answers has no accuracy. Duplicate retries
  // and historical score reports cannot become additional attempts.
  assert.equal(collect(library,{...records,answers:[]}).performance.overview.accuracy,null);
  assert.equal(collect(library,{...records,answers:[...answers,answers[0]]}).performance.entries['word:a'].attempts,5);
  assert.equal(collect({...library,words:[word('a','new text')]},records).performance.entries['word:a'].attempts,0);
  assert.equal(collect({...library,words:[]},records).performance.overview.attempts,0);
  assert.equal(collect({...library,words:[{...library.words[0],enabled:false}]},records).performance.entries['word:a'].attempts,5);
  // An alternative accepted answer credits only its actual expression. Ambiguous
  // failures and corrected variants remain visible without false per-entry scores.
  const grouped={...session,questions:[question([source('a','benefit'),source('b','develop')])]};
  const base={...records,sessions:[grouped],reviews:[],corrections:[],practices:[]};
  let groupedResult=collect(library,{...base,answers:[answer(0)]});
  assert.equal(groupedResult.performance.entries['word:a'].attempts,1);assert.equal(groupedResult.performance.entries['word:b'].attempts,0);
  groupedResult=collect(library,{...base,answers:[answer(0,'incorrect')]});
  assert.equal(groupedResult.performance.overview.shared,1);assert.equal(groupedResult.performance.entries['word:a'].attempts,0);
  assert.equal(groupedResult.performance.entries['word:b'].shared,1);assert.equal(groupedResult.occurrences['word:a'][0].verdict,'shared');
  groupedResult=collect(library,{...base,answers:[answer(0,'incorrect')],corrections:[{writingId:'round',index:0,verdict:'correct',reason:'认可变体',createdAt:'2026-11-22T01:00:00Z'}]});
  assert.equal(groupedResult.performance.entries['word:a'].accuracy,null);
  const otherPractice=collect(library,{...base,answers:[answer(0)],practices:[{...answer(0),id:'p-other',matchedKey:'word:b',answer:'develop'}]});
  assert.equal(otherPractice.performance.entries['word:a'].practices,0);
  assert.equal(otherPractice.performance.entries['word:b'].practices,1);
  assert.equal(otherPractice.performance.entries['word:b'].attempts,0);
  assert.equal(otherPractice.occurrences['word:b'][0].practiceOnly,true);
  // A new round, including retryOf, is another first attempt.
  const retry={...session,id:'retry',retryOf:'round'};
  assert.equal(collect(library,{...base,sessions:[session,retry],answers:[answer(0),{...answer(0),writingId:'retry'}]}).performance.entries['word:a'].attempts,2);
  // The actual reporting API uses only read adapters; any attempted write fails.
  const archive=`export const db=new Map();export const reads=[];export const decode=r=>JSON.parse(r.payload);export async function find(id){return db.get(id)||null}export async function all(kind){reads.push(kind);return [...db.values()].filter(r=>r.kind===kind)}export const put=()=>{throw Error('report must not write')};`;
  await build({stdin:{contents:"export {GET} from './src/pages/api/expression-performance';export {db,reads} from './src/server/archive';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'readonly-archive',setup(b){
    b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'qa'}));b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'qa'}));
    b.onLoad({filter:/.*/,namespace:'qa'},({path})=>({loader:'js',contents:path==='archive'?archive:'export const authorized=async()=>globalThis.qaAuthorized!==false;'}));
  }}]});
  const {GET,db,reads}=await import(join(dir,'api.mjs'));
  const set=(id,kind,p)=>db.set(id,{kind,payload:JSON.stringify(p)});
  set('expression-library','expressions',library);set('round','labQuizSession',session);
  for(const a of answers)set('answer-'+a.index,'labQuizAnswer',a);
  for(const r of records.reviews)set('review-'+r.index,'labQuizReview',r);
  for(const c of records.corrections)set('correction-'+c.index,'labQuizCorrection',c);
  for(const p of records.practices)set('practice-'+p.index,'labQuizPractice',p);
  set('report','labQuizReport',{score:{accuracy:999}});
  const before=JSON.stringify([...db]);
  const call=async query=>{const r=await GET({request:new Request('https://test.invalid/api/expression-performance?'+query)});return {status:r.status,...await r.json()};};
  const response=await call('revision=16');assert.equal(response.status,200);assert.equal(response.performance.entries['word:a'].accuracy,50);
  assert.equal((await call('revision=16&entry=word:a')).details.total,5);
  assert.equal((await call('revision=15')).status,409);assert.equal((await call('revision=16&entry=word:missing')).status,404);
  assert.equal((await call('revision=16&offset=-1')).status,400);assert.equal((await call('')).status,400);
  globalThis.qaAuthorized=false;assert.equal((await call('revision=16')).status,401);delete globalThis.qaAuthorized;
  assert.equal(JSON.stringify([...db]),before);assert(!reads.includes('labQuizReport'));
  console.log('PASS expression performance: first attempts, skipped and pending answers, review corrections, retries, shared sources, content changes, pagination and read-only authenticated API.');
}finally{await rm(dir,{recursive:true,force:true});}
