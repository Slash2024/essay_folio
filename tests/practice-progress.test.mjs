import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-progress-'));
try {
 await build({entryPoints:['src/lib/practice-progress.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'progress.mjs')});
 const {collectPracticeProgress,summarizePractice,categoryPractice,earnedMilestones,practiceState,progressPercent}=await import(join(dir,'progress.mjs'));
 const questions=Array.from({length:36},(_,i)=>({id:`q${i}`,exam:'one',type:'large',year:2000+i,topicCategories:i===0?['个人发展','社会道德']:['个人发展']}));
 const writing=(id,questionId,status='submitted',text='A real essay.',updatedAt='2026-11-05T01:00:00Z')=>({id,questionId,status,text,updatedAt,createdAt:updatedAt});
 const writings=[...Array.from({length:31},(_,i)=>writing(`w${i}`,`q${i}`)),writing('w0','q0','submitted','Revised same writing.','2026-11-05T02:00:00Z'),writing('rewrite','q0'),writing('draft','q0','draft'),writing('draft-only','q31','draft'),writing('empty','q32','draft','  '),writing('empty-submit','q33','submitted',' '),writing('outside','retired-question')];
 const result=collectPracticeProgress(questions,writings,[{writingId:'w0'},{writingId:'w0'},{writingId:'outside'},{writingId:'missing'}]);
 const map=new Map(result.questions.map(p=>[p.questionId,p]));
 const s=summarizePractice(questions,map);
 assert.equal(s.practiced,31);assert.equal(s.submitted,32);assert.equal(s.reviewed,1);assert.equal(s.drafts,2);assert.equal(s.rewritten,1);
 assert.equal(map.get('q0').submittedCount,2);assert.equal(map.get('q0').reviewedCount,1);assert.equal(map.get('q0').latestDraftId,'draft');assert.equal(map.get('q0').latestReviewedId,'w0');
 assert.equal(practiceState(map.get('q0')),'reviewed');assert.equal(practiceState(map.get('q31')),'draft');assert.equal(practiceState(map.get('q32')),'unstarted');
 assert.equal(categoryPractice(questions,'个人发展',map).practiced,31);assert.equal(categoryPractice(questions,'社会道德',map).practiced,1);assert.equal(s.practiced,31);
 assert.deepEqual(earnedMilestones(questions,map).map(m=>m.id),['first','ten','rewrite']);
 assert(!JSON.stringify(result).includes('A real essay.'));assert(!JSON.stringify(result).includes('Revised same writing.'));
 const removed=collectPracticeProgress(questions,writings.filter(w=>w.questionId!=='q0'),[]);const removedMap=new Map(removed.questions.map(p=>[p.questionId,p]));
 assert.equal(summarizePractice(questions,removedMap).practiced,30);assert(!earnedMilestones(questions,removedMap).some(m=>m.id==='rewrite'));
 const empty=collectPracticeProgress(questions,[],[]);assert.deepEqual(earnedMilestones(questions,new Map(empty.questions.map(p=>[p.questionId,p]))),[]);
 const full=collectPracticeProgress(questions,questions.map(q=>writing(q.id,q.id)),[]);assert(earnedMilestones(questions,new Map(full.questions.map(p=>[p.questionId,p]))).some(m=>m.id==='complete'));
 assert.equal(progressPercent(0,0),0);assert.equal(summarizePractice([],map).percent,0);
 console.log('PASS practice progress: unique questions, 30+ writings, drafts, rewrites vs revisions, multiple reviews, categories, deleted/unknown/empty records, earned-only milestones and private-text omission');
} finally {await rm(dir,{recursive:true,force:true});}
