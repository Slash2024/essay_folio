import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {test,beforeEach,after} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-quiz-advice-'));
const original=(await readFile('tests/archive-consistency.test.mjs','utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
const archive=original.replace("export async function put(id, kind, payload, existing) {", "export async function put(id, kind, payload, existing) { if(!/^labQuiz/.test(kind))throw Error('Forbidden non-quiz write: '+kind);").replace('export async function all(kind) {',"export async function all(kind) { if(failures.has('read:'+kind))throw Error('read unavailable');");
await build({stdin:{contents:"export {GET,POST} from './src/pages/api/expression-quiz';export {usableAdviceCue} from './src/server/quiz-advice-reader';export {CUE_VERSION} from './src/lib/expression-advice';export {db,failures} from './src/server/archive';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),plugins:[{name:'read-only-boundary',setup(b){
 b.onResolve({filter:/server\/archive$|^\.\/archive$/},()=>({path:'archive',namespace:'test'}));
 b.onResolve({filter:/server\/session$/},()=>({path:'session',namespace:'test'}));
 b.onResolve({filter:/expression-advice-provider|expression-advice-cues|server\/expression-advice$/},()=>{throw Error('Quiz must never import advice generation or repair');});
 b.onLoad({filter:/.*/,namespace:'test'},({path})=>({loader:'js',contents:path==='archive'?archive:"export const authorized=async()=>true,sameOrigin=()=>true;"}));
}}]});
const m=await import(join(dir,'api.mjs'));after(()=>rm(dir,{recursive:true,force:true}));
const id='lab-quiz-12345678-1234-1234-1234-123456789abc';
const stem={id:'stem',category:'大作文 / 原因 / 通用',title:'因果结构',template:'One reason is {{内容}}.',notes:'',substitutions:'',enabled:true};
const cue='当你想用一句话明确提出导致某个现象的具体原因时。';
function seed(id,kind,value){m.db.set(id,Object.freeze({_id:id,kind,questionId:value.questionId||'',modified:'fixed-modified',_updatedDate:'fixed-date',payload:JSON.stringify(value)}));}
const library=()=>JSON.parse(m.db.get('expression-library').payload);
function advice(recordId='card-a',extra={}){
 const task={id:recordId,questionId:recordId,createdAt:'2026-01-01T00:00:00Z',status:'ready',phase:'advice',result:{id:recordId,questionId:recordId,cueVersion:m.CUE_VERSION,cueUpdatedAt:'2026-01-02T00:00:00Z',items:[{entry:{key:'sentence:stem',kind:'sentence',expression:stem.template},cue,example:'One reason is training.'}]},...extra};
 seed(recordId,extra.kind||'expressionAdviceRun',task);return task;
}
beforeEach(()=>{m.db.clear();m.failures.clear();seed('expression-library','expressions',{revision:1,sentences:[stem],words:[],tolerance:'balanced',sourceText:''});seed('lab-quiz-cue-pack','labQuizCuePack',{version:1,sourceRevision:1,entries:[{key:'sentence:stem',text:stem.template,meaning:'其中一个原因是某事。',scenario:'需要用原来的提示介绍一个具体原因。'}]});seed('writing','writing',{text:'Protected source'});seed('context','expressionAdviceContext',{text:'Protected context'});});
async function get(query=''){const r=await m.GET({request:new Request('https://test.invalid/api/expression-quiz'+query)});return {status:r.status,...await r.json()};}
async function post(body){const r=await m.POST({request:new Request('https://test.invalid/api/expression-quiz',{method:'POST',body:JSON.stringify(body)})});return {status:r.status,...await r.json()};}
async function start(extra={}){const v=await get();return post({action:'start',id,mode:'scenario',scope:'all',count:1,signature:v.signature,...extra});}
const protectedData=()=>JSON.stringify([...m.db].filter(([,r])=>!/^labQuiz(?:Session|Answer|Practice|Review|Correction|Report|Cue)$/.test(r.kind)));
test('reading, starting, answering, practice, correction, report and cue edits write only quiz records; advice payload and dates are unchanged',async()=>{
 advice();const before=protectedData();const result=await start();assert.equal(result.status,200);assert.equal(result.progress.questions[0].prompt,cue);assert.equal(result.progress.questions[0].promptSource,'advice');
 for(const body of [
  {action:'answer',answer:'wrong',skipped:false},
  {action:'practice',answer:'One reason is ___',skipped:false,operationId:'lab-quiz-practice-12345678-1234-1234-1234-123456789abc'},
  {action:'review'},
  {action:'correct',verdict:'correct',reason:'可接受的同义表达',confirmed:true},
 ])assert.equal((await post({id,index:0,...body})).status,200);
 const e=(await get('?cues=1')).entries[0];assert.equal(e.scenario,cue);assert.equal(e.scenarioSource,'advice');
 assert.equal((await post({action:'cue',key:e.key,sourceSignature:e.sourceSignature,baseRevision:0,meaning:e.meaning,scenario:'这是我为抽背单独设置的原因提示。',answers:[],operationId:'lab-quiz-cue-save-12345678-1234-1234-1234-123456789abc'})).status,200);
 const next=await start({id:id.replace('12345678','22345678')});assert.equal(next.progress.questions[0].promptSource,'custom');
 assert.equal(protectedData(),before);assert.equal((await get('?session='+id)).progress.score.correct,1);
});
test('meaning mode stays literal; scenario binds the current original skeleton, never a filled example or stale snapshot forms',async()=>{
 advice();let s=await start({mode:'meaning'});assert.equal(s.progress.questions[0].prompt,'其中一个原因是某事。');assert.equal(s.progress.questions[0].promptSource,undefined);
 const other=id.replace('12345678','22345678');await start({id:other});
 assert.equal((await post({action:'answer',id:other,index:0,answer:'One reason is training.',skipped:false})).progress.results[0].verdict,'incorrect');
 assert.equal((await post({action:'answer',id,index:0,answer:'ONE REASON IS ___!',skipped:false})).progress.results[0].verdict,'correct');
 const saved=JSON.parse(m.db.get(other).payload);assert.equal(saved.questions[0].promptOrigin.recordId,'card-a');assert.equal(saved.questions[0].sources[0].text,stem.template);
 assert.equal(JSON.stringify(s.progress).includes('One reason'),false);
});
test('directional contradictions, leaked English, placeholders, vague intent and underspecified word cues fall back',async()=>{
 const up={kind:'sentence',text:'The number saw an increase from {{A}} to {{B}}.',meaning:'数量增长'};
 for(const value of ['当你想说明数量显著升降及其变化幅度时。','当你想表达观点时。','当你想用 English 表达某种具体意图时。','当你想把___填入表达的可变位置时。'])assert.equal(m.usableAdviceCue(value,up),false,value);
 assert.equal(m.usableAdviceCue('当你想用起止数值说明某个数量明显增长时。',up),true);
 const word={kind:'word',text:'creative mindset',meaning:'创新精神'};
 assert.equal(m.usableAdviceCue('当你想点明活动旨在鼓励某种精神或态度时。',word),false);
 assert.equal(m.usableAdviceCue('当你想明确点出一项活动重视创新的态度时。',word),true);
 const t=advice();t.result.items[0].cue='当你想表达观点时。';seed(t.id,'expressionAdviceRun',t);
 assert.equal((await start()).progress.questions[0].promptSource,'original');
});
test('failed tasks, obsolete versions, changed keys/content and disabled entries never supply new prompts',async()=>{
 const bads=[{status:'failed'}, {result:{cueVersion:'old',items:[]}}, {result:{cueVersion:m.CUE_VERSION,items:[{entry:{key:'sentence:missing',kind:'sentence',expression:stem.template},cue}]}}, {result:{cueVersion:m.CUE_VERSION,items:[{entry:{key:'sentence:stem',kind:'sentence',expression:'A different skeleton.'},cue}]}}];
 for(const [i,extra] of bads.entries()){m.db.delete('card-a');advice('card-a',extra);const s=await start({id:id.replace('12345678',String(i+2).repeat(8))});assert.equal(s.progress.questions[0].promptSource,'original');}
 const lib=library();lib.sentences[0].enabled=false;seed('expression-library','expressions',lib);assert.equal((await get()).counts.scenario.all,0);
});
test('uses only the latest successful card per question and mode, without reviving obsolete cue versions',async()=>{
 advice('old',{questionId:'same'});const next=advice('new',{questionId:'same',createdAt:'2026-02-01T00:00:00Z'});next.result.cueVersion='old';seed('new','expressionAdviceRun',next);
 assert.equal((await start()).progress.questions[0].promptSource,'original');
 seed('new','expressionAdviceRun',{...next,status:'failed'});
 assert.equal((await start({id:id.replace('12345678','22345678')})).progress.questions[0].promptSource,'advice');
});
test('distinct valid variants rotate by round identity while each entry appears once; retries preserve the selected prompt and provenance',async()=>{
 advice();const t=advice('card-b',{kind:'expressionAdviceStrongRun'});t.result.items[0].cue='当你想先点出一个有依据的原因，再组织后面的分析时。';seed(t.id,'expressionAdviceStrongRun',t);
 const prompts=new Set();const overview=await get();assert.equal(overview.counts.scenario.all,1);
 for(let i=0;i<8;i++){const roundId=`lab-quiz-${String(i+1).repeat(8)}-1234-1234-1234-123456789abc`;const s=await start({id:roundId});assert.equal(s.progress.questions.length,1);prompts.add(s.progress.questions[0].prompt);assert.deepEqual((await start({id:roundId})).progress,s.progress);assert.equal(JSON.parse(m.db.get(roundId).payload).questions[0].sources[0].scenarioVariants,undefined);}
 assert.equal(prompts.size,2);
});
test('shared or colliding cues do not silently add ambiguous answers, change draw counts, or duplicate entries',async()=>{
 const lib=library();lib.sentences.push({...stem,id:'other',template:'A factor is {{内容}}.'});seed('expression-library','expressions',lib);
 const pack=JSON.parse(m.db.get('lab-quiz-cue-pack').payload);pack.entries.push({key:'sentence:other',text:lib.sentences[1].template,meaning:'另一个因素是某事。',scenario:'需要使用另一种原来的原因提示。'});seed('lab-quiz-cue-pack','labQuizCuePack',pack);
 const t=advice();t.result.items.push({entry:{key:'sentence:other',kind:'sentence',expression:lib.sentences[1].template},cue});seed(t.id,'expressionAdviceRun',t);
 const overview=await get();assert.equal(overview.counts.scenario.all,2);assert.equal(overview.ranges[0].scenarioPrompts.advice,0);
 assert.equal((await start({count:2})).progress.questions.length,2);
});
test('source cue changes invalidate new draws but cannot alter started rounds, history or saved grades; legacy rounds retain their old shape',async()=>{
 const t=advice();const old=await get();await start();const saved=JSON.stringify(m.db.get(id));
 t.result.items[0].cue='当你想解释某个现象时，先明确指出一个导致它的原因。';seed(t.id,'expressionAdviceRun',t);
 assert.equal((await start({id:id.replace('12345678','22345678'),signature:old.signature})).status,409);
 assert.equal((await get('?session='+id)).progress.questions[0].prompt,cue);assert.equal(JSON.stringify(m.db.get(id)),saved);
 const legacy=JSON.parse(m.db.get(id).payload);delete legacy.prompts;delete legacy.questions[0].promptOrigin;seed(id,'labQuizSession',legacy);
 assert.equal((await get('?session='+id)).progress.session.prompts,undefined);assert.equal((await get('?session='+id)).progress.questions[0].promptSource,undefined);
});
test('query failures fall back with a visible status, without advice mutations or provider calls; malformed rows do not suppress valid cards',async()=>{
 advice();seed('malformed','expressionAdviceRun',{status:'ready',result:null});const before=protectedData();
 m.failures.add('read:expressionAdviceStrongRun');const fallback=await get();assert.equal(fallback.adviceReadFailed,true);assert.equal(fallback.counts.scenario.all,1);assert.equal((await start()).progress.questions[0].promptSource,'original');
 m.failures.clear();const next=await start({id:id.replace('12345678','22345678')});assert.equal(next.progress.questions[0].promptSource,'advice');assert.equal(protectedData(),before);
});
test('an explicitly blank custom scenario stays excluded instead of being repopulated from a call card',async()=>{
 advice();const before=protectedData(),e=(await get('?cues=1')).entries[0];
 const body={action:'cue',key:e.key,sourceSignature:e.sourceSignature,baseRevision:0,meaning:e.meaning,scenario:'',answers:[],operationId:'lab-quiz-cue-save-12345678-1234-1234-1234-123456789abc'};
 assert.equal((await post(body)).status,200);assert.equal((await get()).counts.scenario.all,0);assert.equal((await get()).counts.meaning.all,1);assert.equal(protectedData(),before);
});
