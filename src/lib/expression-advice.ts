import type {ExpressionLibrary} from './expressions';
import {matchExpressions} from './expression-matcher';

export const ADVICE_VERSION = 'recall-card-v1';
export const CONTEXT_VERSION = 'objective-context-v1';
export interface AdviceEntry {
  key:string; kind:'sentence'|'word'; title:string; expression:string; meaning:string;
  category:string; forms:string[]; notes:string; substitutions:string; used:number;
}
export interface QuestionContext {
  id:string; questionId:string; fingerprint:string; questionFingerprint:string; description:string; origin:'directions'|'public-page'|'records';
  sourceURL?:string; evidence?:{sourceId:string;quote:string}[]; sourceFingerprints?:{id:string;hash:string}[]; uncertainties:string[]; createdAt:string;
}
export interface AdviceItem {
  entry:AdviceEntry; stage:string; cue:string; why:string; example:string;
  translation:string; adaptation:string; avoid:string;
}
export interface ExpressionAdvice {
  id:string; questionId:string; fingerprint:string; contextId:string; contextFingerprint:string;
  entriesFingerprint:string; promptVersion:string; model:string; createdAt:string;
  angle:string; items:AdviceItem[]; shortfall:string;
}
export interface AdviceProgress {
  stage:'context'|'candidates'|'model'|'validation'|'saving'|'done';
  message:string;startedAt:string;updatedAt:string;taskId?:string;
  candidateCount?:number;receivedCharacters?:number;receivedItems?:number;
}
export interface AdviceTask {
  id:string; questionId:string; fingerprint:string; createdAt:string;
  status:'pending'|'ready'|'failed'; phase:'context'|'advice'; error?:string; progress?:AdviceProgress;
  context?:QuestionContext; result?:ExpressionAdvice;
}
export interface AdviceView {
  context:QuestionContext|null; result:ExpressionAdvice|null; task:Pick<AdviceTask,'id'|'status'|'phase'|'createdAt'|'error'|'progress'>|null;
  stale:boolean; contextStale:boolean; candidateCount:number;
}
export function adviceEntries(library:ExpressionLibrary):AdviceEntry[] {
  return [
    ...library.sentences.filter(e=>e.enabled).map(e=>({key:'sentence:'+e.id,kind:'sentence' as const,title:e.title,expression:e.template,meaning:e.notes.slice(0,500),category:e.category,forms:[],notes:e.notes,substitutions:e.substitutions,used:0})),
    ...library.words.filter(e=>e.enabled).map(e=>({key:'word:'+e.id,kind:'word' as const,title:e.term,expression:e.term,meaning:e.meaning,category:'词条',forms:e.forms,notes:e.meaning,substitutions:'',used:0})),
  ];
}
function field(value:unknown,max:number,label:string) {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`模型返回的${label}不完整或过长`);
  return value.trim();
}
export function validateAdvice(value:unknown,entries:AdviceEntry[]) {
  if(!value||typeof value!=='object')throw new Error('模型未返回有效调用卡');
  const v=value as Record<string,unknown>,angle=field(v.angle,650,'审题思路');
  if(!Array.isArray(v.items)||!v.items.length||v.items.length>10)throw new Error('调用卡须包含1—10条表达');
  const seen=new Set<string>(),surfaces=new Set<string>(),byKey=new Map(entries.map(e=>[e.key,e]));
  const items:AdviceItem[]=[];let removed=0;
  for(const raw of v.items) {
    try {
      const e=raw as Record<string,unknown>,entry=byKey.get(String(e.entryKey));
      if(!entry||seen.has(entry.key))throw new Error('重复或无效条目');
      const canonical=entry.expression.toLowerCase().replace(/\s+/g,' ').trim();
      if(surfaces.has(canonical))throw new Error('重复表达');
      const example=field(e.example,1400,'英文示例');
      if(!/[a-z]/i.test(example)||/[\u3400-\u9fff]/.test(example)||/\{\{|\}\}|_{2,}|\[[^\]]+\]|…|\.{3}/.test(example))throw new Error('示例尚有未填空位');
      const lib:ExpressionLibrary={revision:0,updatedAt:null,tolerance:'strict',sourceText:'',sentences:entry.kind==='sentence'?[{id:'chosen',category:entry.category,title:entry.title,template:entry.expression,notes:'',substitutions:entry.substitutions,enabled:true}]:[],words:entry.kind==='word'?[{id:'chosen',term:entry.expression,meaning:'',forms:entry.forms,enabled:true}]:[]};
      if(!matchExpressions(example,lib).length)throw new Error('示例无法核对到表达固定部分');
      items.push({entry,example,stage:field(e.stage,50,'应用位置'),cue:field(e.cue,180,'调用线索'),why:field(e.why,260,'应用理由'),translation:field(e.translation,650,'中文释义'),adaptation:field(e.adaptation,350,'迁移方法'),avoid:field(e.avoid,220,'使用边界')});
      seen.add(entry.key);surfaces.add(canonical);
    }catch {removed++;}
  }
  if(!items.length)throw new Error('推荐未通过表达引用与示例核对，请手动重新生成');
  const explanation=typeof v.shortfall==='string'?v.shortfall.trim().slice(0,500):'';
  return {angle,items,shortfall:items.length<10?[`本次保留 ${items.length} / 10 条可核对的表达。`,removed?`${removed} 条未通过引用、重复或示例检查，已过滤。`:'',explanation||(!removed?'模型未提供足够的适用条目。':'')].filter(Boolean).join(' '):''};
}
export function publicDescription(html:string):string|null {
  // Read the actual FAQ field, not a generated essay or the truncated image alt.
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;try{data=JSON.parse(m[1]);}catch{continue;}
    const objects=Array.isArray(data)?data:data['@graph']||[data];
    for(const node of objects)if(node?.['@type']==='FAQPage') {
      for(const q of node.mainEntity||[])if(/(?:漫画|图表)画的是什么/.test(q.name||'')) {
        const answer=q.acceptedAnswer?.text;
        if(typeof answer!=='string')continue;
        const body=answer.split(/\s*就本题而言[，,]/)[0].replace(/^.*?(?:漫画|图表)内容为[：:]/,'').trim();
        if(body.length>=30&&body.length<=7000&&body.length<answer.length)return body;
      }
    }
  }
  return null;
}
export function validateExtractedContext(value:unknown,sources:{id:string;text:string}[]) {
  if(!value||typeof value!=='object')throw new Error('题面整理结果格式不正确');
  const v=value as Record<string,unknown>;
  if(v.complete!==true||!Array.isArray(v.facts)||!v.facts.length||v.facts.length>30)throw new Error('现有文字无法完整还原关键题面，请先补充或核对题目描述');
  const byId=new Map(sources.map(s=>[s.id,s.text]));const evidence:{sourceId:string;quote:string}[]=[];
  const facts=v.facts.map(raw=>{
    const fact=raw as Record<string,unknown>,text=field(fact.text,700,'题面事实');
    if(!Array.isArray(fact.evidence)||!fact.evidence.length)throw new Error('题面事实缺少来源依据');
    for(const item of fact.evidence) {
      const proof=item as Record<string,unknown>,sourceId=String(proof.sourceId),quote=field(proof.quote,1200,'题面依据');
      if(!byId.get(sourceId)?.includes(quote))throw new Error('题面依据无法核对到原记录');
      evidence.push({sourceId,quote});
    }
    return text;
  });
  const description=facts.join('\n');if(description.length>7000)throw new Error('题面整理结果过长');
  const uncertainties=Array.isArray(v.uncertainties)?v.uncertainties.filter((x):x is string=>typeof x==='string').slice(0,8).map(x=>x.slice(0,300)):[];
  return {description,evidence,uncertainties};
}
