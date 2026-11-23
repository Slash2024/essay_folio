import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-sentence-review-'));
await build({stdin:{contents:"export * from './src/lib/translation-review';export {translationQuestions,reviewScore} from './src/lib/translation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'review.mjs')});
const {parseTranslationReview,renderReviewFragments,applySentenceReviewChanges,translationQuestions,reviewScore}=await import(join(dir,'review.mjs'));
after(()=>rm(dir,{recursive:true,force:true}));
const q=translationQuestions.find(q=>q.year===2020),numbers=[46,47,48,49,50],answers=['独有译词甲','独有译词乙','独有译词丙','独有译词丁','独有译词戊'];
const rows=numbers.map((n,i)=>`|${n}|${n===47?'2':'1.5'}／2|评分依据${n}专属|失分说明${n}专属|`).join('\n');
const grammar=numbers.map(n=>`**${n}题：知识点${n}**\n\n语法讲解${n}专属。\n\n> 独立例句${n}专属。\n> 中文例句${n}专属。`).join('\n\n---\n\n');
const differences=numbers.map(n=>`**${n}题**\n\n|你的表达|参考答案的表达|判定及原因|\n|---|---|---|\n|表达${n}|参考${n}|可接受，差异说明${n}专属|`).join('\n\n');
const md=`**本次得分：8分／10分。**\n\n整体评价专属说明。\n\n**一、逐句评分与给分依据**\n\n|题号|得分|主要给分依据|失分或不足|\n|---|---|---|---|\n${rows}\n|合计|8／10|||\n\n专项核对：\n\n- 全篇规则说明。\n- 第50题标点说明。\n\n**二、语法知识点、示例与本题纠正**\n\n${grammar}\n\n**三、词汇表达建议**\n\n|原文|你的表达|建议与判断|\n|---|---|---|\n|the Church|独有译词甲|词汇46专属|\n|revelations|独有译词乙|词汇47专属|\n|rationalists|独有译词丙|词汇48专属|\n|reasoning|独有译词丁|词汇49专属|\n|captured|独有译词戊|词汇50专属|\n|unknown term|未关联译词|无法归题的词汇说明|\n\n**四、完善后的完整译文**\n\n${numbers.map(n=>`**${n}．** 完善译文${n}专属。`).join('\n\n')}\n\n**新增部分：与参考答案不一致的地方，究竟对不对？**\n\n差异判定通用说明。\n\n${differences}\n\n以后批阅时，保留这条全篇说明。`;

test('legacy prose, bold question labels and mixed tables distribute complete content to five questions',()=>{
 const r=parseTranslationReview(md,q,answers);assert.equal(r.total,8);assert.equal(reviewScore(md),8);assert.equal(r.summary.trim(),'整体评价专属说明。');
 for(const s of r.sentences){
  assert.equal(s.score,s.number===47?2:1.5);assert.deepEqual(s.groups.map(g=>g.section),[1,2,3,4,5]);
  const text=renderReviewFragments(s.fragments);
  for(const kind of ['评分依据','语法讲解','独立例句','中文例句','词汇','完善译文','差异说明'])assert(text.includes(`${kind}${s.number}专属`),`${kind} missing for ${s.number}`);
  for(const n of numbers.filter(n=>n!==s.number))for(const kind of ['评分依据','语法讲解','词汇','完善译文','差异说明'])assert(!text.includes(`${kind}${n}专属`),`${n} leaked into ${s.number}`);
 }
 const global=renderReviewFragments(r.global);for(const text of ['全篇规则说明','无法归题的词汇说明','差异判定通用说明','以后批阅时'])assert(global.includes(text));
 assert(!global.includes('第50题标点说明'));assert(renderReviewFragments(r.sentences[4].fragments).includes('第50题标点说明'));
});
test('Markdown headings, numbered final translations, escaped pipes and code examples retain their question context',()=>{
 const text='## 1. 总分与整体评价\n总分：7.5/10\n\n## 2. 逐句批阅\n### 第46题\n得分：1.5/2\n\n```text\n47. 这是代码示例，不是另一题标题\n```\n\n### 第47题\n得分：2/2\n\n## 3. 与参考答案的差异判定\n|题号|我的表达|判定|\n|---|---|---|\n|46|甲\\|乙|不同但正确|\n|47|丙|可接受|\n\n## 6. 完善后的完整译文\n46. 修订甲\n\n47. 修订乙\n\n## 7. 额外说明\n保留未分类内容。';
 const r=parseTranslationReview(text,q,answers);const s46=renderReviewFragments(r.sentences[0].fragments),s47=renderReviewFragments(r.sentences[1].fragments);
 assert.equal(r.total,7.5);assert(s46.includes('代码示例'));assert(s46.includes('甲\\|乙'));assert(s46.includes('修订甲'));assert(!s46.includes('修订乙'));assert(s47.includes('修订乙'));assert(renderReviewFragments(r.global).includes('未分类内容'));
});
test('ambiguous shared vocabulary is shown for each relevant question and is not editable through a single-question appeal',()=>{
 const text='## 5. 词汇与中文表达建议\n\n|原文|我的表达|说明|\n|---|---|---|\n|the Church|无明确对应译词|共同术语说明|';
 const r=parseTranslationReview(text,q,answers),shared=r.fragments.find(f=>f.table);assert.deepEqual(shared.numbers,[46,48]);
 assert(renderReviewFragments(r.sentences[0].fragments).includes('共同术语说明'));assert(renderReviewFragments(r.sentences[2].fragments).includes('共同术语说明'));
 assert.throws(()=>applySentenceReviewChanges(text,r,46,[{id:shared.id,markdown:shared.source.replace('共同','修改')}]),/其他题目或全篇/);
});
test('scoped appeal patches preserve every byte outside the selected source fragment, including CRLF',()=>{
 const source=md.replaceAll('\n','\r\n'),r=parseTranslationReview(source,q,answers);
 for(const f of r.fragments)assert.equal(source.slice(f.start,f.end),f.source);
 const target=r.sentences[0].fragments.find(f=>f.table&&f.section===2),replacement=target.source.trim().replace('可接受','不同但正确');
 const updated=applySentenceReviewChanges(source,r,46,[{id:target.id,markdown:replacement}]);
 const suffix=target.source.match(/\s*$/)[0];assert.equal(updated,source.slice(0,target.start)+replacement+suffix+source.slice(target.end));
 const after=parseTranslationReview(updated,q,answers);assert.equal(after.total,8);for(const n of [47,48,49,50])assert.equal(renderReviewFragments(after.sentences[n-46].fragments),renderReviewFragments(r.sentences[n-46].fragments));
});
test('appeals reject foreign, duplicated, malformed-table and score-changing patches',()=>{
 const r=parseTranslationReview(md,q,answers),row46=r.sentences[0].fragments.find(f=>f.table&&f.section===1),row47=r.sentences[1].fragments.find(f=>f.table&&f.section===1),body=r.sentences[0].fragments.find(f=>f.section===3&&!f.table&&f.source.includes('语法讲解'));
 assert.throws(()=>applySentenceReviewChanges(md,r,46,[{id:row47.id,markdown:row47.source}]),/其他题目/);
 assert.throws(()=>applySentenceReviewChanges(md,r,46,[{id:row46.id,markdown:row46.source.replace('1.5','2')}]),/分数/);
 assert.throws(()=>applySentenceReviewChanges(md,r,46,[{id:row46.id,markdown:'一段非表格内容'}]),/表格/);
 assert.throws(()=>applySentenceReviewChanges(md,r,46,[{id:body.id,markdown:'### 第47题\n错误归属'}]),/其他题号/);
 assert.throws(()=>applySentenceReviewChanges(md,r,46,[{id:body.id,markdown:body.source},{id:body.id,markdown:body.source}]),/格式/);
});
test('uncategorized text remains available and uncertain or out-of-range scores are not invented',()=>{
 for(const text of ['一段没有题号的批阅。','### 第46题\n评分：1.5分','## 1. 总分与整体评价\n总分：12/10','## 1. 总分与整体评价\n总分：7—8分','## 1. 总分与整体评价\n总分：7.3/10'])assert.equal(parseTranslationReview(text,q,answers).total,null);
 const r=parseTranslationReview('一段没有题号的批阅。',q,answers);assert.equal(r.sentences.filter(s=>s.fragments.length).length,0);assert(renderReviewFragments(r.global).includes('没有题号'));
});

test('a bold grammar subheading retains the current question and a total-only table is recognized',()=>{
 const text='## 4. 语法理解与纠正\n\n### 第46题\n\n**语法知识点**\n\n保留第46题的讲解。\n\n## 1. 总分与整体评价\n\n|题号|得分|\n|---|---|\n|合计|8/10|';
 const r=parseTranslationReview(text,q,answers);assert.equal(r.total,8);assert(renderReviewFragments(r.sentences[0].fragments).includes('保留第46题的讲解'));
});
