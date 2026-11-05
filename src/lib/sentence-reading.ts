import {plain} from './review-analysis';
import {locateQuote,type TextAnchor,type ReviewNote,type StudyEntry} from './review-interactions';
import {wordDiff,type DiffPart} from './revisions';
export type ReadingSection='opening'|'body'|'ending'|'unassigned';
export const READING_LABELS:Record<ReadingSection,string>={opening:'开头',body:'中间',ending:'结尾',unassigned:'待分组'};
export interface ReadingLayout {openingEnd:number;endingStart:number}
export interface ReadingRow extends TextAnchor {id:string;number:number|null;paragraph:number;kind:'sentence'|'format';formatLabel?:string;text:string;section:ReadingSection}
export interface LocatedReviewNote {note:ReviewNote;range:TextAnchor|null;source:string}
export interface SentenceDisplay {row:ReadingRow;notes:LocatedReviewNote[];parts:DiffPart[];inlineNoteIds:string[];needsCheck:boolean}
// Only use sentence comparison when no useful unchanged phrase remains.
// A large edit ratio alone must not hide a stable opening or clause.
export function isSentenceRewrite(parts:DiffPart[]):boolean {
 const words=(value:string)=>(value.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g)||[]).length;
 let kept=0,removed=0,added=0,stablePhrase=false;
 for(const part of parts){const count=words(part.value);if(part.type==='same'){kept+=count;if(count>=3)stablePhrase=true;}else if(part.type==='remove')removed+=count;else added+=count;}
 if(removed+added<6)return false;
 const removal=removed/Math.max(1,kept+removed),addition=added/Math.max(1,kept+added);
 return !stablePhrase&&Math.min(removal,addition)>=0.8;
}
const salutations=/^(?:Dear\s+.+|To whom it may concern)[,，:：]?$/i;
const closings=/^(?:Yours(?:\s+(?:sincerely|faithfully|truly))?|Sincerely(?:\s+yours)?|Best regards|Kind regards|Regards)[,.，]?$/i;
export function sourceParagraphs(text:string):TextAnchor[]{
 const lines=[...text.matchAll(/[^\r\n]+/g)].filter(m=>m[0].trim()).map(m=>({start:m.index!,end:m.index!+m[0].length}));
 const hasBlank=/\S[^\r\n]*\r?\n[\t ]*\r?\n[\t ]*\S/.test(text);
 if(!hasBlank)return lines;
 const result:TextAnchor[]=[];let start=0;for(const sep of text.matchAll(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g)){const end=sep.index!;if(text.slice(start,end).trim())result.push({start,end});start=end+sep[0].length;}if(text.slice(start).trim())result.push({start,end:text.length});
 return result;
}
const abbreviations=new Set(['mr','mrs','ms','dr','prof','sr','jr','st','vs','e.g','i.e','u.s','u.k','a.m','p.m','no','fig','vol']);
function apostrophe(text:string,index:number,start:number,end:number,inSingleQuote:boolean):boolean {
 const previous=text[index-1]||'',next=text[index+1]||'';
 if(/[A-Za-z]/.test(previous)&&/[A-Za-z]/.test(next))return true;
 // Typing/pasting may introduce a space in “China 's” or “don ’t”.
 if(/\s/.test(previous)&&/[A-Za-z]\s+$/.test(text.slice(start,index))&&/^(?:s|t|d|m|re|ve|ll)\b/i.test(text.slice(index+1,end)))return true;
 // A plural possessive has no closing quote; a real closing quote wins.
 return !inSingleQuote&&(/[A-Za-z]/.test(previous)&&!/[A-Za-z]/.test(next)||/s\s+$/i.test(text.slice(start,index))&&/\s/.test(next));
}
function hasClosingQuote(text:string,index:number,end:number,close:string):boolean {
 for(let i=text.indexOf(close,index+1);i>=0&&i<end;i=text.indexOf(close,i+1))if(!/[A-Za-z0-9]/.test(text[i+1]||'')&&(close!=="'"&&close!=='’'||!/[A-Za-z]/.test(text[i-1]||'')||!/[A-Za-z]/.test(text[i+1]||'')))return true;
 return false;
}
function splitParagraph(text:string,start:number,end:number):TextAnchor[]{
 const out:TextAnchor[]=[];let begin=start;const quoteStack:string[]=[];
 function emit(until:number){let a=begin,b=until;while(a<b&&/\s/.test(text[a]))a++;while(b>a&&/\s/.test(text[b-1]))b--;if(a<b)out.push({start:a,end:b});begin=until;}
 for(let i=start;i<end;i++){
  const c=text[i],prev=text[i-1]||'',next=text[i+1]||'';
  if((c==="'"||c==='’'||c==='‘')&&apostrophe(text,i,start,end,quoteStack.at(-1)==="'"||quoteStack.at(-1)==='’'))continue;
  if(c==='“'||c==='‘'){const close=c==='“'?'”':'’';if(hasClosingQuote(text,i,end,close))quoteStack.push(close);continue;}
  if(c==='"'||c==="'"){if(quoteStack.at(-1)===c)quoteStack.pop();else if(hasClosingQuote(text,i,end,c))quoteStack.push(c);}
  else if((c==='”'||c==='’')&&quoteStack.at(-1)===c)quoteStack.pop();
  if(!/[.!?]/.test(c))continue;
  if(c==='.'&&/\d/.test(prev)&&/\d/.test(next))continue;
  if(c==='.'&&next==='.')continue;
  const prefix=text.slice(start,i);const word=prefix.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)$/)?.[1]||'';
  if(c==='.'&&(abbreviations.has(word.toLowerCase())||/^[A-Z]$/.test(word)&&/[A-Z]/.test(text.slice(i+1,end).trimStart()[0]||'')))continue;
  let stop=i+1,stack=[...quoteStack];while(stop<end&&/[.!?"”’')\]]/.test(text[stop])){const q=text[stop];if(stack.at(-1)===q)stack.pop();stop++;}
  // Full stops still end sentences inside a quotation. Quoted exclamations
  // can belong to a surrounding sentence, e.g. He said “Great!” and smiled.
  if(stack.length&&c!=='.')continue;
  const rest=text.slice(stop,end);if(rest&&!/^\s/.test(rest))continue;
  // A quoted clause followed by “and …” remains part of the same sentence.
  if(stop>i+1&&/^[\s]+[a-z]/.test(rest))continue;
  emit(stop);i=stop-1;quoteStack.splice(0,quoteStack.length,...stack);
 }
 emit(end);return out;
}
export function readingRows(text:string,layout?:ReadingLayout):{rows:ReadingRow[];needsGrouping:boolean;layout:ReadingLayout|null}{
 const paragraphs=sourceParagraphs(text),rows:ReadingRow[]=[];let number=0,afterClosing=false;
 paragraphs.forEach((p,index)=>{
  let proseStart:number|null=null;
  function emitProse(end:number){if(proseStart===null)return;for(const range of splitParagraph(text,proseStart,end))rows.push({...range,id:`s-${range.start}-${range.end}`,paragraph:index,kind:'sentence',number:++number,text:text.slice(range.start,range.end),section:'unassigned'});proseStart=null;}
  for(const match of text.slice(p.start,p.end).matchAll(/[^\r\n]+/g)){
   const trimmed=match[0].trim();if(!trimmed)continue;const start=p.start+match.index!+match[0].indexOf(trimmed),end=start+trimmed.length;let formatLabel='';
   if(salutations.test(trimmed))formatLabel='称呼';else if(closings.test(trimmed)){formatLabel='落款';afterClosing=true;}
   else if(afterClosing&&/^[A-Z][A-Za-z'-]*(?: [A-Z][A-Za-z'-]*){0,3}$/.test(trimmed))formatLabel='署名';
   else if(index===0&&/^Notice$/i.test(trimmed))formatLabel='标题';
   else afterClosing=false;
   if(formatLabel){emitProse(start);rows.push({start,end,id:`s-${start}-${end}`,paragraph:index,kind:'format',formatLabel,number:null,text:text.slice(start,end),section:'unassigned'});}
   else if(proseStart===null)proseStart=start;
  }
  emitProse(p.end);
 });
 const prose=rows.filter(r=>r.kind==='sentence'),contentParagraphs=[...new Set(prose.map(r=>r.paragraph))];
 let chosen=layout||null;
 if(!chosen&&contentParagraphs.length>=2){const first=contentParagraphs[0],last=contentParagraphs.at(-1)!;chosen={openingEnd:Math.max(...prose.filter(r=>r.paragraph===first).map(r=>r.end)),endingStart:Math.min(...prose.filter(r=>r.paragraph===last).map(r=>r.start))};}
 if(chosen)for(const r of rows)r.section=r.end<=chosen.openingEnd?'opening':r.start>=chosen.endingStart?'ending':'body';
 return {rows,needsGrouping:!chosen&&prose.length>0,layout:chosen};
}
export function validateReadingLayout(value:unknown,text:string):ReadingLayout {
 if(!value||typeof value!=='object')throw new Error('批阅文章分组格式不正确');const v=value as ReadingLayout,rows=readingRows(text).rows.filter(r=>r.kind==='sentence');
 if(!Number.isSafeInteger(v.openingEnd)||!Number.isSafeInteger(v.endingStart)||v.openingEnd<0||v.endingStart>text.length||v.openingEnd>v.endingStart||!rows.some(r=>r.end===v.openingEnd)||!rows.some(r=>r.start===v.endingStart))throw new Error('批阅分组边界需选择原文句子，且开头应在结尾之前');
 return {openingEnd:v.openingEnd,endingStart:v.endingStart};
}
const canonical=(s:string)=>s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
export function exactSurfaceRange(text:string,quote:string,at:TextAnchor):TextAnchor|null {
 if(canonical(text.slice(at.start,at.end))===canonical(quote))return at;
 const starts=[at.start],ends=[at.end];for(let i=1;i<=8&&at.start-i>=0&&!/[A-Za-z0-9]/.test(text[at.start-i]);i++)starts.push(at.start-i);for(let i=1;i<=8&&at.end+i<=text.length&&!/[A-Za-z0-9]/.test(text[at.end+i-1]);i++)ends.push(at.end+i);
 for(const start of starts)for(const end of ends)if(canonical(text.slice(start,end))===canonical(quote))return {start,end};return null;
}
export function sentenceDisplays(text:string,rows:ReadingRow[],located:LocatedReviewNote[]):SentenceDisplay[]{
 located=located.filter(n=>!n.note.hidden);
 const patches=located.flatMap(n=>{if(n.note.display==='notes'||n.note.kind!=='correction'||!n.note.original||!n.note.replacement||!n.range)return [];const quote=locateQuote(text,n.note.original);const range=quote?exactSurfaceRange(text,n.note.original,quote):null;if(!range||range.start<n.range.start-8||range.end>n.range.end+8)return [];return [{range,note:n.note}];});
 return rows.map(row=>{
  const linked=located.filter(n=>n.note.kind!=='task'&&n.range&&n.range.start<row.end&&n.range.end>row.start);
  const local=patches.filter(p=>p.range.start>=row.start&&p.range.end<=row.end&&linked.some(n=>n.note.id===p.note.id));
  const safe=local.filter(p=>!patches.some(q=>q!==p&&q.range.start<p.range.end&&q.range.end>p.range.start)).sort((a,b)=>a.range.start-b.range.start);
  const parts:DiffPart[]=[];let position=row.start;for(const p of safe){if(p.range.start>position)parts.push({value:text.slice(position,p.range.start),type:'same'});parts.push(...wordDiff(text.slice(p.range.start,p.range.end),plain(p.note.replacement!)));position=p.range.end;}if(position<row.end)parts.push({value:text.slice(position,row.end),type:'same'});
  return {row,notes:linked,parts,inlineNoteIds:safe.map(p=>p.note.id),needsCheck:linked.some(n=>n.note.kind==='correction'&&n.note.display!=='notes'&&!safe.some(p=>p.note.id===n.note.id))};
 });
}
