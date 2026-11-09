import {Fragment,useMemo} from 'react';
import type {Review} from '../../lib/folio';
import type {ReviewAnalysis} from '../../lib/review-analysis';
import {curatedNotes} from '../../lib/review-curation';
import {readingRows,locateReviewNotes,sentenceDisplays} from '../../lib/sentence-reading';
import ReadingSentenceText,{CrossSentenceRevisions} from './ReadingSentenceText';

export default function AnnotatedEssay({original,analysis,review}:{original:string;analysis:ReviewAnalysis;review:Review}){
 const displays=useMemo(()=>{
  const rows=readingRows(original,review.study?.layout).rows;
  const notes=curatedNotes(analysis,review.curation);
  const located=locateReviewNotes(original,notes,review.study);
  return {located,rows:sentenceDisplays(original,rows,located,review.alignments)};
 },[original,analysis,review.study,review.curation,review.alignments]);
 return <div className="study-annotation-diff english">
  {displays.rows.map((display,index)=>{
   const previous=displays.rows[index-1];
   const next=displays.rows[index+1];
   const sectionEnd=!next||next.row.section!==display.row.section;
   return <Fragment key={display.row.id}>
    {original.slice(previous?.row.end||0,display.row.start)}
    <ReadingSentenceText display={display}/>
    {sectionEnd&&<CrossSentenceRevisions
     items={displays.rows.filter(d=>d.row.section===display.row.section)}
     displays={displays.rows}
     located={displays.located}
    />}
   </Fragment>;
  })}
  {original.slice(displays.rows.at(-1)?.row.end||0)}
 </div>;
}
