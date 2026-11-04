import {build} from 'esbuild';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const dir=await mkdtemp(join(tmpdir(),'folio-punctuation-'));
try{
 await build({entryPoints:['src/lib/punctuation-check.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});const {checkPunctuation,applyPunctuationSuggestions}=await import(join(dir,'punctuation-check.js'));
 const fix=s=>{const c=checkPunctuation(s);return applyPunctuationSuggestions(c,new Set(c.suggestions.map(x=>x.id)));};
 assert.equal(fix('Hello，world。Next；yes：indeed！Really？（ example ）'), 'Hello, world. Next; yes: indeed! Really? (example)');
 assert.equal(fix('He said“ hello ”.Next'), 'He said "hello". Next');
 assert.equal(fix("China 's culture matters , and don ' t change words."),"China's culture matters, and don't change words.");
 assert.equal(fix('China ’s culture. It ’ s great.'),"China's culture. It's great.");
 assert.equal(fix('many  families\tvalue\u3000culture'), 'many families value culture');
 assert.equal(fix('  First , sentence.\r\n\r\n\tSecond  paragraph.  \r\nYours,\r\nLi Ming'), '  First, sentence.\r\n\r\n\tSecond paragraph.\r\nYours,\r\nLi Ming');
 const protectedText='Dr. Smith arrived at 9:30 a.m. The rate rose from 75.2 to 145.9, e.g. in the U.S. See https://example.com/a?q=one,two or me.name+tag@example.com. It costs 1,000.50.';
 assert.equal(fix(protectedText),protectedText);
 assert.equal(fix('Dr.Smith used e.g.examples at 9:30.'),'Dr. Smith used e.g. examples at 9:30.');
 assert.equal(fix('The rate is 75．2％。Next sentence。'),'The rate is 75.2%. Next sentence.');
 assert.equal(fix('The rate is 75．2％and the total is 1，000。'),'The rate is 75.2% and the total is 1,000.');
 assert.equal(fix('Parks serves people ,no speling changes!'), 'Parks serves people, no speling changes!');
 assert.equal(fix('ＡＢＣ １２３，parks serves people。'), 'ＡＢＣ １２３, parks serves people.');
 const special='Words、words……more——more；Wait!!next';assert.equal(fix(special),'Words、words……more——more; Wait!! next');assert(checkPunctuation(special).warnings.length>=3);
 for(const malformed of ['An "unclosed quote，next。',"A 'mystery , phrase.",'An (unclosed bracket.']){const result=fix(malformed);assert.equal((result.match(/[()"']/g)||[]).join(''),(malformed.match(/[()"']/g)||[]).join(''),'never add/remove unmatched punctuation');}
 const source='First ，word。Next  line！',check=checkPunctuation(source);assert.equal(check.source,source);assert.equal(applyPunctuationSuggestions(check,new Set()),source);for(const selected of check.suggestions){assert.equal(source.slice(selected.start,selected.end),selected.before);assert.equal(applyPunctuationSuggestions(check,new Set([selected.id])),source.slice(0,selected.start)+selected.after+source.slice(selected.end));}
 for(const input of [source,protectedText,'China ’s   culture matters ,yes。','He said“ hello ”.Next','  One\n\n\tTwo  words.']){const result=fix(input);assert.equal(fix(result),result,'all applied fixes are idempotent');assert.equal(result.replace(/\s/g,''),input.replace(/[，。．；：！？（）“”‘’％]/g,c=>({'，':',','。':'.','．':'.','；':';','：':':','！':'!','？':'?','（':'(','）':')','“':'"','”':'"','‘':"'",'’':"'",'％':'%'}[c])).replace(/\s/g,''),'only allowed punctuation conversions and whitespace change');}
 assert.equal(checkPunctuation('Correct punctuation, spacing and wording.').suggestions.length,0);
 const newline=checkPunctuation('First.\nNext，word');assert.equal(newline.suggestions[0].line,2);
 console.log('PASS punctuation-only checks: explicit width mapping, independent selections, exact previews, original preservation, possessives, quotes, repeated punctuation, paragraph/indent retention, protected numeric/time/abbreviation/URL/email text, idempotence and no word/type edits');
}finally{await rm(dir,{recursive:true,force:true});}
