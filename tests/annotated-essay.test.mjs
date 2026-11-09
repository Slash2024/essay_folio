import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(join(tmpdir(),'folio-annotated-essay-'));
try{
 await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
 await build({
  entryPoints:['src/components/folio/AnnotatedEssay.tsx','src/components/folio/ReadingSentenceText.tsx','src/lib/review-analysis.ts','src/lib/review-curation.ts','src/lib/sentence-reading.ts'],
  bundle:true,platform:'node',format:'cjs',outdir:dir,jsx:'automatic',packages:'external',loader:{'.css':'empty'}
 });
 const require=createRequire(import.meta.url);
 const AnnotatedEssay=require(join(dir,'components/folio/AnnotatedEssay.js')).default;
 const ReadingSentenceText=require(join(dir,'components/folio/ReadingSentenceText.js')).default;
 const {parseReview}=require(join(dir,'lib/review-analysis.js'));
 const {curatedNotes}=require(join(dir,'lib/review-curation.js'));
 const {readingRows,locateReviewNotes,sentenceDisplays}=require(join(dir,'lib/sentence-reading.js'));
 const sentence='People pay more attention to their health.';
 const revised='People attach greater importance to their health.';
 const original='A healthy lifestyle matters.\n\n'+sentence+'\n\nEveryone benefits.';
 const analysis=parseReview('3. 逐句批改\n【原句】：'+sentence+'\n【修改与说明】\n修改为：'+revised+'\n说明：固定搭配。');
 const review={id:'review',markdown:'retained original'};
 const note=curatedNotes(analysis)[0];
 const render=()=>renderToStaticMarkup(createElement(AnnotatedEssay,{original,analysis,review}));
 function assertSynchronized(){
  const notes=curatedNotes(analysis,review.curation);
  const located=locateReviewNotes(original,notes,review.study);
  const displays=sentenceDisplays(original,readingRows(original,review.study?.layout).rows,located,review.alignments);
  const full=render();
  for(const display of displays){
   const expected=renderToStaticMarkup(createElement(ReadingSentenceText,{display}));
   assert(full.includes(expected),'full comparison must include the exact per-sentence annotation markup');
  }
  assert(full.includes('\n\n'),'preserve paragraph boundaries');
  assert.equal(review.markdown,'retained original');
  return full;
 }
 assertSynchronized();
 const version={id:'v1',original:sentence,revised,display:'auto',segments:[
  {type:'keep',before:'People ',after:'People '},
  {type:'replace',before:'pay more attention to',after:'attach greater importance to'},
  {type:'keep',before:' their health.',after:' their health.'}
 ]};
 review.alignments={revision:1,entries:{[note.id]:{current:'v1',versions:[version],events:[],undo:[]}}};
 let full=assertSynchronized();
 assert(full.includes('<del><span class="">pay more attention to</span></del><ins>attach greater importance to</ins>'));
 const start=original.indexOf(sentence);
 review.curation={revision:1,notes:{[note.id]:{
  ...note,origin:'edited',scope:'range',anchor:{start,end:start+sentence.length},
  display:'sentence',shortNote:'记住这个搭配',emphasis:'highlight',hidden:false
 }}};
 full=assertSynchronized();
 assert(full.includes('sentence-rewrite'));
 assert(full.includes('记住这个搭配'));
 assert(full.includes('curation-mark-highlight'));
 review.curation.notes[note.id].display='notes';
 assert(!assertSynchronized().includes('<del>'));
 review.curation.notes[note.id].hidden=true;
 full=assertSynchronized();
 assert(!full.includes('记住这个搭配'));
 assert(!full.includes('<del>'));
 console.log('PASS shared essay rendering: identical annotation markup, accepted LLM phrase groups, manual sentence mode, emphasis, notes-only and hidden suggestions, source paragraphs preserved.');
}finally{
 await rm(dir,{recursive:true,force:true});
}
