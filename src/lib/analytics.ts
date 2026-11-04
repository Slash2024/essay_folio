import type {Review,Question} from './folio';
import {templateKey} from './folio';
import {applyOverrides,parseReview} from './review-analysis';
export function latestReviews(reviews:Review[]){const map=new Map<string,Review>();for(const r of [...reviews].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))map.set(r.writingId,r);return [...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export function analyzeGroup(reviews:Review[],questions:Question[],key:string){const map=new Map(questions.map(q=>[q.id,q]));const rows=latestReviews(reviews).filter(r=>{const q=map.get(r.questionId);return q&&templateKey(q)===key;}).map(r=>({review:r,question:map.get(r.questionId)!,analysis:r.analysis||applyOverrides(parseReview(r.markdown),r.issueOverrides)}));
 const max=key==='small'?10:key==='englishTwoLarge'?15:20;
 const scored=rows.filter(x=>x.analysis.score.point!==null&&x.analysis.score.max===max&&x.analysis.score.point>=0&&x.analysis.score.point<=max);
 const categories=new Map<string,typeof rows>();let unclassified=0;
 for(const row of rows){const tags=new Set<string>();for(const issue of row.analysis.issues){if(issue.categories.includes('不计入问题'))continue;if(!issue.categories.length)unclassified++;for(const c of issue.categories)tags.add(c);}for(const c of tags)categories.set(c,[...(categories.get(c)||[]),row]);}
 return {rows,scored,average:scored.length?scored.reduce((n,r)=>n+r.analysis.score.point!,0)/scored.length:null,categories:[...categories.entries()].sort((a,b)=>b[1].length-a[1].length),unclassified,max};
}
