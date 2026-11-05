import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-milestones-'));
try{
 await build({stdin:{contents:"export * from './src/server/achievement-milestones';export * from './src/lib/practice-progress';export * from './src/lib/achievement-types';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'milestones.mjs')});
 const {personalNoteCounts,earnedMilestoneRules,collectPracticeProgress,milestoneDisplay}=await import(join(dir,'milestones.mjs'));
 const questions=JSON.parse(await readFile('src/data/questions.json','utf8'));
 const writing=(q,i=0)=>({id:`w-${q.id}-${i}`,questionId:q.id,status:'submitted',text:'A submitted essay.',updatedAt:'2026-11-05T01:00:00Z',createdAt:'2026-11-05T01:00:00Z'});
 const note=(content,extra={})=>({kind:'personal',origin:'personal',title:'个人笔记',shortNote:'',explanation:content,replacement:null,...extra});
 const review=(w,notes)=>({id:'r-'+w.id,questionId:w.questionId,writingId:w.id,curation:{notes:Object.fromEntries(notes.map((n,i)=>['note-'+i,n]))}});
 const run=(writings,reviews=[])=>{const snapshot=collectPracticeProgress(questions,writings,reviews);return earnedMilestoneRules(questions,snapshot,personalNoteCounts(questions,writings,reviews));};
 const w=writing(questions[0]);
 assert.deepEqual(run([],[]),[]);
 assert.deepEqual(run([{...w,status:'draft'}],[]),[]);
 const imported=Array.from({length:120},()=>review(w,[note('Automatic text',{origin:'edited'}),note('Correction',{kind:'correction'}),note('',{title:'Only a title'})]));
 assert(!run([w],imported).some(m=>m.id.startsWith('D')),'Review counts never unlock note achievements');
 for(const threshold of [10,30,60,100]){
  const notes=Array.from({length:threshold},(_,i)=>note('Personal observation '+i));
  const before=run([w],[review(w,notes.slice(1))]);const after=run([w],[review(w,notes)]);
  const id=({10:'D01',30:'D02',60:'D03',100:'D04'})[threshold];
  assert(!before.some(m=>m.id===id));assert(after.some(m=>m.id===id));
 }
 const duplicate=review(w,[note('  My   insight. '),note('my insight.'),note('my insight.',{shortNote:'my insight.'})]);
 assert.equal(personalNoteCounts(questions,[w],[duplicate,duplicate]).get(w.questionId),1,'same-question same-content imports/versions deduplicated');
 const w2=writing(questions[1]);assert.equal(personalNoteCounts(questions,[w,w2],[duplicate,review(w2,[note('my insight.')])]).get(w2.questionId),1);
 assert.equal(personalNoteCounts(questions,[],[duplicate]).size,0,'deleted writing removes its note contribution');
 assert.equal(personalNoteCounts(questions,[w],[{...duplicate,curation:{notes:{}},curationHistory:[duplicate.curation]}]).size,0,'historical snapshots do not count');
 for(const [n,id] of [[10,'D05'],[20,'D06']]){
  const ws=questions.slice(0,n).map(q=>writing(q));const rs=ws.map((w,i)=>review(w,Array.from({length:3},(_,j)=>note(`Insight ${i}-${j}`))));
  assert(run(ws,rs).some(m=>m.id===id));assert(!run(ws,rs.slice(1)).some(m=>m.id===id));
 }
 const allWritings=questions.flatMap(q=>[writing(q),writing(q,1),writing(q,2)]);
 const allReviews=questions.slice(0,20).map((q,i)=>review(writing(q),Array.from({length:i===0?43:3},(_,j)=>note(`Insight ${i}-${j}`))));
 const all=run(allWritings,allReviews);assert.equal(all.length,26);assert.equal(new Set(all.map(m=>m.id)).size,26);
 const expected=[...Array.from({length:7},(_,i)=>'A0'+(i+1)),...Array.from({length:8},(_,i)=>'B0'+(i+1)),...Array.from({length:5},(_,i)=>'C0'+(i+1)),...Array.from({length:6},(_,i)=>'D0'+(i+1))];assert.deepEqual(all.map(m=>m.id),expected);
 assert.equal(all.find(m=>m.id==='A04').title,'笔下成径');assert.equal(all.find(m=>m.id==='A05').title,'积页成卷');assert.equal(all.find(m=>m.id==='A06').title,'落笔成林');
 const display=milestoneDisplay(all);assert(display.featured.some(m=>m.id==='A06'));assert(!display.featured.some(m=>m.id==='A01'));assert(display.earlier.some(m=>m.id==='A01'));assert(display.featured.some(m=>m.id==='D04'));assert(display.featured.some(m=>m.id==='D06'));assert.equal(display.featured.length+display.earlier.length,26);
 // Multi-label category coverage never needs one different essay per label.
 const oneTopics=questions.filter(q=>q.exam==='one'&&q.type==='large'&&!q.topicCategories?.includes('材料类')).map(q=>writing(q));assert(run(oneTopics).some(m=>m.id==='B05'));assert(!run(oneTopics).some(m=>m.id==='B08'));
 console.log('PASS: all 26 earned-only server rules; renamed stages; exact note thresholds and question breadth; no review-count unlocks; note dedup/origin/title/deletion/history handling; highest-stage display and expandable earlier earned stages');
}finally{await rm(dir,{recursive:true,force:true});}
