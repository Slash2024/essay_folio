import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-template-review-'));
await build({entryPoints:['src/lib/template-review.ts','src/lib/review-analysis.ts','src/lib/review-interactions.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
const {buildTemplateReview,currentQuote}=await import(join(dir,'template-review.js'));
const {parseReview}=await import(join(dir,'review-analysis.js'));
const {reviewNotes}=await import(join(dir,'review-interactions.js'));
after(()=>rm(dir,{recursive:true,force:true}));
const questions=[{id:'q',exam:'one',type:'large',title:'公园',year:2024},{id:'s',exam:'one',type:'small',title:'邀请',year:2022},{id:'two',exam:'two',type:'large',title:'图表',year:2026}];
const sentence=(id,template,category='大作文 / 图画与材料 / 结尾')=>({id,title:id,template,category,notes:'',substitutions:'',enabled:true});
const library={revision:1,updatedAt:null,tolerance:'balanced',sourceText:'',sentences:[sentence('catalyst','In a larger sense, {{subject}} serves as a catalyst for {{result}}.'),sentence('invitation','Given your expertise in {{field}}, it is with great pleasure that I {{purpose}}.','小作文 / 框架 / 开头')],words:[]};
function review({id='r',writingId='w',q='q',original='In a larger sense, parks serves as a catalyst for public well-being.',replacement=original.replace('parks serves','parks serve'),explanation='主谓一致错误，复数主语应用 serve。',date='2026-01-02'}={}){
 const markdown=`## 3. 逐句批改\n【原句】：${original}\n【修改与说明】\n修改为：${replacement}\n说明：${explanation}`;
 return {id,writingId,questionId:q,createdAt:date,markdown,analysis:parseReview(markdown)};
}
const run=(rs,lib=library,key='large',current={})=>buildTemplateReview(rs,questions,key,lib,Object.fromEntries(rs.map(r=>[r.id,r.analysis.corrections[0].original])),current);
test('deduplicates repeated reviews and separates all three exam groups',()=>{
 const a=review(),b=review({id:'new',date:'2026-01-03'}),two=review({id:'two-r',writingId:'two-w',q:'two'});
 assert.equal(run([a,b,two]).groups[0].evidence.length,1);
 assert.equal(run([a,b,two]).groups[0].evidence[0].reviewId,'new');
 assert.equal(run([a,b,two],library,'englishTwoLarge').groups[0].writingCount,1);
 assert.equal(run([a,b,two],library,'small').groups.length,0);
});
test('keep, hidden, optional and excluded decisions do not resurface as errors',()=>{
 const base=review(),note=reviewNotes(base.analysis)[0];
 for(const patch of [{kind:'keep'},{hidden:true},{categories:['不计入问题']}]){
  const r={...base,curation:{notes:{[note.id]:{...note,...patch}}}};
  assert.equal(run([r]).groups.length,0);
 }
 const r={...base,curation:{notes:{[note.id]:{...note,kind:'optimization'}}}};
 assert.equal(run([r]).groups.length,0);assert.equal(run([r]).reminders.length,1);
});
test('does not mistake an unrelated error in the same sentence for a template error',()=>{
 const lib={...library,sentences:[sentence('short','place a high premium on {{topic}}')]};
 const original='Families place a high premium on health, and childrens plays outside.';
 const r=review({original,replacement:original.replace('childrens plays','children play'),explanation:'并列分句的主谓一致错误。'});
 // A closed template component should not consume a subsequent independent clause.
 const closed={...lib,sentences:[sentence('short','place a high premium on health')]};
 assert.equal(run([r],closed).groups.length,0);
 assert.equal(run([r],lib).groups.length,0);
});
test('misspelled template skeleton remains recognizable and word-only entries are excluded',()=>{
 const original='Given your expertise in science, it is with great plesure that I invite you.';
 const r=review({q:'s',original,replacement:original.replace('plesure','pleasure'),explanation:'pleasure 拼写错误。'});
 assert.equal(run([r],library,'small').groups[0].id,'invitation');
 const wordOnly={...library,sentences:[],words:[{id:'word',term:'parks',forms:[],meaning:'公园',enabled:true}]};
 assert.equal(run([review()],wordOnly).groups.length,0);
});
test('already corrected current draft and missing bound text are not counted',()=>{
 const r=review();assert.equal(run([r],library,'large',{w:r.analysis.corrections[0].revision}).groups.length,0);
 const result=buildTemplateReview([r],questions,'large',library,{});
 assert.equal(result.groups.length,0);assert.equal(result.unlocated,1);
});
test('punctuation corrections survive equality checking; ambiguous quotes abstain',()=>{
 const original='In a larger sense parks serve as a catalyst for public well-being.';
 const r=review({original,replacement:original.replace('sense parks','sense, parks'),explanation:'标点缺失。'});
 assert.equal(run([r]).groups.length,1);
 const quote='This sufficiently long statement contains an old spelling mistake here and otherwise stays exactly the same throughout the entire quotation.';
 assert.equal(currentQuote(quote.replace('old','odd'),quote),quote.replace('old','odd'));
 assert.equal(currentQuote(quote+' '+quote,quote),null);
});
