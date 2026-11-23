import type {Question,Review,TemplateKey} from './folio';
import {templateKey} from './folio';
import {latestReviews} from './analytics';
import type {ExpressionLibrary,SentenceEntry} from './expressions';
import {matchExpressions,type TextSpan} from './expression-matcher';
import {curatedNotes} from './review-curation';
import {locateQuote,noteAnchor,sentenceRanges,type ReviewNote} from './review-interactions';
import {applyOverrides,parseReview,plain,suggestCategories} from './review-analysis';
import {wordDiff} from './revisions';
import {reviewedTemplateSelections} from './template-review-selections';

export type TemplateProblem='结构与拼写'|'填入内容'|'使用场景';
export interface TemplateEvidence {
 id:string;writingId:string;reviewId:string;noteId:string;question:Question;
 createdAt:string;original:string;replacement:string;explanation:string;
 labels:string[];problems:TemplateProblem[];reminder:boolean;pending:boolean;
}
export interface TemplateProblemGroup {
 id:string;title:string;template:string;category:string;classification:string;
 evidence:TemplateEvidence[];writingCount:number;latestAt:string;labels:string[];
}
export interface TemplateReviewResult {groups:TemplateProblemGroup[];reminders:TemplateProblemGroup[];unlocated:number}
const normalize=(text:string)=>plain(text).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9\u3400-\u9fff]+/g,' ').trim();
const surface=(text:string)=>plain(text).replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
const words=(text:string)=>[...text.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g)].map(m=>({value:m[0].toLowerCase().replaceAll('’',"'"),start:m.index!,end:m.index!+m[0].length}));
const overlaps=(a:TextSpan,b:TextSpan)=>a.start<b.end&&b.start<a.end;

/** Reconcile a quotation with the current draft without silently reusing a stale anchor.
 * One small spelling edit may have been fixed since import; ambiguous matches abstain. */
