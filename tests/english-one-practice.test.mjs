import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-grading-'));
try{
 await build({entryPoints:['src/lib/folio.ts','src/lib/clipboard.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});
 const f=await import(join(dir,'folio.js')),{makePacket,copyPacket}=await import(join(dir,'clipboard.js'));
 const qs=JSON.parse(await readFile('src/data/questions.json','utf8')),snapshot=JSON.stringify(qs),two=qs.filter(q=>q.exam==='two');
 assert.equal(two.length,18);
 assert.equal(f.DEFAULT_RUBRICS.englishTwoLarge,f.DEFAULT_RUBRICS.large);
 assert.equal(f.DEFAULT_TEMPLATES.englishTwoLarge,f.DEFAULT_TEMPLATES.large);
 const stored={large:'My current English-one rubric',small:'Small rubric',englishTwoLarge:'Legacy 15-point rubric'};
 assert.equal(f.sharedReviewSettings(f.DEFAULT_RUBRICS,stored).englishTwoLarge,stored.large);
 assert.equal(f.sharedReviewSettings(f.DEFAULT_TEMPLATES,{englishTwoLarge:'Legacy 150-word prompt'}).englishTwoLarge,f.DEFAULT_TEMPLATES.large);
 const essay='This essay text must remain exactly unchanged.';
 for(const q of two){
  const p=f.practiceQuestion(q);
  assert.equal(p.exam,'two');assert.equal(p.id,q.id);assert.equal(p.originalDirections,q.directions);assert.equal(p.gradingStandard,'english-one');
  assert.equal(f.wordTarget(p),'160–200 词');assert.equal(f.scoreTarget(p),'20 分 · 160–200 词');
  assert(p.directions.includes('160–200 words'));assert(p.directions.includes('(20 points)'));assert(!/150\s+words|15\s*points/i.test(p.directions));
  assert.deepEqual(p.images,q.images);assert.deepEqual(f.practiceQuestion(p),p);
  // Every task and material character is preserved outside the two adapted requirements.
  assert.equal(p.directions,q.directions.replace(/(?:about|at least|no less than)\s+150\s+words/gi,'160–200 words').replace(/\b15\s*points\b/gi,'20 points'));
  const packet=f.reviewPackage(q,essay,f.DEFAULT_TEMPLATES.large);
  assert(packet.includes(f.DEFAULT_RUBRICS.large));assert(packet.includes(p.directions));assert(packet.includes(f.ENGLISH_TWO_PRACTICE_NOTE));assert(packet.includes(essay));
  assert(!packet.includes('13–15分：任务完成充分'));
  if(q.topicCategories?.includes('材料类')){assert(packet.includes('无需描述图画或图表'));assert(packet.includes('Support your argument with reasons and relevant examples.'));assert(packet.includes('Studies in the U.S. and the U.K.'));}
 }
 assert.equal(JSON.stringify(qs),snapshot);
 for(const q of qs.filter(q=>q.exam!=='two'))assert.equal(f.practiceQuestion(q),q);
 assert.equal(f.scoreTarget(qs.find(q=>q.type==='small')),'10 分 · 约 100 词');
 // Canvas packet and plain clipboard must use the same adapted task and rubric.
 const drawn=[];const prior={document:globalThis.document,Image:globalThis.Image,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 let copied='';
 try{
  globalThis.Image=class{width=400;height=200;decode(){return Promise.resolve()}};
  globalThis.document={createElement:()=>({getContext:()=>({measureText:()=>({width:0}),scale(){},fillRect(){},drawImage(){},fillText:t=>drawn.push(t)}),toBlob:callback=>callback(new Blob(['canvas']))})};
  const q=two[0];await makePacket(q,essay,f.DEFAULT_TEMPLATES.large);
  const rendered=drawn.join('\n');assert(rendered.includes(f.ENGLISH_TWO_PRACTICE_NOTE));assert(rendered.includes(f.practiceQuestion(q).directions));assert(!rendered.includes('(15 points)'));assert(rendered.includes('1.17-20分'));
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async s=>{copied=s}}}});
  const material=two.find(q=>q.topicCategories?.includes('材料类'));await copyPacket(material,essay,f.DEFAULT_TEMPLATES.large);
  assert.equal(copied,f.reviewPackage(material,essay,f.DEFAULT_TEMPLATES.large));
 }finally{globalThis.document=prior.document;globalThis.Image=prior.Image;if(prior.navigator)Object.defineProperty(globalThis,'navigator',prior.navigator);else delete globalThis.navigator;}
 console.log('PASS all 18 English-two tasks: shared rubric and prompt, legacy settings, adapted directions, chart/material packets, exact source preservation and clipboard.');
}finally{await rm(dir,{recursive:true,force:true});}
