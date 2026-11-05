import type {Question,Review,Writing} from './folio';
import {parseReview} from './review-analysis';
import {curatedNotes} from './review-curation';
import type {ReviewNote,StudyEntry} from './review-interactions';

export interface SavedBookmark {
 key:string; writingId:string; reviewId:string; noteId:string;
 reviewLabel:string; reviewCreatedAt:string; writingVersion:number|null;
 studyRevision:number; entry:StudyEntry; note:ReviewNote|null;
 question:Pick<Question,'id'|'year'|'exam'|'type'|'title'>|null;
}

export function collectBookmarks(writings:Writing[],reviews:Review[],questions:Question[]):SavedBookmark[]{
 const writingMap=new Map(writings.map(w=>[w.id,w])),questionMap=new Map(questions.map(q=>[q.id,q]));
 const result:SavedBookmark[]=[];
 for(const review of reviews){
  const writing=writingMap.get(review.writingId);
  if(!writing)continue; // Deleted records must never reappear via surviving review rows.
  const starred=Object.entries(review.study?.entries||{}).filter(([,entry])=>entry.starred);
  if(!starred.length)continue;
  const notes=new Map(curatedNotes(parseReview(review.markdown),review.curation).map(n=>[n.id,n]));
  const q=writing.questionSnapshot||questionMap.get(review.questionId);
  for(const [noteId,entry] of starred)result.push({
   key:`${review.id}:${noteId}`,writingId:writing.id,reviewId:review.id,noteId,
   reviewLabel:review.label,reviewCreatedAt:review.createdAt,writingVersion:review.writingRevision??null,
   studyRevision:review.study?.revision||0,entry,note:notes.get(noteId)||null,
   question:q?{id:q.id,year:q.year,exam:q.exam,type:q.type,title:q.title}:null,
  });
 }
 return result.sort((a,b)=>b.reviewCreatedAt.localeCompare(a.reviewCreatedAt)||a.key.localeCompare(b.key));
}
