import {Fragment} from 'react';
import {translationAnswerCorrections} from '../../lib/translation-corrections';
import type {SentenceReview} from '../../lib/translation-review';

export default function CorrectedTranslationAnswer({answer,review}:{answer:string;review:SentenceReview}){
 const corrections=translationAnswerCorrections(answer,review);
 let at=0;
 return <>{corrections.map(correction=>{
  const unchanged=answer.slice(at,correction.start);at=correction.end;
  return <Fragment key={`${correction.start}:${correction.end}`}>{unchanged}<del className="tr-answer-deletion">{answer.slice(correction.start,correction.end)}</del><ins className="tr-answer-insertion">{correction.replacement}</ins></Fragment>;
 })}{answer.slice(at)}</>;
}