export function currentQuote(text:string,quote:string):string|null {
 const exact=locateQuote(text,quote);if(exact)return text.slice(exact.start,exact.end);
 const a=words(text),b=words(quote);if(b.length<8)return null;
 let best=0;const hits:TextSpan[]=[];
 for(let i=0;i+b.length<=a.length;i++){
  let same=0;for(let j=0;j<b.length;j++)if(a[i+j].value===b[j].value)same++;
  const score=same/b.length;if(score<.94||score<best)continue;
  if(score>best){best=score;hits.length=0;}
  let end=a[i+b.length-1].end;
  while(end<text.length&&/[.!?,"”';:%]/.test(text[end]))end++;
  hits.push({start:a[i].start,end});
 }
 return hits.length===1?text.slice(hits[0].start,hits[0].end):null;
}
function changedRanges(before:string,after:string):TextSpan[]{
 let pos=0;const result:TextSpan[]=[];
 for(const part of wordDiff(before,after)){
  if(part.type==='remove'&&part.value.trim())result.push({start:pos,end:pos+part.value.length});
  if(part.type==='add'&&part.value.trim())result.push({start:Math.max(0,pos-1),end:Math.min(before.length,pos+1)});
  if(part.type!=='add')pos+=part.value.length;
 }
 return result;
}
function classify(note:ReviewNote):{labels:string[];problems:TemplateProblem[]} {
 const categories=suggestCategories(note.explanation||note.shortNote||'');
 const structure=categories.filter(c=>!['词义与主题','论证与任务','字数与格式','其他问题'].includes(c));
 const problems:TemplateProblem[]=[];
 if(structure.length)problems.push('结构与拼写');
 if(categories.includes('词义与主题')||/搭配|词义|用词|对象|概念/.test(note.explanation||''))problems.push('填入内容');
 if(categories.includes('论证与任务')||/语境|题意|论题|统计对象|图表|过于笼统/.test(note.explanation||''))problems.push('使用场景');
 if(!problems.length)problems.push('填入内容');
 return {labels:categories.length?categories:['模板使用'],problems:[...new Set(problems)]};
}
function classification(entry:SentenceEntry){return entry.category.split(/\s*\/\s*/).slice(0,2).join(' / ');}
function compatible(entry:SentenceEntry,key:TemplateKey){return key==='small'?!entry.category.startsWith('大作文'):!entry.category.startsWith('小作文');}
function scopeFor(text:string,hit:ReturnType<typeof matchExpressions>[number]):TextSpan {
 const start=hit.spans[0].start,end=hit.spans.at(-1)!.end;
 const template=hit.source.trim();
 const sentence=sentenceRanges(text).find(s=>s.start<=start&&s.end>=end);
 let scopeEnd=sentence&&/(?:\}\}|\]|…|\.{3})[.!?]?\s*$/.test(template)?sentence.end:end;
 // A trailing slot does not own a separate coordinate clause simply because
 // both clauses happen to share a sentence.
 const boundary=text.slice(end,scopeEnd).match(/[,;]\s*(?:and|but|while|whereas)\b/i);
 if(boundary)scopeEnd=end+boundary.index!;
 return {start:sentence&&/^(?:\{\{|\[|…|\.{3}|Sth\b)/i.test(template)?sentence.start:start,end:scopeEnd};
}
function autoAssociation(original:string,replacement:string,library:ExpressionLibrary):SentenceEntry|null {
 const hits=matchExpressions(original,library).filter(h=>h.kind==='sentence');
 const changes=replacement?changedRanges(original,replacement):[];
 const eligible=hits.filter(h=>{
  const fixedWords=words(h.source.replace(/\{\{[\s\S]*?\}\}/g,' ')).length;
  return fixedWords>=3&&h.confidence>=.78&&(!changes.length||changes.some(r=>overlaps(r,scopeFor(original,h))));
 });
 // Prefer the most specific fixed skeleton, not a generic two-word component.
 eligible.sort((a,b)=>b.spans.reduce((n,s)=>n+s.end-s.start,0)-a.spans.reduce((n,s)=>n+s.end-s.start,0)||b.confidence-a.confidence);
 return library.sentences.find(s=>s.id===eligible[0]?.entryId)||null;
}
function optionalCorrection(note:ReviewNote){
 const explanation=plain(note.explanation||'');
 return /主要问题是.{0,30}重复|属于.{0,12}(?:可选|小幅|表达稳妥性).*优化|不是.{0,12}原文.*错误/.test(explanation);
}

export function buildTemplateReview(reviews:Review[],questions:Question[],key:TemplateKey,library:ExpressionLibrary,
 texts:Record<string,string>,currentTexts:Record<string,string>={}):TemplateReviewResult {
 const questionMap=new Map(questions.map(q=>[q.id,q]));
 const entries=new Map(library.sentences.filter(s=>s.enabled&&compatible(s,key)).map(s=>[s.id,s]));
 const matchingLibrary={...library,tolerance:'loose' as const,sentences:[...entries.values()],words:[]};
 const grouped=new Map<string,TemplateProblemGroup>();let unlocated=0;
 for(const review of latestReviews(reviews)){
  const question=questionMap.get(review.questionId);if(!question||templateKey(question)!==key)continue;
  const bound=texts[review.id];if(!bound){unlocated++;continue;}
  const current=currentTexts[review.writingId]??bound;
  const analysis=applyOverrides(review.analysis||parseReview(review.markdown),review.issueOverrides);
  const notes=curatedNotes(analysis,review.curation);
  const selections=reviewedTemplateSelections.filter(s=>s.reviewId===review.id);
  const seen=new Set<string>();
  for(const note of notes){
   if(note.hidden||!['correction','optimization'].includes(note.kind)||note.categories.includes('不计入问题'))continue;
   if(analysis.issues.some(i=>i.categories.includes('不计入问题')&&note.original&&normalize(i.evidence).includes(normalize(note.original))))continue;
   const needle=note.original||note.position||'';
   const selection=selections.find(s=>normalize(needle).includes(normalize(s.needle)));
   // Reviewed records use the owner's confirmed selection; new/edited personal
   // corrections still go through the general matcher below.
   if(selections.length&&!selection&&!note.origin)continue;
   let quote=note.original;
   const at=noteAnchor(bound,note,review.study?.entries[note.id]).range;
   if(!quote&&at)quote=bound.slice(at.start,at.end);
   if(!quote&&selection?.source){
    const i=normalize(bound).indexOf(normalize(selection.source));
    // Locate by the actual visible sentence instead of normalized character offsets.
    if(i>=0){const range=sentenceRanges(bound).find(s=>normalize(bound.slice(s.start,s.end)).includes(normalize(selection.source!)));if(range)quote=bound.slice(range.start,range.end);}
   }
   if(!quote){if(note.kind==='correction')unlocated++;continue;}
   const source=currentQuote(current,quote);if(!source){unlocated++;continue;}
   const replacement=plain(note.replacement||'');
   if(replacement&&surface(source)===surface(replacement))continue;
   // A whole-clause correction about a since-fixed spelling/predicate should not
   // resurface merely because its suggested rewrite also changes style.
   if(/makeing/i.test(quote)&&! /makeing/i.test(source)&&/while\s+residents\s+make\b/i.test(source))continue;
   const entry=selection?entries.get(selection.templateId):autoAssociation(source,replacement,matchingLibrary);
   if(!entry)continue;
   const reminder=note.kind==='optimization'||selection?.reminder===true||optionalCorrection(note);
   const dedupe=entry.id+':'+normalize(source)+':'+reminder;
   if(seen.has(dedupe))continue;seen.add(dedupe);
   const {labels,problems}=classify(note);
   const evidence:TemplateEvidence={id:review.id+':'+note.id,writingId:review.writingId,reviewId:review.id,noteId:note.id,
    question,createdAt:review.createdAt,original:source,replacement,explanation:note.explanation||note.shortNote||'',
    labels,problems,reminder,pending:false};
   const scene=entry.category.startsWith('大作文 / 图画 / 开头');
   const groupId=scene?'scene-description':entry.id;
   const groupKey=groupId+':'+reminder;
   const group=grouped.get(groupKey)||{id:groupId,title:scene?'图画描述与场景倒装':entry.title,template:scene?'In the picture, a thought-provoking scene unfolds …':entry.template,category:entry.category,
    classification:classification(entry),evidence:[],writingCount:0,latestAt:'',labels:[]};
   group.evidence.push(evidence);grouped.set(groupKey,group);
  }
 }
 for(const group of grouped.values()){
  group.evidence.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  group.writingCount=new Set(group.evidence.map(e=>e.writingId)).size;
  group.latestAt=group.evidence[0].createdAt;
  group.labels=[...new Set(group.evidence.flatMap(e=>e.labels))];
 }
 const all=[...grouped.values()].sort((a,b)=>b.writingCount-a.writingCount||b.latestAt.localeCompare(a.latestAt)||a.id.localeCompare(b.id));
 return {groups:all.filter(g=>!g.evidence[0].reminder),reminders:all.filter(g=>g.evidence[0].reminder),unlocated};
}
