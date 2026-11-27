import {validateRecallCue,type AdviceEntry,type AdviceItem} from './expression-advice';
import {readingRows} from './sentence-reading';
import {wordCount,type Question} from './folio';

export const STRONG_ADVICE_VERSION='whole-essay-skeleton-v2';
export interface StrongCoverage {sentences:number;covered:number;words:number;minimum:number;maximum:number;repairs:number}
export interface StrongIssue {index?:number;message:string}
const slot=/\{\{[\s\S]*?\}\}|\[[^\]\n]+\]|\.{3,}|…+|_{2,}|\b(?:sb|sth)\b\.?/gi;
const tokens=(s:string)=>s.normalize('NFKC').replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').toLowerCase().match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g)||[];
const prose=(s:string)=>readingRows(s).rows;
function templateParts(template:string){return prose(template.replace(slot,' FOLIOSLOT ')).map(r=>r.text);}
function skeletonMatches(template:string,sentence:string){
 const parts=tokens(template),actual=tokens(sentence);
 // Exact fixed words, in order, with nonempty explicit slots. No synonyms,
 // fuzzy spelling, arbitrary omissions or extra text outside a slot.
 if(parts.filter(p=>p!=='folioslot').length<2)return false;
 let previous=Array(actual.length+1).fill(false);previous[0]=true;
 for(const token of parts){const next=Array(actual.length+1).fill(false);for(let j=1;j<=actual.length;j++)next[j]=token==='folioslot'?(previous[j-1]||next[j-1]):previous[j-1]&&actual[j-1]===token;previous=next;}
 return previous[actual.length];
}
export function strongSentenceMatch(template:string,example:string){
 const expected=templateParts(template),actual=prose(example);
 return expected.length>0&&expected.length===actual.length&&actual.every((r,i)=>r.kind==='sentence'&&skeletonMatches(expected[i],r.text));
}
export function strongCandidate(entry:AdviceEntry){return entry.kind==='sentence'&&templateParts(entry.expression).every(p=>tokens(p).filter(w=>w!=='folioslot').length>=2);}
export function strongSlots(template:string){return [...template.matchAll(slot)].map(m=>m[0]);}
function renderExample(row:Record<string,unknown>,entry:AdviceEntry){
 // When fills are present the model never supplies the fixed English: compose
 // only from the authoritative template and ordered, nonempty slot contents.
 if(row.fills===undefined)return text(row.example,2200,'英文示例');
 const slots=strongSlots(entry.expression);
 if(!Array.isArray(row.fills)||row.fills.length!==slots.length)throw Error('填空数量与原句式空位数量不一致');
 const fills=row.fills.map(v=>text(v,1800,'空位内容'));let i=0;
 let example=entry.expression.replace(slot,()=>fills[i++]).replace(/\s+/g,' ').trim();
 example=example.replace(/^[a-z]/,c=>c.toUpperCase());
 if(!/[.!?]["”’')]*$/.test(example))example+='.';
 return example;
}
function text(v:unknown,max:number,label:string){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+'不完整或过长');return v.trim();}
export function checkStrongAdvice(value:unknown,entries:AdviceEntry[],question:Pick<Question,'type'>,repairs=0){
 const issues:StrongIssue[]=[],items:(AdviceItem&{paragraph:number;sentenceCount:number})[]=[],byKey=new Map(entries.map(e=>[e.key,e]));
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 let angle='';try{angle=text(raw.angle,650,'写作思路');}catch(e){issues.push({message:(e as Error).message});}
 const source=Array.isArray(raw.items)?raw.items:[];
 if(!source.length||source.length>200)issues.push({message:'缺少完整的行文调用卡或输出过长'});
 const renderedExamples=source.map((x:any)=>String(x?.example||''));
 let lastParagraph=1;const examples=new Set<string>();
 source.slice(0,200).forEach((item,index)=>{
  try {
   if(!item||typeof item!=='object')throw Error('调用卡格式不正确');const row=item as Record<string,unknown>;
   const entry=byKey.get(String(row.entryKey));if(!entry||!strongCandidate(entry))throw Error('未引用真实、启用且可逐句核验的库内句式');
   const example=renderExample(row,entry);renderedExamples[index]=example;
   if(/[\u3400-\u9fff]|\{\{|\}\}|\[[^\]]+\]|_{2,}|…|\.{3}/.test(example))throw Error('英文示例含中文或未填空位');
   if(!/[.!?]["”’')]*$/.test(example))throw Error('正文句子须有结束标点');
   if(!strongSentenceMatch(entry.expression,example))throw Error('每句必须完整保留库内固定骨架；不接受近似匹配或夹带额外句子');
   const normalized=tokens(example).join(' ');if(examples.has(normalized))throw Error('重复的正文句子');examples.add(normalized);
   const paragraph=Number(row.paragraph);if(!Number.isSafeInteger(paragraph)||paragraph<1||paragraph>lastParagraph+1||paragraph<lastParagraph||index===0&&paragraph!==1)throw Error('段落编号须从1开始并按行文顺序连续排列');lastParagraph=paragraph;
   items.push({entry,paragraph,sentenceCount:prose(example).length,example,stage:text(row.stage,50,'应用位置'),cue:validateRecallCue(row.cue),why:text(row.why,260,'应用理由'),translation:text(row.translation,650,'中文释义'),adaptation:text(row.adaptation,350,'迁移方法'),avoid:text(row.avoid,220,'使用边界')});
  }catch(e){issues.push({index,message:(e as Error).message});}
 });
 let title='',salutation='',signoff='';
 try {
  for(const name of ['title','salutation','signoff'])if(raw[name]!==undefined&&typeof raw[name]!=='string')throw Error('格式行须为文字');
  title=String(raw.title||'').trim();salutation=String(raw.salutation||'').trim();signoff=String(raw.signoff||'').trim();
  if(question.type!=='small'&&(title||salutation||signoff))throw Error('大作文不添加额外标题、称呼或落款');
  if(title&&(title.length>90||wordCount(title)>8||!/^[A-Za-z][A-Za-z '\-]*$/.test(title)||/\b(?:is|are|was|were|will|should|must|can|have|has)\b/i.test(title)))throw Error('标题只能是简短标题，不能夹带正文句子');
  if(salutation&&!/^Dear [A-Za-z][A-Za-z ,'-]{0,70},$/.test(salutation))throw Error('称呼格式不正确');
  if(signoff&&!/^(?:Yours sincerely|Yours faithfully|Sincerely yours|Best regards|Kind regards),\n[A-Z][A-Za-z'-]*(?: [A-Z][A-Za-z'-]*){0,3}$/.test(signoff))throw Error('落款只能包含结束敬语和姓名');
 }catch(e){issues.push({message:(e as Error).message});}
 // Build the full essay ourselves: model-supplied extra essay fields are never used.
 const body=source.map((x:any,i)=>renderedExamples[i]+(i+1<source.length?(x?.paragraph===source[i+1]?.paragraph?' ':'\n\n'):'')).join('');
 const essay=[title,salutation,body,signoff].filter(Boolean).join('\n\n');
 const words=wordCount(essay),minimum=question.type==='small'?90:160,maximum=question.type==='small'?110:200;
 if(words<minimum||words>maximum)issues.push({message:`整篇${words}词，须为${minimum}—${maximum}词（含格式行）`});
 const sentences=items.reduce((n,i)=>n+i.sentenceCount,0);
 if(!issues.length&&prose(body).filter(r=>r.kind==='sentence').length!==sentences)issues.push({message:'整篇分句与逐条示例不一致，须修正句间标点或引号'});
 return {issues,result:{angle,items,shortfall:'',essay,coverage:{sentences,covered:sentences,words,minimum,maximum,repairs} satisfies StrongCoverage}};
}
// A bounded repair can replace only requested positions. Successful sentences
// remain byte-for-byte unchanged; a word-count/format issue permits full revision.
export function mergeStrongRepair(original:unknown,repair:unknown,issues:StrongIssue[]):unknown {
 const old=original as Record<string,unknown>,update=repair as Record<string,unknown>;
 if(!old||typeof old!=='object'||!update||typeof update!=='object')throw Error('修复结果格式不正确');
 if(issues.some(i=>i.index===undefined))return update;
 const expected=new Set(issues.map(i=>i.index!));
 if(!Array.isArray(old.items)||!Array.isArray(update.items)||update.items.length!==expected.size)throw Error('修复数量不完整');
 const rows=[...old.items];for(const item of update.items){const index=item?.index;if(!Number.isSafeInteger(index)||!expected.delete(index))throw Error('修复句子编号无效或重复');const {index:_,...replacement}=item;rows[index]=replacement;}
 if(expected.size)throw Error('修复遗漏句子');return {...old,items:rows};
}
