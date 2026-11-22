import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-quiz-achievements-'));
try {
 await build({stdin:{contents:"export * from './src/server/quiz-achievements';export * from './src/lib/achievement-types';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'rules.mjs')});
 const {collectQuizAchievements:collect,earnedQuizMilestones:earned,milestoneDisplay}=await import(join(dir,'rules.mjs'));
 const source=(key='word:a',extra={})=>({key,kind:key.startsWith('word:')?'word':'sentence',text:'answer '+key,answers:['answer '+key],category:{main:'大作文',sub:'原因'},...extra});
 const session=(id,sources=[source()],extra={})=>({id,createdAt:'2026-11-20T01:00:00Z',mode:'meaning',questions:[{sources,slots:0,kind:sources[0].kind}],...extra});
 const answer=(writingId,extra={})=>({writingId,index:0,answer:'answer word:a',skipped:false,verdict:'correct',matchedKey:'word:a',createdAt:'2026-11-20T02:00:00Z',...extra});
 const zero=collect([],[],[],[]); assert.deepEqual(earned(zero),[]);
 for(const [field,threshold,id] of [['attempts',10,'E01'],['attempts',100,'E02'],['attempts',300,'E03'],['attempts',500,'E04'],['correctExpressions',10,'E05'],['correctExpressions',30,'E06'],['correctExpressions',100,'E07'],['recoveredExpressions',5,'E08'],['recoveredExpressions',20,'E09'],['coveredCategories',5,'E12']]) {
  assert(!earned({...zero,[field]:threshold-1}).some(m=>m.id===id));assert(earned({...zero,[field]:threshold}).some(m=>m.id===id));
 }
 const all=earned(Object.fromEntries(Object.keys(zero).map(k=>[k,500])));assert.equal(all.length,12);assert.equal(milestoneDisplay(all).featured.length,6);assert.equal(milestoneDisplay(all).earlier.length,6);
 assert(!earned({...zero,wordExpressions:10,sentenceExpressions:9}).some(m=>m.id==='E10'));
 assert(!earned({...zero,meaningExpressions:10,scenarioExpressions:9}).some(m=>m.id==='E11'));
 const s=session('s'),a=answer('s');
 assert.equal(collect([s],[a,a],[],[]).attempts,1);
 for(const extra of [{skipped:true},{answer:'  '},{answer:'中文'},{index:-1},{index:20}])assert.equal(collect([s],[answer('s',extra)],[],[]).attempts,0);
 assert.equal(collect([s],[answer('s',{verdict:'incorrect',matchedKey:null})],[],[]).attempts,1);
 assert.equal(collect([s],[a],[{writingId:'s',index:0}],[]).correctExpressions,0);
 assert.equal(collect([s],[a],[],[{writingId:'s',index:0,verdict:'incorrect'}]).correctExpressions,0);
 assert.equal(collect([s],[answer('s',{answer:'accepted synonym',verdict:'incorrect',matchedKey:null})],[{writingId:'s',index:0}],[{writingId:'s',index:0,verdict:'correct'}]).correctExpressions,1);
 const grouped=session('s',[source(),source('word:b')]);
 assert.equal(collect([grouped],[a],[],[]).correctExpressions,1);
 assert.equal(collect([grouped],[answer('s',{matchedKey:null,answer:'accepted synonym'})],[],[{writingId:'s',index:0,verdict:'correct'}]).correctExpressions,0);
 assert.equal(collect([grouped],[answer('s',{matchedKey:null,answer:'answer word:b'})],[],[]).correctExpressions,1);
 const later=session('t',[source()],{createdAt:'2026-11-21T01:00:00Z',mode:'scenario'}), right=answer('t',{createdAt:'2026-11-21T02:00:00Z'}),wrong=answer('s',{answer:'wrong',verdict:'incorrect',matchedKey:null});
 let stats=collect([s,later],[wrong,right],[],[]);assert.equal(stats.recoveredExpressions,1);assert.equal(stats.correctExpressions,1);
 assert.equal(collect([s,later],[answer('s',{skipped:true}),right],[],[]).recoveredExpressions,1);
 assert.equal(collect([s,{...later,createdAt:s.createdAt}],[wrong,right],[],[]).recoveredExpressions,0);
 assert.equal(collect([s,{...later,questions:[{sources:[source('word:a',{text:'changed'})]}]}],[wrong,right],[],[]).recoveredExpressions,0);
 assert.equal(collect([s,later],[wrong,right],[],[{writingId:'s',index:0,verdict:'correct'}]).recoveredExpressions,0);
 stats=collect([s,later],[a,right],[],[]);assert.equal(stats.correctExpressions,1);assert.equal(stats.meaningExpressions,1);assert.equal(stats.scenarioExpressions,1);
 const sessions=[],answers=[];
 for(let i=0;i<30;i++) {const key=`word:${i}`,sub='category '+Math.floor(i/5);sessions.push(session('round'+i,[source(key,{category:{main:'大作文',sub}})]));answers.push(answer('round'+i,{matchedKey:key}));}
 stats=collect(sessions,answers,[],[]);assert.equal(stats.attempts,30);assert.equal(stats.correctExpressions,30);assert.equal(stats.coveredCategories,6);
 const changed=sessions.map((s,i)=>({...s,id:'repeat'+i,mode:'scenario',createdAt:'2026-11-21T01:00:00Z',questions:[{sources:[source('word:'+i,{category:{main:'大作文',sub:'one'}})]}]}));
 const changedAnswers=answers.map((a,i)=>({...a,writingId:'repeat'+i,createdAt:'2026-11-21T02:00:00Z'}));
 assert.equal(collect([...sessions,...changed],[...answers,...changedAnswers],[],[]).coveredCategories,1);
 console.log('Quiz achievements: thresholds, histories, deduplication, review, recovery and coverage passed');
} finally {await rm(dir,{recursive:true,force:true});}
