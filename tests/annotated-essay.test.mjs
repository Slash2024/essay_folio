import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(join(tmpdir(),'folio-full-essay-'));
try{
 await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
 await build({
  entryPoints:['src/components/folio/AnnotatedEssay.tsx','src/lib/review-analysis.ts','src/lib/essay-comparison.ts'],
  bundle:true,platform:'node',format:'cjs',outdir:dir,jsx:'automatic',packages:'external',loader:{'.css':'empty'}
 });
 const require=createRequire(import.meta.url);
 const AnnotatedEssay=require(join(dir,'components/folio/AnnotatedEssay.js')).default;
 const {parseReview}=require(join(dir,'lib/review-analysis.js'));
 const {fullEssayInput,essayComparisonParts,FULL_ESSAY_ALIGNMENT_ID}=require(join(dir,'lib/essay-comparison.js'));
 const original='People pay more attention to their health.\n\nEveryone benefits.';
 const revised='People attach greater importance to their health.\n\nEveryone benefits.';
 const markdown='3. 逐句批改\n【原句】：'+original.split('\n')[0]+'\n【修改与说明】\n修改为：People care about health.\n说明：措辞。\n6. 修改后的完整作文\n'+revised;
 const analysis=parseReview(markdown);
 assert.equal(analysis.revisedEssay,revised);
 const review={id:'review',markdown,curation:{revision:1,notes:{}}};
 const pair=fullEssayInput(original,analysis);
 assert.equal(pair.revised,revised);
 const render=()=>renderToStaticMarkup(createElement(AnnotatedEssay,{original,analysis,review,onChange:()=>{}}));
 let html=render();
 assert(html.includes('attach greater importance to'));
 assert(!html.includes('People care about health.'));
 assert(html.includes('LLM 优化标注'));
 assert(!html.includes('已采纳 LLM 分组'));
 const version={id:'v1',createdAt:'2026-11-09T00:00:00Z',model:'test-model',...pair,segments:[
  {type:'keep',before:'People ',after:'People '},
  {type:'replace',before:'pay more attention to',after:'attach greater importance to'},
  {type:'keep',before:' their health.\n\nEveryone benefits.',after:' their health.\n\nEveryone benefits.'}
 ]};
 review.alignments={revision:1,entries:{
  unrelated:{current:'v1',versions:[version],events:[],undo:[null]},
  [FULL_ESSAY_ALIGNMENT_ID]:{current:'v1',versions:[version],events:[],undo:[null]}
 }};
 html=render();
 assert(html.includes('<del><span class="">pay more attention to</span></del><ins>attach greater importance to</ins>'));
 assert(html.includes('已采纳 LLM 分组'));
 assert(html.includes('撤销上次调整'));
 assert(html.includes('恢复规则展示'));
 const parts=essayComparisonParts(original,revised,review.alignments);
 assert(parts.every(p=>p.locked));
 assert.equal(parts.filter(p=>p.type!=='add').map(p=>p.value).join(''),original);
 assert.equal(parts.filter(p=>p.type!=='remove').map(p=>p.value).join(''),revised);
 assert(!essayComparisonParts(original,revised+' Changed.',review.alignments).some(p=>p.locked));
 assert(!fullEssayInput(original,{...analysis,revisedEssay:null}));
 assert(!fullEssayInput(original,{...analysis,revisedEssay:original}));
 assert(!fullEssayInput('a'.repeat(6001),analysis));
 const missing=renderToStaticMarkup(createElement(AnnotatedEssay,{original,analysis:{...analysis,revisedEssay:null},review,onChange:()=>{}}));
 assert(missing.includes('缺少批阅对应原文或第六部分'));
 assert(!missing.includes('LLM 优化标注'));
 assert.equal(review.markdown,markdown);
 console.log('PASS full comparison: section-six source, phrase groups, isolated accepted alignment, exact reconstruction, stale invalidation, missing/unchanged/length limits and preview-only controls.');
}finally{
 await rm(dir,{recursive:true,force:true});
}
