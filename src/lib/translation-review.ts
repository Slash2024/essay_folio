import {lexer} from 'marked';
import type {TranslationQuestion} from './translation';

export const SENTENCE_REVIEW_TITLES=['本题补充评价','本题得分与批阅','与参考答案的差异判定','语法理解与纠正','词汇与中文表达','完善后的完整译文'];
export interface ReviewFragment {
 id:string;start:number;end:number;section:number;numbers:number[];markdown:string;source:string;
 table?:{key:number;header:string;columns:number};
}
export interface SentenceReview {number:number;score:number|null;fragments:ReviewFragment[];groups:{section:number;title:string;markdown:string}[]}
export interface TranslationReview {total:number|null;summary:string;global:ReviewFragment[];sentences:SentenceReview[];fragments:ReviewFragment[]}
type Block={type:string;raw:string;text?:string;depth?:number;header?:{text:string}[];rows?:{text:string}[][];items?:{raw:string}[]};
const plain=(s:string)=>s.replace(/[*_`]/g,'').replace(/<[^>]*>/g,'').trim();
const normalized=(s:string)=>plain(s).toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const explicitNumber=(s:string)=>{const m=plain(s).replace(/^#{1,6}\s+/,'').match(/^(?:第\s*)?(4[6-9]|50)\s*(?:题|[.．、:：)）]|$)/);return m?Number(m[1]):null;};
function sectionNumber(title:string):number|null {
 const t=plain(title).replace(/^[一二三四五六七八九十\d]+[、.．:：]\s*/,'');
 if(t.length>80)return null;
 if(/差异|与参考答案|不一致/.test(t))return 2;
 if(/总分|总评|整体评价|评分与整体|^全篇(?:补充)?说明/.test(t))return 0;
 if(/逐句|采分点|评分与给分依据/.test(t))return 1;
 if(/语法|句法/.test(t))return 3;
 if(/词汇|中文表达|用词/.test(t))return 4;
 if(/完整译文|完整修订|完善后的/.test(t))return 5;
 return null;
}
const numberPattern='(?:10(?:\\.0)?|[0-9](?:\\.[05])?)';
export function extractTranslationTotal(markdown:string):number|null {
 const text=plain(markdown).replaceAll('／','/');
 const match=text.match(new RegExp('(?:本次(?:得分|总分)|总分|整体得分)\\s*[：:]?\\s*('+numberPattern+')\\s*(?:分\\s*/\\s*10|/\\s*10|分(?!\\s*/))'))
  ||text.match(new RegExp('(?:预估分数|得分|评分)\\s*[：:]?\\s*('+numberPattern+')\\s*(?:分\\s*)?/\\s*10'))
  ||text.match(new RegExp('\\|\\s*(?:合计|总计)\\s*\\|\\s*('+numberPattern+')\\s*/\\s*10'));
 if(!match)return null;const value=Number(match[1]);return value>=0&&value<=10?value:null;
}
function sentenceScore(markdown:string):number|null {
 const text=plain(markdown).replaceAll('／','/');
 const m=text.match(/(?:得分\s*[：:]?\s*|\|\s*)(2(?:\.0)?|[01](?:\.[05])?)\s*\/\s*2(?:分)?/);
 return m?Number(m[1]):null;
}
function matchTerm(term:string,source:string):boolean {
 const t=normalized(term);if(t.length<2)return false;
 const s=normalized(source);
 if(/[a-z]/.test(t)){
  const escaped=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?:^|[^a-z0-9])'+escaped+'(?:$|[^a-z0-9])','i').test(s);
 }
 return s.includes(t);
}
function termOwners(cells:{text:string}[],q:TranslationQuestion,answers:string[]):number[] {
 const english=q.sentences.filter(s=>matchTerm(cells[0]?.text||'',s.text)).map(s=>s.number);
 if(!english.length)return [];
 const mine=q.sentences.filter((s,i)=>matchTerm(cells[1]?.text||'',answers[i]||'')).map(s=>s.number);
 const exact=english.filter(n=>mine.includes(n));
 return exact.length?exact:english;
}
// Keep original UTF-16 offsets, including CRLF. The Markdown lexer works on normalized newlines.
function normalizedSource(source:string){
 let text='';const positions:number[]=[];
 for(let i=0;i<source.length;i++){positions.push(i);if(source[i]==='\r'){text+='\n';if(source[i+1]==='\n')i++;}else text+=source[i];}
 positions.push(source.length);return {text,positions};
}
export function renderReviewFragments(fragments:ReviewFragment[]):string {
 const output:string[]=[];let previous:ReviewFragment|undefined;
 for(const f of fragments){
  if(f.table&&previous?.table?.key===f.table.key){output[output.length-1]=output[output.length-1].trimEnd()+'\n'+f.source.trimEnd();}
  else output.push(f.markdown.trim());
  previous=f;
 }
 return output.filter(Boolean).join('\n\n');
}
export function parseTranslationReview(source:string,q:TranslationQuestion,answers:string[]=[]):TranslationReview {
 const {text,positions}=normalizedSource(source),fragments:ReviewFragment[]=[];
 let cursor=0,section=0,current:number|null=null;
 function add(start:number,end:number,numbers:number[],kind=section,table?:ReviewFragment['table']){
  const raw=text.slice(start,end);if(!raw.trim()||/^\s*(?:---+|\*\*\*+)\s*$/.test(raw))return;
  const a=positions[start],b=positions[end],original=source.slice(a,b);
  fragments.push({id:`trf-${a}-${b}`,start:a,end:b,section:kind,numbers:[...new Set(numbers)],source:original,markdown:table?table.header.trimEnd()+'\n'+raw.trimEnd():original,...(table?{table}:{})});
 }
 function owners(raw:string):number[]{
  if(current!==null)return [current];
  return [...new Set([...plain(raw).matchAll(/(?:第\s*(4[6-9]|50)\s*题|(4[6-9]|50)\s*题)/g)].map(m=>Number(m[1]||m[2])))];
 }
 for(const block of lexer(text) as unknown as Block[]){
  const start=text.indexOf(block.raw,cursor);if(start<0)continue;
  if(start>cursor)add(cursor,start,owners(text.slice(cursor,start)));
  const end=start+block.raw.length;cursor=end;
  if(block.type==='space'||block.type==='hr')continue;
  const heading=block.type==='heading'||(block.type==='paragraph'&&/^\s*\*\*[^\n]+\*\*\s*$/.test(block.raw));
  const prefix=block.type==='heading'||block.type==='paragraph'?explicitNumber(block.text||block.raw):null;
  if(prefix!==null){current=prefix;add(start,end,[current]);continue;}
  if(heading&&(block.type!=='heading'||(block.depth??0)<=2)){
   const next=sectionNumber(block.text||block.raw);
   if(next!==null){
    const numbered=/^(?:[一二三四五六七八九十\d]+[、.．:：]|新增部分)/.test(plain(block.text||block.raw));
    if(block.type==='paragraph'&&current!==null&&next===section&&!numbered){add(start,end,[current]);continue;}
    section=next;current=null;continue;
   }
   if(block.type==='heading'){current=null;section=0;}
  }
  if(/^以后批阅(?:时|中)?[，,]/.test(plain(block.raw))){current=null;section=0;}
  if(block.type==='table'&&block.header&&block.rows){
   const lines=block.raw.split('\n'),header=lines.slice(0,2).join('\n')+'\n';
   const numberColumn=block.header.findIndex(cell=>/^(?:题号|题目|句号|句子编号)$/.test(plain(cell.text)));
   const vocabulary=section===4||/原文|词汇|词语/.test(plain(block.header[0]?.text||''));
   let offset=start+header.length,lastNumber:number|null=current;
   for(let i=0;i<block.rows.length;i++){
    const cells=block.rows[i],line=lines[i+2]||'',rowEnd=offset+line.length+(i+2<lines.length-1?1:0);
    let numbers:number[]=[];
    if(numberColumn>=0){
     const value=plain(cells[numberColumn]?.text||'');const n=explicitNumber(value);
     if(n!==null)lastNumber=n;else if(value)lastNumber=null;
     if(lastNumber!==null)numbers=[lastNumber];
    }else if(current!==null)numbers=[current];
    else if(vocabulary)numbers=termOwners(cells,q,answers);
    else {const n=explicitNumber(cells[0]?.text||'');if(n!==null)numbers=[n];}
    add(offset,rowEnd,numbers,section,{key:start,header,columns:block.header.length});offset=rowEnd;
   }
   if(offset<end)add(offset,end,owners(text.slice(offset,end)));
   continue;
  }
  if(block.type==='list'&&current===null&&block.items){
   let offset=start;
   for(const item of block.items){const index=text.indexOf(item.raw,offset);if(index<0||index>=end)continue;if(index>offset)add(offset,index,[]);const number=explicitNumber(item.raw);add(index,index+item.raw.length,number===null?owners(item.raw):[number]);offset=index+item.raw.length;}
   if(offset<end)add(offset,end,[]);continue;
  }
  add(start,end,owners(block.raw));
 }
 if(cursor<text.length)add(cursor,text.length,owners(text.slice(cursor)));
 const global=fragments.filter(f=>!f.numbers.length);
 const summary=global.find(f=>f.section===0&&!f.table&&!/^(?:\*\*)?(?:本次得分|总分)/.test(f.source.trim()))?.markdown||'';
 return {total:extractTranslationTotal(source),summary,global,fragments,sentences:q.sentences.map(s=>{
  const selected=fragments.filter(f=>f.numbers.includes(s.number));
  const groups=SENTENCE_REVIEW_TITLES.map((title,i)=>({section:i,title,markdown:renderReviewFragments(selected.filter(f=>f.section===i))})).filter(g=>g.markdown);
  return {number:s.number,score:sentenceScore(renderReviewFragments(selected.filter(f=>f.section===1||f.section===0))),fragments:selected,groups};
 })};
}
export interface SentenceReviewChange {id:string;markdown:string}
export function applySentenceReviewChanges(source:string,review:TranslationReview,number:number,changes:SentenceReviewChange[],question:TranslationQuestion,answers:string[]):string {
 if(!changes.length||changes.length>100)throw new Error('没有有效的本题修改内容。');
 const ids=new Set<string>(),patches:{start:number;end:number;value:string}[]=[];
 for(const change of changes){
  if(!change||typeof change.id!=='string'||typeof change.markdown!=='string'||!change.markdown.trim()||change.markdown.length>25000||ids.has(change.id))throw new Error('本题修改内容不符合格式。');
  ids.add(change.id);const fragment=review.fragments.find(f=>f.id===change.id);
  if(!fragment||fragment.numbers.length!==1||fragment.numbers[0]!==number)throw new Error('申诉修改涉及其他题目或全篇内容，未采纳。');
  if(source.slice(fragment.start,fragment.end)!==fragment.source)throw new Error('批阅原文已变化，请重新提出申诉。');
  const replacement=change.markdown.trim();
  if(explicitNumber(fragment.source)!==null&&explicitNumber(replacement)!==number)throw new Error('本题标题或译文的题号须保留，未采纳。');
  if(/^\s*#{1,2}\s/m.test(replacement))throw new Error('本题修改包含其他章节标题，未采纳。');
  const numbers=[...replacement.matchAll(/(?:第\s*(4[6-9]|50)\s*题|(?:^|\n)\s*(?:\*\*)?(4[6-9]|50)\s*(?:题|[.．、:：]))/g)].map(m=>Number(m[1]||m[2]));
  if(numbers.some(n=>n!==number))throw new Error('申诉修改包含其他题号，未采纳。');
  if(fragment.table){
   const tokens=lexer(fragment.table.header+replacement+'\n').filter(t=>t.type!=='space') as unknown as Block[];
   if(tokens.length!==1||tokens[0].type!=='table'||tokens[0].rows?.length!==1||tokens[0].header?.length!==fragment.table.columns||!replacement.startsWith('|')||replacement.includes('\n'))throw new Error('表格修改须保持原表格的一行及列数，未采纳。');
   const originalFirst=plain(fragment.source.split('|')[1]||''),newFirst=plain(replacement.split('|')[1]||'');
   if(originalFirst!==newFirst)throw new Error('表格的题号或原文词语不能改写，未采纳。');
  }
  const beforeScore=sentenceScore(fragment.markdown),afterScore=sentenceScore(fragment.table?fragment.table.header+replacement:replacement);
  if(beforeScore!==afterScore)throw new Error('申诉修改改变了本题分数，请先核对评分，未采纳。');
  const suffix=fragment.source.match(/\s*$/)?.[0]||'';
  patches.push({start:fragment.start,end:fragment.end,value:replacement+suffix});
 }
 let output=source;for(const patch of patches.sort((a,b)=>b.start-a.start))output=output.slice(0,patch.start)+patch.value+output.slice(patch.end);
 const after=parseTranslationReview(output,question,answers);
 if(after.total!==review.total||renderReviewFragments(after.global)!==renderReviewFragments(review.global))throw new Error('申诉修改影响了全篇评分或说明，未采纳。');
 for(const other of review.sentences.filter(s=>s.number!==number)){
  if(renderReviewFragments(other.fragments)!==renderReviewFragments(after.sentences.find(s=>s.number===other.number)!.fragments))throw new Error('申诉修改影响了其他题目的内容归属，未采纳。');
 }
 if(!after.sentences.find(s=>s.number===number)?.fragments.length)throw new Error('本题修改后的内容未能可靠识别，未采纳。');
 return output;
}
