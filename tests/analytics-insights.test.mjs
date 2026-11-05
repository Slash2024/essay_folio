import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-insights-'));
await build({entryPoints:['src/lib/analytics.ts','src/lib/analytics-insights.ts','src/lib/review-analysis.ts','src/lib/review-interactions.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
const {analyzeGroup,effectiveIssues}=await import(join(dir,'analytics.js'));
const {buildInsights}=await import(join(dir,'analytics-insights.js'));
const {parseReview}=await import(join(dir,'review-analysis.js'));
const {reviewNotes}=await import(join(dir,'review-interactions.js'));
after(()=>rm(dir,{recursive:true,force:true}));
const questions=[{id:'q1',exam:'one',type:'large',title:'第一题',year:2024},{id:'q2',exam:'one',type:'large',title:'第二题',year:2023},{id:'two',exam:'two',type:'large',title:'英语二',year:2025}];
const md=(summary='主谓一致错误。',explanation='主谓一致错误。',score='14/20分。')=>`## 2. 总体评价\n结构清楚，但表达不够自然。\n## 3. 逐句批改\n【原句】：He go to school every day.\n【修改与说明】\n修改为：He goes to school every day.\n说明：${explanation}\n## 5. 最值得记住的错误\n- ${summary}\n## 8. 评分\n预估分数：${score}\n得分优势：结构清楚。\n主要扣分点：${summary}`;
const review=(id='r1',writingId='w1',q='q1',markdown=md(),date='2026-01-02')=>({id,writingId,questionId:q,createdAt:date,markdown,analysis:parseReview(markdown),label:id});
function curated(r,patch){const n=reviewNotes(r.analysis).find(n=>n.kind==='correction');return {...r,curation:{revision:1,updatedAt:'2026-02-01',history:[],notes:{[n.id]:{...n,origin:'edited',scope:'unlocated',anchor:null,display:'auto',shortNote:'',emphasis:'none',hidden:false,...patch}}}};}
test('keep, optimization, hidden and restoration update categories without changing score or source',()=>{
 const r=review(),snapshot=JSON.stringify(r);
 assert.equal(analyzeGroup([r],questions,'large').categories[0][0],'主谓一致');
 for(const patch of [{kind:'keep'},{kind:'optimization'},{hidden:true}]){
  const edited=curated(r,patch),a=analyzeGroup([edited],questions,'large');
  assert.equal(a.categories.length,0);assert.equal(a.average,14);assert.equal(a.rows.length,1);
  assert.equal(buildInsights([edited],questions,'large').patterns.length,0);
 }
 assert.equal(analyzeGroup([curated(r,{kind:'correction'})],questions,'large').categories[0][0],'主谓一致');
 assert.equal(JSON.stringify(r),snapshot);
 assert.equal(buildInsights([curated(r,{kind:'keep'})],questions,'large').strengths.find(s=>s.id==='kept').writingCount,1);
});
test('edited explanation reclassifies the issue, and explicit category exclusions survive display-only edits',()=>{
 const r=review(),edited=curated(r,{explanation:'这里是介词与固定搭配错误。'});
 const a=analyzeGroup([edited],questions,'large');
 assert.deepEqual(a.categories.map(([c])=>c),['介词与固定搭配']);
 const excluded={...curated(r,{shortNote:'换了显示文字'}),issueOverrides:{[r.analysis.issues[0].id]:['不计入问题']}};
 assert.equal(effectiveIssues(excluded).length,0);
 const manual={...curated(r,{shortNote:'保留人工分类'}),issueOverrides:{[r.analysis.issues[0].id]:['其他问题']}};
 assert.deepEqual(effectiveIssues(manual)[0].categories,['其他问题']);
});
test('one kept sentence does not remove another active error of the same category',()=>{
 const r=review();r.markdown=r.markdown.replace('## 5.', '【原句】：They goes home.\n【修改与说明】\n修改为：They go home.\n说明：主谓一致错误。\n## 5.');r.analysis=parseReview(r.markdown);
 const a=analyzeGroup([curated(r,{kind:'keep'})],questions,'large');
 assert.equal(a.categories[0][0],'主谓一致');assert.equal(a.categories[0][1].length,1);
});
test('manually added correction is counted; personal notes and optional suggestions are not',()=>{
 const r=review();const note={id:'manual-example',kind:'correction',title:'补充',original:null,replacement:null,explanation:'介词与固定搭配错误。',position:null,categories:[],origin:'personal',scope:'global',anchor:null,display:'notes',shortNote:'',emphasis:'none',hidden:false};
 r.curation={revision:1,updatedAt:'2026-02-01',history:[],notes:{[note.id]:note}};
 assert(effectiveIssues(r).some(i=>i.categories.includes('介词与固定搭配')));
 note.kind='personal';assert(!effectiveIssues(r).some(i=>i.categories.includes('介词与固定搭配')));
});
test('latest review and exam separation are retained; priorities contain verifiable evidence and recipes',()=>{
 const rs=[review(),review('r2','w1','q1',md('介词与固定搭配错误。','介词与固定搭配错误。'),'2026-01-03'),review('r3','w2','two',md('主谓一致错误。','主谓一致错误。','11/15分。'))];
 const insight=buildInsights(rs,questions,'large');
 assert.equal(insight.sampleCount,1);assert.equal(insight.patterns[0].id,'collocation');
 assert(insight.priorities.every(p=>p.evidence.length&&p.practice&&p.check));
 assert.equal(insight.priorities[0].evidence[0].reviewId,'r2');
 assert.equal(analyzeGroup(rs,questions,'englishTwoLarge').average,11);
});
test('rewrite comparison never turns omission into mastery and does not fabricate scores',()=>{
 const first=review(),second=review('r2','w2','q1',md('介词与固定搭配错误。','介词与固定搭配错误。','13–15分。'),'2026-01-04');
 const i=buildInsights([first,second],questions,'large',[{id:'w2',parentId:'w1',questionId:'q1'}]);
 assert.equal(i.rewrites.length,1);assert.equal(i.rewrites[0].scoreDelta,null);
 assert.deepEqual(i.rewrites[0].notMentioned,['主谓一致']);assert.deepEqual(i.rewrites[0].newlyMentioned,['介词与固定搭配']);
 assert(!('mastered' in i.rewrites[0]));
});
test('new-question reuse requires the bound submitted text and a submission after the original feedback',()=>{
 const rs=[review(),review('r2','w2','q2',md('介词与固定搭配错误。','介词与固定搭配错误。'),'2026-01-06')];
 const ws=[{id:'w2',questionId:'q2',submittedAt:'2026-01-05'}];
 const texts={r2:'He goes to school every day. This is a different essay.'};
 assert.equal(buildInsights(rs,questions,'large',ws,texts).reuse.length,1);
 assert.equal(buildInsights(rs,questions,'large',ws,{}).reuse.length,0);
 assert.equal(buildInsights(rs,questions,'large',[{...ws[0],submittedAt:'2026-01-01'}],texts).reuse.length,0);
 assert.equal(buildInsights(rs,questions,'large',[{...ws[0],parentId:'w1'}],texts).reuse.length,0);
});
test('positive strengths exclude negative clauses and recommended expressions',()=>{
 const r=review();r.analysis.score.advantages='语言不够准确。结构清晰。';
 r.analysis.sections[1]='表达不自然。';r.analysis.expressions=[{expression:'表达准确，语言流畅',usage:null}];
 const i=buildInsights([r],questions,'large');
 assert.deepEqual(i.strengths.map(s=>s.id),['structure']);
});
