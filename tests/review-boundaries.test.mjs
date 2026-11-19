import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('item headings stay out of neighbouring notes; quote paragraphs and saved note identities survive',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-review-boundaries-'));
 try{
  await build({stdin:{contents:"export {parseReview,applyOverrides} from './src/lib/review-analysis';export {reviewNotes,interactionId} from './src/lib/review-interactions';export {curatedNotes} from './src/lib/review-curation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'parser.mjs')});
  const {parseReview,reviewNotes,interactionId,curatedNotes,applyOverrides}=await import(join(dir,'parser.mjs'));
  const md=`## 3．逐句批改

### ① 词义与主题

【原句】
Trust requires perfection.
【修改与说明】
修改为：Trust benefits from honesty.
说明：词义与主题不够贴合。

### 保留在本条中的补充说明
这一段仍属于第一条。

### ② 主谓一致错误

【原句】
An honest attitude help us.
【修改与说明】
说明：单数主语需要第三人称单数谓语。

## 4．模板基础上的个性化优化

### ① 加入例子

【位置】第一段
【可以补充】For example, a teacher can check the facts.
【作用】提供贴题的例子。

### ② 增加限定

【位置】第二段末尾
【作用】提醒承认局限之后采取行动。

## 6．修改后的完整作文

保留三段结构。全文约30词。

> We should acknowledge our limitations.
>
> Honesty can build trust. We can check the facts.
>
> A sincere attitude helps us learn.
`;
  const a=parseReview(md),first='词义与主题不够贴合。\n\n### 保留在本条中的补充说明\n这一段仍属于第一条。';
  assert.equal(a.corrections.length,2);assert.equal(a.optimizations.length,2);
  assert.equal(a.corrections[0].explanation,first);
  assert.equal(a.corrections[1].revision,null,'a missing revision is not borrowed from another item');
  assert.equal(a.optimizations[0].effect,'提供贴题的例子。');
  assert.equal(a.optimizations[1].addition,null);
  assert.equal(a.revisedEssay,'We should acknowledge our limitations.\n\nHonesty can build trust. We can check the facts.\n\nA sincere attitude helps us learn.');
  const oldExplanation=first+'\n\n### ② 主谓一致错误';
  const oldId=interactionId('c',`Trust requires perfection.\nTrust benefits from honesty.\n${oldExplanation}`);
  const notes=reviewNotes(a);assert.equal(notes[0].id,oldId);
  assert(!notes[0].categories.includes('主谓一致'),'next item title must not contaminate classification');
  assert.equal(notes[2].id,interactionId('o','第一段\nFor example, a teacher can check the facts.\n提供贴题的例子。\n\n### ② 增加限定'));
  const saved={...notes[0],title:'已整理',origin:'edited',scope:'unlocated',anchor:null,display:'notes',shortNote:'',emphasis:'none',hidden:false};
  assert.equal(curatedNotes(a,{revision:1,updatedAt:'',history:[],notes:{[oldId]:saved}})[0].title,'已整理');
  // Fallback statistics also retain old category override IDs.
  const oldIssue=interactionId('unused',`Trust requires perfection.\n${oldExplanation}`).split('-')[1];
  assert.equal(a.issues[0].id,oldIssue);
  assert.deepEqual(applyOverrides(a,{[oldIssue]:['不计入问题']}).issues[0].categories,['不计入问题']);
  const untouched=parseReview('## 3. 逐句批改\n【原句】He go.\n【修改与说明】\n修改为：He goes.\n说明：主谓一致。');
  assert.equal(untouched.corrections[0].legacyId,undefined);
  assert.equal(reviewNotes(untouched)[0].id,interactionId('c','He go.\nHe goes.\n主谓一致。'));
  assert.equal(parseReview('## 6. 修改后的完整作文\n\nFirst paragraph.\n\nSecond paragraph.').revisedEssay,'First paragraph.\n\nSecond paragraph.');
 }finally{await rm(dir,{recursive:true,force:true});}
});
