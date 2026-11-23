import {lexer} from 'marked';
import type {SentenceReview} from './translation-review';

export interface AnswerCorrection {start:number;end:number;replacement:string}
type Table={type:string;header?:{text:string}[];rows?:{text:string}[][]};
const text=(value:string)=>value.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/\\([\\|*_`])/g,'$1').replace(/[*_`]/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").trim();
const unquote=(value:string)=>text(value).replace(/^[“「『"]([\s\S]*)[”」』"]$/,'$1').trim();
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ellipsis=/(?:…+|⋯+|\.{3,})/;

// Use the reviewer's explicit verdict, never infer errors from wording differences or scores.
function required(value:string):boolean {
 const lead=text(value).split(/[。；;\n]/,1)[0];
 if(/^(?:不同但正确|正确|等值|可接受|可以接受|主要意思可接受|建议优化|可优化)/.test(lead))return false;
 if(/(?:无需|不需要|不必|不用|不应|不能).{0,8}(?:修改|调整|补足|纠正|错误|漏译)/.test(lead))return false;
 return /需(?:要)?(?:修改|调整|补足|纠正)|不够(?:准确|贴切).{0,12}建议修改|确实错误|词义错误|错译|漏译/.test(lead);
}
function replacementFor(reference:string,reason:string):string {
 const explicit=text(reason).match(/(?:改(?:成|为)|译(?:成|为)|应为|写(?:成|为))\s*[：:]?\s*[“「"]([^”」"\n]+)[”」"]/)||text(reason).match(/[“「"]([^”」"\n]+)[”」"](?:即可|更(?:清楚|准确|贴切))/);
 const value=unquote(explicit?.[1]||reference).split(/[／/]/,1)[0].trim();
 return /^(?:无|未译|漏译|未翻译|省略|—+|-+)$/.test(value)?'':value;
}
function locate(answer:string,before:string,after:string):AnswerCorrection[] {
 if(!before||!after||before===after)return [];
 if(!ellipsis.test(before)){
  const result:AnswerCorrection[]=[];
  for(let at=answer.indexOf(before);at>=0;at=answer.indexOf(before,at+before.length))result.push({start:at,end:at+before.length,replacement:after});
  return result;
 }
 // Legacy tables abbreviate phrases with ellipses. Retain all words hidden by them.
 const original=before.split(ellipsis).filter(Boolean),replacement=after.split(ellipsis).filter(Boolean);
 if(!original.length||!ellipsis.test(after)||replacement.length>original.length)return [];
 const openEnd=ellipsis.test(after.slice(-3));
 if(replacement.length!==original.length&&!openEnd)return [];
 const pattern=new RegExp(original.map(escape).join('([^。！？；\\n]{0,500}?)'),'g'),result:AnswerCorrection[]=[];
 for(const match of answer.matchAll(pattern)){
  let at=match.index!;
  for(let i=0;i<original.length;i++){
   const value=replacement[i];
   if(value&&value!==original[i])result.push({start:at,end:at+original[i].length,replacement:value});
   at+=original[i].length+(match[i+1]?.length||0);
  }
 }
 return result;
}
export function translationAnswerCorrections(answer:string,review:SentenceReview):AnswerCorrection[] {
 const candidates:AnswerCorrection[]=[];
 for(const fragment of review.fragments){
  if(fragment.section!==2||!fragment.table)continue;
  const table=lexer(fragment.markdown).find(block=>block.type==='table') as Table|undefined;
  if(!table?.header||!table.rows)continue;
  const headers=table.header.map(cell=>text(cell.text));
  const mine=headers.findIndex(h=>/^(?:我|你|考生)(?:的)?(?:表达|译文|翻译|答案|作答)/.test(h));
  const reference=headers.findIndex(h=>/^(?:参考|建议|修改后|修正后|正确)(?:答案)?(?:的)?(?:表达|译文|翻译|答案|片段)?$/.test(h));
  const verdict=headers.findIndex(h=>/^(?:判定|结论|差异判定)/.test(h));
  if(mine<0||reference<0||verdict<0)continue;
  for(const row of table.rows){
   if(!required(row[verdict]?.text||''))continue;
   const before=unquote(row[mine]?.text||'');
   const reason=row.filter((_,i)=>i!==mine&&i!==reference).map(cell=>cell.text).join('。');
   const after=replacementFor(row[reference]?.text||'',reason);
   candidates.push(...locate(answer,before,after));
  }
 }
 const unique=candidates.filter((candidate,i)=>candidates.findIndex(other=>other.start===candidate.start&&other.end===candidate.end&&other.replacement===candidate.replacement)===i);
 // Conflicting suggestions at the same place stay in the review; do not invent a resolution.
 const consistent=unique.filter(candidate=>!unique.some(other=>other!==candidate&&other.start===candidate.start&&other.end===candidate.end&&other.replacement!==candidate.replacement));
 const chosen:AnswerCorrection[]=[];
 for(const candidate of consistent.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start))if(!chosen.some(other=>candidate.start<other.end&&candidate.end>other.start))chosen.push(candidate);
 return chosen.sort((a,b)=>a.start-b.start);
}
