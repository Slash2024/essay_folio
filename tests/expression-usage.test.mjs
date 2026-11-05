import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=await mkdtemp(join(tmpdir(),'folio-expression-usage-'));
try{
  await build({entryPoints:['src/lib/expression-usage.ts','src/lib/expression-matcher.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
  const {collectExpressionUsage:usage,expressionUsageDetails:details}=await import(join(dir,'expression-usage.js'));
  const {matchExpressions}=await import(join(dir,'expression-matcher.js'));
  const sentence={id:'sentence',category:'test',title:'Benefit',template:'We benefit from {{object}}.',notes:'',substitutions:'',enabled:true};
  const word={id:'word',term:'benefit',meaning:'获益',forms:['benefits','beneficial'],enabled:true};
  const library={revision:3,updatedAt:null,tolerance:'strict',sentences:[sentence],words:[word,{...word,id:'unused',term:'ecology',forms:[]},{...word,id:'disabled',enabled:false}]};
  const writing=(id,text,status='submitted',extra={})=>({id,text,status,questionId:'2024-large',createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...extra});
  const a=writing('a','We benefit from reading. We benefit from exercise.');
  const b=writing('b','We benefit from discussion.','reviewed',{parentId:'a'});
  const rows=[a,b,writing('draft','We benefit from reading.','draft'),writing('empty','  ')];
  const counts=usage(rows,library);
  assert.equal(counts.writingCount,2);
  assert.deepEqual(counts.entries.sentence,{occurrences:3,writings:2,approximate:0});
  assert.deepEqual(counts.entries.word,{occurrences:3,writings:2,approximate:0});
  assert.equal(counts.entries.unused.occurrences,0);assert.equal(counts.entries.disabled,undefined);
  assert.deepEqual(usage(rows,library).entries,counts.entries); // Reopening never increments a counter.
  const page=details(rows,library,'sentence',0,2);
  assert.equal(page.total,3);assert.equal(page.writingCount,2);assert.equal(page.items.length,2);assert(page.hasNext);
  assert.equal(page.items[0].writingId,'a');assert.equal(page.items[0].spans.length,1);
  assert.equal(page.items[0].context.slice(page.items[0].spans[0].start,page.items[0].spans[0].end),'We benefit from');
  assert.equal(details(rows,library,'sentence',2,2).items.length,1);
  assert.equal(details(rows,library,'sentence',2,2).hasNext,false);
  // Latest body replaces the prior version; rewriting is a different writing ID.
  const edited=writing('a','There is no matching expression.','submitted',{revision:2,updatedAt:'2026-11-02T00:00:00Z'});
  assert.equal(usage([a,edited,b],library).entries.word.occurrences,1);
  assert.equal(usage([b],library).entries.word.occurrences,1);
  assert.equal(usage([],library).entries.word.occurrences,0);
  const changed={...library,revision:4,words:[{...word,term:'ecology',forms:[]}]};
  assert.equal(usage(rows,changed).entries.word.occurrences,0);
  // Word families remain recognized in strict mode; approximate hits follow the reader's threshold.
  assert.equal(usage([writing('family','Beneficial development brings benefits.')],library).entries.word.occurrences,2);
  const typo=[writing('typo','We benefot from reading.')];
  assert.equal(usage(typo,library).entries.word.occurrences,0);
  const balanced={...library,tolerance:'balanced'};
  assert.equal(usage(typo,balanced).entries.word.approximate,1);
  assert(details(typo,balanced,'word').items[0].approximate);
  // Overlapping variants of one entry are a single usage; different entries remain independent.
  const overlap={...library,sentences:[],words:[{...word,term:'major role',forms:['play a major role','major role']}]};
  assert.equal(usage([writing('overlap','We play a major role.')],overlap).entries.word.occurrences,1);
  assert.equal(matchExpressions('We play a major role.',overlap).length,1);
  // Reading/summary previously truncated repeated template/phrase hits at 16 and paths at 48.
  const many=writing('many','We benefit from reading. '.repeat(65));
  assert.equal(usage([many],library).entries.sentence.occurrences,65);
  const multi={...library,sentences:[{...sentence,template:'With {{effort}}, we can succeed.'}],words:[]};
  assert.equal(usage([writing('multi','With effort, we can succeed. '.repeat(60))],multi).entries.sentence.occurrences,60);
  const long=details([writing('long','x '.repeat(100)+'We benefit from reading. '+'y '.repeat(100))],library,'sentence').items[0];
  assert(long.leading&&long.trailing);assert(long.context.includes('We benefit from'));
  // A high overall similarity must not hide a local approximate change.
  const fuzzy={...library,tolerance:'balanced',sentences:[{...sentence,template:'Our communities can benefit from careful planning and sustained effort.'}],words:[]};
  assert.equal(usage([writing('fuzzy','Our communities can benefot from careful planning and sustained effort.')],fuzzy).entries.sentence.approximate,1);
  const best={...library,sentences:[],words:[{...word,term:'benefit',forms:['benefot']}]};
  assert.equal(usage([writing('best','benefit')],{...best,tolerance:'balanced'}).entries.word.approximate,0);
  // Exercise the real API handler with isolated storage/session adapters.
  const archive=`export const db=new Map();export const decode=r=>JSON.parse(r.payload);export async function find(id){return db.get(id)||null}export async function put(id,kind,p){const r={_id:id,kind,payload:JSON.stringify(p)};db.set(id,r);return r}export async function all(kind){return [...db.values()].filter(r=>r.kind===kind)}export const list=async()=>({rows:[]});export const deleteRow=async id=>db.delete(id);`;
  await build({stdin:{contents:"export {POST} from './src/pages/api/folio';export {db} from './src/server/archive';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'isolated-archive',setup(b){
    b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'qa'}));
    b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'qa'}));
    b.onLoad({filter:/.*/,namespace:'qa'},({path})=>({loader:'js',contents:path==='archive'?archive:"export const authorized=async()=>globalThis.qaAuthorized!==false,sameOrigin=()=>true,equal=(a,b)=>a===b,makeSession=async()=>'',accessConfig=async()=>({}),secret=async()=>{throw Error('External service must not be called')},SITE_ORIGIN='https://test.invalid';"}));
  }}]});
  const {POST,db}=await import(join(dir,'api.mjs'));
  const call=async(action,body={})=>{const r=await POST({request:new Request('https://test.invalid/api/folio',{method:'POST',body:JSON.stringify({action,...body})})});return {status:r.status,...await r.json()};};
  const set=(id,kind,p)=>db.set(id,{_id:id,kind,payload:JSON.stringify(p)});
  set('expression-library','expressions',library);set('a','writing',a);set('b','writing',b);
  set('draft','writing',writing('draft',a.text,'draft'));
  set('a-v1','revision',a);set('review','review',{writingId:'a',text:a.text});set('deleted','deleted',a);
  assert.equal((await call('expressionUsage',{baseRevision:3})).usage.entries.word.occurrences,3);
  assert.equal((await call('expressionUsageDetails',{baseRevision:3,entryId:'word'})).details.total,3);
  assert.equal((await call('expressionUsage',{baseRevision:2})).status,409);
  assert.equal((await call('expressionUsageDetails',{baseRevision:3,entryId:'disabled'})).status,400);
  assert.equal((await call('expressionUsageDetails',{baseRevision:3,entryId:'missing'})).status,404);
  assert.equal((await call('expressionUsageDetails',{baseRevision:3,entryId:'word',offset:-1})).status,400);
  set('a','writing',edited);assert.equal((await call('expressionUsage',{baseRevision:3})).usage.entries.word.occurrences,1);
  db.delete('b');assert.equal((await call('expressionUsage',{baseRevision:3})).usage.entries.word.occurrences,0);
  set('expression-library','expressions',changed);assert.equal((await call('expressionUsage',{baseRevision:3})).status,409);
  globalThis.qaAuthorized=false;assert.equal((await call('expressionUsage',{baseRevision:4})).status,401);delete globalThis.qaAuthorized;
  console.log('PASS expression usage: distinct occurrences, latest bodies, independent rewrites, drafts, recalculation, disabled entries, approximation, context, pagination and repeated-match limits.');
}finally{await rm(dir,{recursive:true,force:true});}
