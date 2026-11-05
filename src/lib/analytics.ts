import type {Review,Question,Writing} from './folio';
import {templateKey,scoreMaximum} from './folio';
import {ISSUE_CATEGORIES,withScoreMaximum,applyOverrides,parseReview,plain,suggestCategories,type IssueCategory,type ReviewIssue} from './review-analysis';
import {curatedNotes} from './review-curation';
import {reviewNotes,type ReviewNote} from './review-interactions';
export type AnalyticsWriting=Pick<Writing,'id'|'questionId'|'status'|'createdAt'|'submittedAt'|'parentId'|'revision'>;
export interface AnalyticsIssue extends ReviewIssue {noteId?:string;original?:string|null;replacement?:string|null;classificationSource?:'llm'|'manual';classificationReason?:string;remembered?:boolean}
export interface IssueDecision {issueId:string;fingerprint:string;categories:IssueCategory[];source:'llm'|'manual';reason:string}
export const CLASSIFICATION_CATEGORIES=ISSUE_CATEGORIES.filter(c=>c!=='不计入问题');
// Reconcile the remembered-issues-first baseline with current curation.
export function effectiveIssues(review:Review):AnalyticsIssue[]{
 const a=applyOverrides(review.analysis||parseReview(review.markdown),review.issueOverrides);
 const base=reviewNotes(a),baseById=new Map(base.map(n=>[n.id,n])),current=curatedNotes(a,review.curation),byId=new Map(current.map(n=>[n.id,n]));
 const consumed=new Set<string>(),result:AnalyticsIssue[]=[];
 const categories=(n:ReviewNote)=>review.curation?.notes[n.id]&&(n.explanation!==baseById.get(n.id)?.explanation||n.kind!==baseById.get(n.id)?.kind||!n.categories.length)?suggestCategories(n.explanation||n.shortNote||''):n.categories;
 const fromNote=(n:ReviewNote,id:string):AnalyticsIssue=>({id,noteId:n.id,evidence:[n.original,n.explanation||n.shortNote||n.title].filter(Boolean).join('\n'),suggested:suggestCategories(n.explanation||''),categories:categories(n) as AnalyticsIssue['categories'],manual:!!review.curation?.notes[n.id],original:n.original,replacement:n.replacement});
 for(const issue of a.issues){
  const quote=plain(issue.evidence).toLowerCase();
  const exact=base.filter(n=>n.kind==='correction'&&n.original&&quote.includes(plain(n.original).toLowerCase()));
  const linked=exact.length?exact:base.filter(n=>n.kind==='correction'&&n.categories.some(c=>[...issue.suggested,...issue.categories].includes(c as any)));
  for(const n of linked)consumed.add(n.id);
  if(issue.categories.includes('不计入问题'))continue;
  if(linked.some(n=>review.curation?.notes[n.id])){
   for(const n of linked){const effective=byId.get(n.id);if(effective?.kind==='correction'&&!effective.hidden){const item=fromNote(effective,`${issue.id}-${n.id}`);if(issue.manual)item.categories=issue.categories;result.push({...item,remembered:a.issueSource==='remembered',manual:item.manual||issue.manual,classificationSource:issue.manual?'manual':undefined});}}
  }else{
   const n=linked.length===1?linked[0]:undefined;
   result.push({...issue,classificationSource:issue.manual?'manual':undefined,remembered:a.issueSource==='remembered',noteId:n?.id,original:n?.original,replacement:n?.replacement});
  }
 }
 for(const n of current)if(!consumed.has(n.id)&&review.curation?.notes[n.id]&&n.kind==='correction'&&!n.hidden)result.push(fromNote(n,n.id));
 const merged=new Map<string,AnalyticsIssue>();
 for(const item of result){
  const key=item.noteId||item.id,prior=merged.get(key);
  if(!prior||(item.classificationSource==='manual'&&prior.classificationSource!=='manual'))merged.set(key,item);
  else if(prior.classificationSource!=='manual'||item.classificationSource==='manual'){
   merged.set(key,{...prior,categories:[...new Set([...prior.categories,...item.categories])]});
  }
 }
 return [...merged.values()].map(item=>{
  const decision=review.issueDecisions?.find(d=>d.issueId===item.id);
  return decision&&!item.categories.length&&!item.classificationSource&&item.remembered
    ?{...item,categories:decision.categories,classificationSource:decision.source,classificationReason:decision.reason}:item;
 });
}
export function latestReviews(reviews:Review[]){const map=new Map<string,Review>();for(const r of [...reviews].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))map.set(r.writingId,r);return [...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export function analyzeGroup(reviews:Review[],questions:Question[],key:string){const map=new Map(questions.map(q=>[q.id,q]));const rows=latestReviews(reviews).filter(r=>{const q=map.get(r.questionId);return q&&templateKey(q)===key;}).map(r=>({review:r,question:map.get(r.questionId)!,analysis:{...withScoreMaximum(r.analysis||applyOverrides(parseReview(r.markdown),r.issueOverrides),map.get(r.questionId)),issues:effectiveIssues(r)}}));
 const max=scoreMaximum(key==='small'?'small':'large');
 const scored=rows.filter(x=>x.analysis.score.point!==null&&x.analysis.score.max===max&&x.analysis.score.point>=0&&x.analysis.score.point<=max);
 const scores=scored.map(r=>r.analysis.score.point!).sort((a,b)=>a-b);
 const middle=Math.floor(scores.length/2);
 const median=scores.length?(scores[middle]+scores[Math.floor((scores.length-1)/2)])/2:null;
 const boundaries=max===10?[0,1,3,5,7,9]:[0,1,5,9,13,17];
 const bands=boundaries.map((low,i)=>({low,high:boundaries[i+1]??max,count:0}));
 for(const score of scores)bands[boundaries.findLastIndex(low=>low<=score)].count++;
 const categories=new Map<string,typeof rows>();let unclassified=0;
 for(const row of rows){const tags=new Set<string>();for(const issue of row.analysis.issues){if(issue.categories.includes('不计入问题'))continue;if(!issue.categories.length)unclassified++;for(const c of issue.categories)tags.add(c);}for(const c of tags)categories.set(c,[...(categories.get(c)||[]),row]);}
 return {rows,scored,median,minimum:scores[0]??null,maximum:scores.at(-1)??null,bands,average:scored.length?scored.reduce((n,r)=>n+r.analysis.score.point!,0)/scored.length:null,categories:[...categories.entries()].sort((a,b)=>b[1].length-a[1].length),unclassified,max};
}
