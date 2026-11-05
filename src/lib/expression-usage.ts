import type { Writing } from './folio';
import type { ExpressionLibrary } from './expressions';
import { isApproximateMatch, matchExpressions, type ExpressionMatch, type TextSpan } from './expression-matcher';

export interface ExpressionUsageCount { occurrences:number; writings:number; approximate:number }
export interface ExpressionUsage {
  revision:number; libraryUpdatedAt:string|null; computedAt:string; writingCount:number;
  entries:Record<string,ExpressionUsageCount>;
}
export interface ExpressionUsageOccurrence {
  writingId:string; questionId:string; status:Writing['status']; revision:number; updatedAt:string;
  approximate:boolean; reasons:string[]; context:string; spans:TextSpan[]; leading:boolean; trailing:boolean;
}
export interface ExpressionUsageDetails {
  revision:number; total:number; writingCount:number; offset:number; hasNext:boolean;
  items:ExpressionUsageOccurrence[];
}

// Only current writing records participate: no revisions, snapshots or review text.
function eligibleWritings(writings:Writing[]) {
  const current=new Map<string,Writing>();
  for(const w of writings){
    const prior=current.get(w.id);
    if(!prior||w.updatedAt>prior.updatedAt||(w.updatedAt===prior.updatedAt&&(w.revision||1)>(prior.revision||1)))current.set(w.id,w);
  }
  return [...current.values()].filter(w=>(w.status==='submitted'||w.status==='reviewed')&&w.text.trim())
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
}

export function collectExpressionUsage(writings:Writing[],library:ExpressionLibrary):ExpressionUsage {
  const entries:Record<string,ExpressionUsageCount>=Object.create(null);
  for(const e of [...library.sentences,...library.words])if(e.enabled)entries[e.id]={occurrences:0,writings:0,approximate:0};
  const eligible=eligibleWritings(writings);
  for(const w of eligible){
    const used=new Set<string>();
    for(const m of matchExpressions(w.text,library)){
      const count=entries[m.entryId];count.occurrences++;
      if(isApproximateMatch(m))count.approximate++;
      used.add(m.entryId);
    }
    for(const id of used)entries[id].writings++;
  }
  return {revision:library.revision,libraryUpdatedAt:library.updatedAt,computedAt:new Date().toISOString(),writingCount:eligible.length,entries};
}

function occurrence(w:Writing,m:ExpressionMatch):ExpressionUsageOccurrence {
  const start=Math.max(0,m.spans[0].start-85),end=Math.min(w.text.length,m.spans.at(-1)!.end+85);
  return {writingId:w.id,questionId:w.questionId,status:w.status,revision:w.revision||1,updatedAt:w.updatedAt,
    approximate:isApproximateMatch(m),reasons:m.reasons,context:w.text.slice(start,end),
    spans:m.spans.map(s=>({start:s.start-start,end:s.end-start})),leading:start>0,trailing:end<w.text.length};
}

export function expressionUsageDetails(writings:Writing[],library:ExpressionLibrary,entryId:string,offset=0,limit=20):ExpressionUsageDetails {
  const selected={...library,sentences:library.sentences.filter(e=>e.id===entryId),words:library.words.filter(e=>e.id===entryId)};
  const items:ExpressionUsageOccurrence[]=[];let total=0,writingCount=0;
  for(const w of eligibleWritings(writings)){
    const matches=matchExpressions(w.text,selected);if(matches.length)writingCount++;
    for(const m of matches){if(total>=offset&&items.length<limit)items.push(occurrence(w,m));total++;}
  }
  return {revision:library.revision,total,writingCount,offset,hasNext:offset+items.length<total,items};
}
