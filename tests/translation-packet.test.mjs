import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';

const dir=await mkdtemp(join(tmpdir(),'folio-translation-packet-'));
await build({stdin:{contents:"export {translationPacket,translationQuestions,REVIEW_PROMPT} from './src/lib/translation';export {packetImage,exportTranslation} from './src/lib/translation-client';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'packet.mjs')});
const {translationPacket,translationQuestions,REVIEW_PROMPT,packetImage,exportTranslation}=await import(join(dir,'packet.mjs'));
after(()=>rm(dir,{recursive:true,force:true}));

test('existing packet snapshots cannot override the current prompt in exported text or the generated image',async()=>{
 const q=translationQuestions[0],p={id:'tr-test',questionId:q.id,revision:4,status:'reviewed',createdAt:'2026-01-01',updatedAt:'2026-01-01',answers:['第一句原作答','第二句原作答','第三句原作答','第四句原作答','第五句原作答'],referenceText:'用户指定参考答案',references:[],packet:'OLD_STORED_PROMPT',review:{original:'原始批阅',markdown:'当前批阅',filename:'review.md',importedAt:'2026-01-01'}};
 const before=JSON.stringify(p),expected=translationPacket(q,p);
 assert(REVIEW_PROMPT.startsWith('现在开始正式的批阅：假设你现在是全国研究生考试英语一阅卷组的一名老师'));
 assert(REVIEW_PROMPT.includes('无0.25扣分'));
 assert(REVIEW_PROMPT.includes('例5达尔文失去这些读写听的能力'));
 assert(expected.includes(REVIEW_PROMPT));assert(!expected.includes(p.packet));
 const blob=await exportTranslation(q,p),zip=await JSZip.loadAsync(await blob.arrayBuffer());
 assert.equal(await zip.file('送审材料.md').async('string'),expected);
 assert.equal(await zip.file('练习记录.json').async('string'),JSON.stringify(p,null,2));
 assert.equal(await zip.file('原始批阅.md').async('string'),p.review.original);
 assert.equal(await zip.file('当前批阅.md').async('string'),p.review.markdown);
 const previous=globalThis.document,drawn=[];
 globalThis.document={createElement(){return {getContext(){return {measureText(value){return {width:value.length*14};},fillText(value){drawn.push(value);},fillRect(){},scale(){}};},toBlob(callback){callback(new Blob(['synthetic-image'],{type:'image/png'}));}};}};
 try{assert.equal((await packetImage(q,p)).type,'image/png');}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
 assert(drawn.join('').includes(REVIEW_PROMPT.split('\n').filter(Boolean).join('')));
 assert(!drawn.join('').includes(p.packet));assert.equal(JSON.stringify(p),before);
});
