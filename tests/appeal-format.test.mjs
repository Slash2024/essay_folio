import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'folio-appeal-format-'));
try{
 await build({entryPoints:['src/lib/appeal-format.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'format.mjs')});
 const {formatAppealText:format}=await import(join(dir,'format.mjs'));
 const sample='competions 应改为 competitions；call on people 搭配和语义都成立，应保留，不必改成 invite others。主要错误是 take part in 缺宾语，补 them/these events 即可，或直接写 take part。';
 const output=format(sample);
 assert.equal((output.match(/^- /gm)||[]).length,3);
 for(const phrase of ['competions','competitions','call on people','invite others','take part in','them/these events'])assert(output.includes('**'+phrase+'**'),phrase);
 const visible=s=>s.replace(/^- /gm,'').replaceAll('**','').replace(/\s/g,'');
 assert.equal(visible(output),visible(sample),'formatting must preserve every word, qualification and punctuation mark');
 const protectedText='可写“call on people；不要替换”。缩写 Nov. 11 和数值 3.7 均保留。补充（例如 A；B），仍属可选。';
 assert.equal((format(protectedText).match(/^- /gm)||[]).length,3,'quoted text, parentheses, abbreviations and decimals are not split internally');
 const markdown='- **call on people** 可以保留。\n- `take part in` 缺宾语。\n';
 assert.equal(format(markdown),markdown,'existing Markdown lists and emphasis remain intact');
 const structured='### 说明\n\n> 保留引文；不要拆分。\n\n```text\ncall on people; invite others\n```\n';
 assert.equal(format(structured),structured);
 assert(format('**call on people** 可以保留。').includes('**call on people**'));
 assert(!format('**call on people** 可以保留。').includes('****'));
 assert(format('参见 [说明](https://example.com/a;b)；原句不变。').includes('[说明](https://example.com/a;b)'));
 assert.equal(format(''), '');
 console.log('PASS appeal text formatting: sentence/list rendering, English emphasis, unchanged content and protected Markdown/quotes/abbreviations.');
}finally{await rm(dir,{recursive:true,force:true});}
