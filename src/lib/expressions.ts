import seed from '../data/expressions.json';
export type Tolerance='strict'|'balanced'|'loose';
export interface SentenceEntry { id:string; category:string; title:string; template:string; notes:string; substitutions:string; enabled:boolean }
export interface WordEntry { id:string; term:string; meaning:string; forms:string[]; enabled:boolean }
export interface ExpressionLibrary { revision:number; updatedAt:string|null; tolerance:Tolerance; sentences:SentenceEntry[]; words:WordEntry[]; sourceText:string }
export const DEFAULT_EXPRESSIONS=seed as ExpressionLibrary;
const text=(v:unknown,max:number,label:string)=>{if(typeof v!=='string'||v.length>max)throw new Error(`表达库${label}格式或长度不正确`);return v.trim();};
export function validateExpressions(value:unknown):Omit<ExpressionLibrary,'revision'|'updatedAt'> {
  if(!value||typeof value!=='object')throw new Error('表达库格式不正确');
  const v=value as Record<string,unknown>;
  if(!['strict','balanced','loose'].includes(String(v.tolerance)))throw new Error('表达库匹配模式不正确');
  if(!Array.isArray(v.sentences)||v.sentences.length>500||!Array.isArray(v.words)||v.words.length>1000)throw new Error('表达库最多支持500条句式和1000条词条');
  const ids=new Set<string>();const entryId=(raw:unknown)=>{const id=text(raw,100,'编号');if(!/^[A-Za-z0-9_-]+$/.test(id)||ids.has(id))throw new Error('表达库条目编号无效或重复');ids.add(id);return id;};
  const sentences=v.sentences.map((s:any)=>{if(!s||typeof s!=='object')throw new Error('表达库句式格式不正确');const template=text(s.template,1800,'模板');if((template.match(/\{\{/g)||[]).length!==(template.match(/\}\}/g)||[]).length)throw new Error('表达库模板的填空符号未闭合');const fixed=template.replace(/\{\{[\s\S]*?\}\}|\[[^\]]*\]/g,' ').match(/[A-Za-z]+/g)||[];if(fixed.length<2)throw new Error('表达库每条模板至少需要两个固定英文词');return{id:entryId(s.id),category:text(s.category||'自定义',100,'分类'),title:text(s.title||'未命名句式',120,'标题'),template,notes:text(s.notes||'',3000,'说明'),substitutions:text(s.substitutions||'',1200,'替换组'),enabled:s.enabled!==false};});
  const words=v.words.map((w:any)=>{if(!w||typeof w!=='object')throw new Error('表达库词条格式不正确');const term=text(w.term,220,'词条');if(!/[A-Za-z]/.test(term))throw new Error('表达库词条需要包含英文');if(!Array.isArray(w.forms)||w.forms.length>60)throw new Error('表达库每个词条最多支持60个补充变体');return{id:entryId(w.id),term,meaning:text(w.meaning||'',500,'释义'),forms:w.forms.map((f:unknown)=>text(f,220,'变体')).filter(Boolean),enabled:w.enabled!==false};});
  return{tolerance:v.tolerance as Tolerance,sentences,words,sourceText:text(v.sourceText||'',24000,'原始素材')};
}
