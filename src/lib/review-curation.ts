import {exactSurfaceRange} from './sentence-reading';
import {reviewNotes,type ReviewNote,type TextAnchor} from './review-interactions';
import type {ReviewAnalysis} from './review-analysis';
export type NoteDisplay='auto'|'inline'|'sentence'|'notes';
export type NoteEmphasis='none'|'bold'|'underline'|'highlight';
export interface CuratedNote extends ReviewNote {scope:'range'|'global'|'unlocated';anchor:TextAnchor|null;display:NoteDisplay;shortNote:string;emphasis:NoteEmphasis;hidden:boolean;origin:'edited'|'personal'}
export interface CurationData {notes:Record<string,CuratedNote>}
export interface CurationVersionInfo {id:string;version:number;createdAt:string;label:string}
export interface ReviewCuration extends CurationData {revision:number;updatedAt:string;history:CurationVersionInfo[]}
export interface CurationChange {field:string;before:string;after:string}
export interface CurationVersion extends CurationVersionInfo {writingId:string;reviewId:string;data:CurationData;changes:CurationChange[]}
export const KIND_LABELS:Record<ReviewNote['kind'],string>={correction:'实际错误',optimization:'可选优化',keep:'原句可保留',personal:'个人笔记',task:'全文核对'};
export const DISPLAY_LABELS:Record<NoteDisplay,string>={auto:'自动判断',inline:'局部词语删改',sentence:'完整句子对照',notes:'只在右侧展示'};
export const EMPHASIS_LABELS:Record<NoteEmphasis,string>={none:'不强调',bold:'加粗',underline:'下划线',highlight:'高亮'};
const text=(value:unknown,max:number)=>{if(typeof value!=='string'||value.length>max)throw new Error('批阅整理字段格式或长度不正确');return value;};
export function validateCuratedNote(value:unknown,original:string,base:ReviewNote[],existing?:CuratedNote):CuratedNote {
 if(!value||typeof value!=='object')throw new Error('批阅整理格式不正确');const v=value as CuratedNote;
 const id=text(v.id,100);if(!/^[a-zA-Z0-9_-]+$/.test(id)||['__proto__','constructor','prototype'].includes(id))throw new Error('批阅整理编号不正确');const automatic=base.find(n=>n.id===id);if(!automatic&&!existing&&!/^manual-[a-zA-Z0-9_-]{8,80}$/.test(id))throw new Error('批阅整理编号不正确');
 if(!Object.hasOwn(KIND_LABELS,v.kind)||!Object.hasOwn(DISPLAY_LABELS,v.display)||!Object.hasOwn(EMPHASIS_LABELS,v.emphasis)||!['range','global','unlocated'].includes(v.scope)||typeof v.hidden!=='boolean')throw new Error('批阅整理选项不正确');
 if(v.kind==='task'&&automatic?.kind!=='task'&&existing?.kind!=='task')throw new Error('批阅整理不能新增原始任务核对');
 let anchor:TextAnchor|null=null;if(v.scope==='range'){const a=v.anchor;if(!a||!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.end<=a.start||a.end>original.length||!original.slice(a.start,a.end).trim())throw new Error('批阅整理关联范围不正确');anchor={start:a.start,end:a.end};}
 const nullable=(s:unknown,max:number)=>s===null?null:text(s,max);
 const result:CuratedNote={id,kind:v.kind,title:text(v.title,100).trim(),original:anchor?original.slice(anchor.start,anchor.end):automatic?.original||existing?.original||null,replacement:nullable(v.replacement,6000),explanation:nullable(v.explanation,10000),position:anchor?'手动选定原文范围':v.scope==='global'?'全文':automatic?.position||existing?.position||null,categories:automatic?.categories||existing?.categories||[],scope:v.scope,anchor,display:v.display,shortNote:text(v.shortNote,180),emphasis:v.emphasis,hidden:v.hidden,origin:automatic?'edited':existing?.origin||'personal'};
 if(!result.title||!automatic&&!existing&&!result.explanation?.trim()&&!result.replacement?.trim()&&!result.shortNote.trim())throw new Error('批阅整理请填写标题，以及说明、建议或短批注');
 return result;
}
export function curatedNotes(analysis:ReviewAnalysis,curation?:ReviewCuration):ReviewNote[]{
 const base=reviewNotes(analysis),overrides=curation?.notes||{},seen=new Set(base.map(n=>n.id));return [...base.map(n=>overrides[n.id]||n),...Object.values(overrides).filter(n=>!seen.has(n.id))];
}
export function asCurated(note:ReviewNote,anchor:TextAnchor|null,original?:string):CuratedNote {
 const v=note as CuratedNote;let display=v.display||'auto';if(!v.origin&&note.kind==='correction'&&note.original&&anchor&&original!==undefined){const precise=exactSurfaceRange(original,note.original,anchor);if(precise)anchor=precise;else display='notes';}return {...note,scope:v.scope||(note.kind==='task'?'global':anchor?'range':'unlocated'),anchor:v.anchor===undefined?anchor:v.anchor,display,shortNote:v.shortNote||'',emphasis:v.emphasis||'none',hidden:v.hidden||false,origin:v.origin||'edited'};
}
export function curationChanges(before:CuratedNote|undefined,after:CuratedNote|undefined):CurationChange[]{
 const fields:[keyof CuratedNote,string][]=[['original','关联原文'],['title','标题'],['kind','性质'],['replacement','修改稿 / 补充表达'],['explanation','详细说明'],['shortNote','句旁短批注'],['scope','所属范围'],['anchor','原文位置'],['display','删改显示'],['emphasis','重点样式'],['hidden','暂不采纳']];
 const format=(key:keyof CuratedNote,v:unknown):string=>v==null?'not given':key==='kind'?KIND_LABELS[v as ReviewNote['kind']]:key==='display'?DISPLAY_LABELS[v as NoteDisplay]:key==='emphasis'?EMPHASIS_LABELS[v as NoteEmphasis]:key==='anchor'?`${(v as TextAnchor).start}–${(v as TextAnchor).end}`:key==='scope'?({range:'原文范围',global:'全文',unlocated:'未定位'}[v as CuratedNote['scope']]):key==='hidden'?v?'暂不采纳':'正常展示':String(v);
 return fields.filter(([key])=>JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])).map(([key,label])=>({field:label,before:format(key,before?.[key]),after:format(key,after?.[key])}));
}
export function validateCurationSize(data:CurationData){if(Object.keys(data.notes).length>150||new TextEncoder().encode(JSON.stringify(data)).length>120000)throw new Error('批阅整理内容过多，请缩短说明后再保存');}
