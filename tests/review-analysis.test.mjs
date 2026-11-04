import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-tests-'));
try{
 await build({entryPoints:['src/lib/review-analysis.ts','src/lib/revisions.ts','src/lib/analytics.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
 const {parseReview,suggestCategories,applyOverrides}=await import(join(dir,'review-analysis.js'));
 const {wordDiff}=await import(join(dir,'revisions.js'));const {analyzeGroup}=await import(join(dir,'analytics.js'));
 const md='**1．题目要求与完成情况**\n\n**字数情况：**约100词。\n\n## 3. 逐句批改\n\n【原句】: He go home.\n【修改与说明】\n修改为：He goes home.\n说明：主谓一致错误。\n\n# 4. 模板基础上的个性化优化\n【位置】：结尾\n【可以补充】：Thank you.\n【作用】：更礼貌。\n\n**5．最值得记住的错误**\n- 主谓一致错误\n- 主谓一致错误\n\n8. 评分\n预估档次：7—8分档。\n预估分数：8分/10分，合理区间为7–8分。\n得分优势：切题。\n主要扣分点：主谓一致。';
 const a=parseReview(md);assert.equal(a.sections.filter(Boolean).length,5);assert.equal(a.task['题目要求'],null);assert.equal(a.task['字数情况'],'约100词。');assert.equal(a.score.point,8);assert.equal(a.score.max,10);assert.equal(a.score.low,7);assert.equal(a.score.high,8);assert.equal(a.corrections[0].original,'He go home.');assert.equal(a.corrections[0].revision,'He goes home.');assert.equal(a.optimizations.length,1);assert.equal(a.issues.length,1);assert.equal(a.expressions.length,0);assert.equal(a.model,null);
 const interval=parseReview('## 8. 评分\n预估分数：13—15分。');assert.equal(interval.score.point,null);assert.equal(interval.score.max,null);assert.equal(interval.score.low,13);assert.equal(interval.score.high,15);
 const missing=parseReview('普通批阅文本，没有固定格式。');assert(missing.sections.every(x=>x===null));assert.equal(missing.score.point,null);assert.equal(missing.revisedEssay,null);
 assert.deepEqual(suggestCategories('原句没有语法错误。'),[]);assert(!suggestCategories('这不是句子结构错误。词义与主题不够贴合。').includes('谓语与句子结构'));
 const revised=applyOverrides(a,{[a.issues[0].id]:['不计入问题']});assert.equal(revised.issues[0].manual,true);
 const questions=[{id:'small',exam:'one',type:'small'},{id:'large',exam:'one',type:'large'},{id:'two',exam:'two',type:'large'}];
 const r=(id,w,q,analysis,date)=>({id,writingId:w,questionId:q,analysis,createdAt:date,markdown:md});const rs=[r('old','w','small',a,'2026-01-01'),r('new','w','small',a,'2026-01-02'),r('large','l','large',a,'2026-01-03'),r('missing','m','small',interval,'2026-01-04')];
 const stats=analyzeGroup(rs,questions,'small');assert.equal(stats.rows.length,2);assert.equal(stats.scored.length,1);assert.equal(stats.average,8);assert.equal(stats.categories[0][1].length,1);assert.equal(analyzeGroup(rs,questions,'large').scored.length,0);assert.equal(analyzeGroup(rs,questions,'englishTwoLarge').average,null);
 for(const [before,after] of [['He go home.','He goes home.'],['abc',''],['','hello'],['same','same'],['A very long sentence.','A different long sentence!'],['a '.repeat(2000),'b '.repeat(2000)]]){const d=wordDiff(before,after);assert.equal(d.filter(x=>x.type!=='add').map(x=>x.value).join(''),before);assert.equal(d.filter(x=>x.type!=='remove').map(x=>x.value).join(''),after);}
 // Optional live-data fixtures stay outside the project and release package.
 try{const fixtures=JSON.parse(await readFile('/tmp/folio-fixtures.json','utf8'));for(const fixture of fixtures.filter(x=>x.kind==='review')){const p=parseReview(fixture.data.markdown);assert.equal(p.sections.filter(Boolean).length,8);assert.equal(p.expressions.length,6);assert.equal(p.issues.length,5);assert.equal(p.optimizations.length,3);assert.equal(p.score.point,fixture.data.questionId==='2024-large'?14:15);assert.equal(p.score.max,20);const snap=fixtures.find(x=>x.kind==='snapshot'&&x.data.writingId===fixture.data.writingId).data;const norm=s=>s.replace(/\s+/g,' ').trim();assert(p.corrections.every(c=>norm(snap.text).includes(norm(c.original))));}}catch(e){if(e.code!=='ENOENT')throw e;}
 console.log('PASS: parser, missing/interval scores, real review bindings, classification, grouped deduplication, exact revision diffs');
}finally{await rm(dir,{recursive:true,force:true});}
