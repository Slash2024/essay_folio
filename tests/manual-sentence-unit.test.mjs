import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('2019 picture dialogue is one manually configured reading unit without changing source or note ranges',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-manual-sentence-'));
 try{
  await build({entryPoints:['src/lib/sentence-reading.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'reading.mjs')});
  const {readingRows,sentenceDisplays}=await import(join(dir,'reading.mjs'));
  const [{text:paragraph}]=JSON.parse(await readFile('src/data/manual-sentence-units.json','utf8'));
  const source=paragraph+'\n\nPerseverance matters. Keep trying.\n\nNever give up.';
  const {rows}=readingRows(source);
  assert.deepEqual(rows.map(r=>r.text),[paragraph,'Perseverance matters.','Keep trying.','Never give up.']);
  assert.deepEqual(rows.map(r=>r.number),[1,2,3,4]);
  assert.deepEqual(rows.map(r=>r.section),['opening','body','body','ending']);
  for(const row of rows)assert.equal(source.slice(row.start,row.end),row.text);
  const quote="I don't want to climb anymore.",start=source.indexOf(quote);
  const note={id:'dialogue-note',kind:'correction',title:'对话',original:quote,replacement:'I want to stop climbing.',explanation:'原有说明',categories:[]};
  const display=sentenceDisplays(source,rows,[{note,range:{start,end:start+quote.length},source:'quote'}]);
  assert.equal(display[0].notes[0].note,note);
  assert.deepEqual(display.slice(1).flatMap(d=>d.notes),[]);
  assert.deepEqual(readingRows('He said "First sentence. Second sentence." Another sentence.').rows.map(r=>r.text),['He said "First sentence.','Second sentence."','Another sentence.']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
