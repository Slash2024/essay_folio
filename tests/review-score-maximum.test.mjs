import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-score-maximum-'));
try{
 await build({stdin:{contents:"export * from './src/lib/review-analysis';export {analyzeGroup} from './src/lib/analytics';export {analyzedReview} from './src/server/history';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'score.mjs'),plugins:[{name:'archive-isolated',setup(b){b.onResolve({filter:/^\.\/archive$/},()=>({path:'archive',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const all=()=>[],decode=r=>r,find=()=>null,list=()=>({rows:[]}),put=()=>{};',loader:'js'}));}}]});
 const {parseReview,withScoreMaximum,analyzeGroup,analyzedReview}=await import(join(dir,'score.mjs'));
 const questions=[{id:'2024-small',type:'small',exam:'one'},{id:'2024-large',type:'large',exam:'one'},{id:'2024-english-two-large',type:'large',exam:'two'}];
 const markdown=s=>'## 8. 评分\n预估分数：'+s;
 const reviews=questions.map((q,i)=>({id:'r'+i,writingId:'w'+i,questionId:q.id,createdAt:'2026-11-05',markdown:markdown(i===0?'8分。':'16分。')}));
 for(const [i,q] of questions.entries()){
  const raw=parseReview(reviews[i].markdown),before=JSON.stringify(raw);assert.equal(raw.score.max,null);
  const resolved=withScoreMaximum(raw,q);assert.equal(resolved.score.max,i===0?10:20);assert.equal(resolved.score.point,i===0?8:16);assert.equal(JSON.stringify(raw),before);
  const api=analyzedReview(reviews[i]);assert.equal(api.analysis.score.max,i===0?10:20);assert.equal(api.markdown,reviews[i].markdown);
  const group=analyzeGroup([{...reviews[i],analysis:raw}],questions,i===0?'small':i===1?'large':'englishTwoLarge');assert.equal(group.average,i===0?8:16);assert.equal(group.scored.length,1);
 }
 const large=questions[1];
 for(const input of ['13–15分。','not given','']){
  const a=withScoreMaximum(parseReview(markdown(input)),large);assert.equal(a.score.max,20);assert.equal(a.score.point,null);
  const group=analyzeGroup([{...reviews[1],analysis:a}],questions,'large');assert.equal(group.average,null);
 }
 const interval=withScoreMaximum(parseReview(markdown('13–15分。')),large);assert.equal(interval.score.low,13);assert.equal(interval.score.high,15);
 const explicit=parseReview(markdown('11/15分。'));assert.equal(withScoreMaximum(explicit,questions[2]),explicit);assert.equal(withScoreMaximum(explicit,questions[2]).score.max,15);
 const mismatch=analyzeGroup([{...reviews[2],analysis:explicit}],questions,'englishTwoLarge');assert.equal(mismatch.average,null);assert.equal(mismatch.rows[0].analysis.score.max,15);
 const invalid=analyzeGroup([{...reviews[1],markdown:markdown('25分。')}],questions,'large');assert.equal(invalid.average,null);
 const unknown=analyzedReview({...reviews[1],questionId:'unknown-question'});assert.equal(unknown.analysis.score.max,null);assert.equal(withScoreMaximum(parseReview(markdown('16分。'))).score.max,null);
 console.log('PASS omitted maximum: all three pools, API responses, cached analyses, averages, intervals, missing scores, explicit mismatches, unknown tasks and source immutability.');
}finally{await rm(dir,{recursive:true,force:true});}
