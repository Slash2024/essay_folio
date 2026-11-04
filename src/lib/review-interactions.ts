import type {ReadingLayout} from './sentence-reading';
import type {ReviewAnalysis} from './review-analysis';
import {plain,suggestCategories} from './review-analysis';
export type StudyStatus='unread'|'revisit'|'mastered';
export interface TextAnchor {start:number;end:number}
export interface StudyEntry {status:StudyStatus;starred:boolean;anchor?:TextAnchor|null}
export interface ReviewStudy {revision:number;updatedAt:string;entries:Record<string,StudyEntry>;layout?:ReadingLayout}
export interface ReviewNote {id:string;kind:'correction'|'optimization'|'task';title:string;original:string|null;replacement:string|null;explanation:string|null;position:string|null;categories:string[]}
export function interactionId(prefix:string,value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return `${prefix}-${(h>>>0).toString(36)}-${value.length}`;}
export function reviewNotes(a:ReviewAnalysis):ReviewNote[]{
 const notes:ReviewNote[]=a.corrections.map((c,i)=>({id:interactionId('c',`${c.original}\n${c.revision}\n${c.explanation}`),kind:'correction',title:`纠错 ${i+1}`,original:c.original,replacement:c.revision,explanation:c.explanation,position:null,categories:suggestCategories(c.explanation||'')}));
 notes.push(...a.optimizations.map((o,i)=>({id:interactionId('o',`${o.position}\n${o.addition}\n${o.effect}`),kind:'optimization',title:`优化 ${i+1}`,original:null,replacement:o.addition,explanation:o.effect,position:o.position,categories:[]} as ReviewNote)));
 if(a.sections[0])notes.push({id:interactionId('task',a.sections[0]),kind:'task',title:'任务与结构核对',original:null,replacement:null,explanation:a.sections[0],position:'全文',categories:[]});
 // An identical suggestion is one study item, even if repeated in an import.
 return [...new Map(notes.map(n=>[n.id,n])).values()];
}
interface Token {value:string;start:number;end:number}
function tokens(s:string):Token[]{return [...s.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g)].map(m=>({value:m[0].toLowerCase().replaceAll('’',"'"),start:m.index!,end:m.index!+m[0].length}));}
export function locateQuote(text:string,quote:string):TextAnchor|null{
 const needle=plain(quote);if(!needle)return null;
 const matches:TextAnchor[]=[];let pos=0;
 while(pos<=text.length){const start=text.indexOf(needle,pos);if(start<0)break;const end=start+needle.length;const left=start===0||!/[A-Za-z0-9]/.test(text[start-1]),right=end===text.length||!/[A-Za-z0-9]/.test(text[end]);if(left&&right)matches.push({start,end});pos=start+1;}
 if(matches.length===1)return matches[0];if(matches.length>1)return null;
 const a=tokens(text),b=tokens(needle);if(b.length<3)return null;const found:TextAnchor[]=[];
 for(let i=0;i+b.length<=a.length;i++){if(b.every((t,j)=>t.value===a[i+j].value))found.push({start:a[i].start,end:a[i+b.length-1].end});}
 return found.length===1?found[0]:null;
}
// Source essays commonly separate paragraphs with a single newline. Never merge those.
export function essayParagraphs(text:string):TextAnchor[]{return [...text.matchAll(/[^\r\n]+/g)].filter(m=>m[0].trim()).map(m=>({start:m.index!,end:m.index!+m[0].length}));}
export function sentenceRanges(text:string):TextAnchor[]{const result:TextAnchor[]=[];for(const p of essayParagraphs(text)){const s=text.slice(p.start,p.end);let start=0;for(const m of s.matchAll(/[.!?]["”']?(?=\s+|$)/g)){const end=m.index!+m[0].length;let a=start;while(a<end&&/\s/.test(s[a]))a++;if(a<end)result.push({start:p.start+a,end:p.start+end});start=end;}while(start<s.length&&/\s/.test(s[start]))start++;if(start<s.length)result.push({start:p.start+start,end:p.end});}return result;}
function sharedExpressionAnchor(text:string,addition:string):TextAnchor|null {
 const source=tokens(text),sentences=sentenceRanges(text),window=6,windows=new Map<string,number[]>();
 for(let i=0;i+window<=source.length;i++){const key=source.slice(i,i+window).map(t=>t.value).join(' ');windows.set(key,[...(windows.get(key)||[]),i]);}
 const blocks=[...addition.matchAll(/^\s*>\s?(.+)$/gm)].map(m=>tokens(plain(m[1])));let best=0;const candidates=new Map<string,TextAnchor>();
 for(const target of blocks){if(target.length<window||target.length>300)continue;for(let j=0;j+window<=target.length;j++){const key=target.slice(j,j+window).map(t=>t.value).join(' ');for(const i of windows.get(key)||[]){let length=window;while(i+length<source.length&&j+length<target.length&&source[i+length].value===target[j+length].value)length++;if(length<Math.max(6,Math.ceil(target.length*.35)))continue;const start=source[i].start,end=source[i+length-1].end,at=sentences.find(s=>s.start<=start&&s.end>=end);if(!at)continue;if(length>best){best=length;candidates.clear();}if(length===best)candidates.set(`${at.start}:${at.end}`,at);}}}
 return candidates.size===1?[...candidates.values()][0]:null;
}
export function automaticAnchor(text:string,n:ReviewNote):TextAnchor|null{
 if(n.kind==='correction')return n.original?locateQuote(text,n.original):null;
 if(n.kind==='task')return null;
 const position=plain(n.position||'');
 // A quoted English span is preferred; otherwise only an explicit paragraph number is trusted.
 const spans=position.match(/[A-Za-z][A-Za-z0-9’'\s,.…-]*/g)||[];for(const s of spans.sort((a,b)=>b.length-a.length)){if(tokens(s).length<3)continue;const at=locateQuote(text,s.replace(/[。,.，\s]+$/,''));if(at)return at;}
 const p=position.match(/第\s*([一二三四五六七八九\d]+)\s*段/);if(!p)return sharedExpressionAnchor(text,n.replacement||'');
 const index=/^\d+$/.test(p[1])?Number(p[1])-1:'一二三四五六七八九'.indexOf(p[1]);return essayParagraphs(text)[index]||null;
}
export function noteAnchor(text:string,n:ReviewNote,entry?:StudyEntry):{range:TextAnchor|null;source:'manual'|'quote'|'paragraph'|'shared'|'none'}{
 if(entry&&Object.hasOwn(entry,'anchor'))return {range:entry.anchor||null,source:entry.anchor?'manual':'none'};
 const range=automaticAnchor(text,n);return {range,source:!range?'none':n.kind==='correction'?'quote':/第\s*[一二三四五六七八九\d]+\s*段/.test(n.position||'')?'paragraph':'shared'};
}
export function validateStudyEntry(value:unknown,text:string):StudyEntry {
 if(!value||typeof value!=='object')throw new Error('批阅复习记录格式不正确');const v=value as Record<string,unknown>;
 if(!['unread','revisit','mastered'].includes(String(v.status))||typeof v.starred!=='boolean')throw new Error('批阅复习状态不正确');
 const result:StudyEntry={status:v.status as StudyStatus,starred:v.starred};
 if(Object.hasOwn(v,'anchor')){if(v.anchor===null)result.anchor=null;else{const a=v.anchor as TextAnchor;if(!a||!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.end<=a.start||a.end>text.length||!text.slice(a.start,a.end).trim())throw new Error('批阅关联位置不正确');result.anchor={start:a.start,end:a.end};}}
 return result;
}
export const EMPTY_STUDY_ENTRY:StudyEntry={status:'unread',starred:false};
