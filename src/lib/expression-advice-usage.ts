import type {ExpressionLibrary} from './expressions';
import type {ExpressionAdvice} from './expression-advice';
import type {Writing} from './folio';
import {quizTokens} from './expression-quiz';
import {matchExpressions,isApproximateMatch,type ExpressionMatch,type TextSpan} from './expression-matcher';

export interface AdviceWritingExcerpt {text:string;spans:TextSpan[];leading:boolean;trailing:boolean;approximate:boolean;reasons:string[]}
export interface AdviceEntryUsage {
 status:'used'|'approximate'|'changed'|'unavailable'|'unmatched';
 occurrences:number;excerpts:AdviceWritingExcerpt[];note?:string;
}
export interface AdviceWritingUsage {
 writing:{id:string;submittedAt:string;updatedAt:string;revision:number;selection:'current'|'latest'};
 usedCount:number;approximateCount:number;changedCount:number;
 entries:Record<string,AdviceEntryUsage>;
}
const submitted=(w:Writing)=>w.submittedAt||w.createdAt;
export function comparisonWriting(writings:Writing[],writingId?:string) {
 const eligible=writings.filter(w=>(w.status==='submitted'||w.status==='reviewed')&&w.text.trim());
 if(writingId)return eligible.find(w=>w.id===writingId)||null;
 return eligible.sort((a,b)=>submitted(b).localeCompare(submitted(a))||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]||null;
}
function signature(text:string){return quizTokens(text).join(' ');}
function excerpt(text:string,match:ExpressionMatch):AdviceWritingExcerpt {
 const start=Math.max(0,match.spans[0].start-75),end=Math.min(text.length,match.spans.at(-1)!.end+85);
 return {text:text.slice(start,end),spans:match.spans.map(s=>({start:s.start-start,end:s.end-start})),leading:start>0,trailing:end<text.length,approximate:isApproximateMatch(match),reasons:match.reasons};
}
// A transient join, never part of saved model output. Reuse the reader's matcher
// and approximation rules, but limit work to this card's (at most ten) entries.
export function collectAdviceWritingUsage(advice:ExpressionAdvice|null,writing:Writing,library:ExpressionLibrary,selection:'current'|'latest'):AdviceWritingUsage {
 const result:AdviceWritingUsage={writing:{id:writing.id,submittedAt:submitted(writing),updatedAt:writing.updatedAt,revision:writing.revision||1,selection},usedCount:0,approximateCount:0,changedCount:0,entries:Object.create(null)};
 if(!advice)return result;
 const sentences=new Map(library.sentences.map(e=>[e.id,e])),words=new Map(library.words.map(e=>[e.id,e]));
 const sentenceIds=new Set<string>(),wordIds=new Set<string>();
 for(const {entry} of advice.items) {
  const prefix=entry.kind+':',id=entry.key.startsWith(prefix)?entry.key.slice(prefix.length):'';
  const current=entry.kind==='sentence'?sentences.get(id):words.get(id);
  let status:AdviceEntryUsage['status']='unmatched',note:string|undefined;
  if(!current||!current.enabled){status='unavailable';note='条目已移除或停用，暂不判断是否使用。';}
  else {
   const source='template' in current?current.template:current.term;
   if(signature(source)!==signature(entry.expression)){status='changed';note='当前条目的英文内容与调用卡快照不同，暂不按同一表达统计。';}
   else (entry.kind==='sentence'?sentenceIds:wordIds).add(id);
  }
  result.entries[entry.key]={status,occurrences:0,excerpts:[],...(note?{note}:{})};
  if(status==='changed'||status==='unavailable')result.changedCount++;
 }
 const selected={...library,sentences:library.sentences.filter(e=>sentenceIds.has(e.id)),words:library.words.filter(e=>wordIds.has(e.id))};
 const matches=new Map<string,ExpressionMatch[]>();
 for(const match of matchExpressions(writing.text,selected)) {
  const key=match.kind+':'+match.entryId,list=matches.get(key)||[];list.push(match);matches.set(key,list);
 }
 for(const [key,list] of matches) {
  const exact=list.filter(m=>!isApproximateMatch(m)),approximate=list.filter(isApproximateMatch);
  const entry=result.entries[key];if(!entry)continue;
  entry.status=exact.length?'used':'approximate';entry.occurrences=list.length;
  entry.excerpts=[...exact,...approximate].slice(0,3).map(m=>excerpt(writing.text,m));
  if(exact.length)result.usedCount++;else result.approximateCount++;
 }
 return result;
}
