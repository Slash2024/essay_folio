import {useMemo} from 'react';
import type {Review} from '../../lib/folio';
import type {ReviewAnalysis} from '../../lib/review-analysis';
import {essayComparisonParts,fullEssayInput,FULL_ESSAY_ALIGNMENT_ID,FULL_ESSAY_ALIGNMENT_LIMIT} from '../../lib/essay-comparison';
import SentenceChanges from './AnnotatedText';
import AnnotationOptimizer from './AnnotationOptimizer';

interface Props {
 original:string;
 analysis:ReviewAnalysis;
 review:Review;
 onChange:(review:Review)=>void;
 onSetup?:()=>void;
}

export default function AnnotatedEssay({original,analysis,review,onChange,onSetup}:Props){
 const revised=analysis.revisedEssay;
 const pair=useMemo(()=>fullEssayInput(original,analysis),[original,analysis]);
 const parts=useMemo(()=>revised?essayComparisonParts(original,revised,review.alignments):[],[original,revised,review.alignments]);
 if(!original||!revised)return <p className="study-empty">缺少批阅对应原文或第六部分的完整修改作文，请核对批阅文件。</p>;
 return <>
  <div className="study-annotation-diff english">
   <span className="sentence-body"><SentenceChanges parts={parts}/></span>
  </div>
  {pair&&<AnnotationOptimizer
   key={JSON.stringify([review.id,pair.original,pair.revised])}
   scope="essay" review={review} noteId={FULL_ESSAY_ALIGNMENT_ID}
   pair={pair} disabled={false} onChange={onChange} onSetup={onSetup}
  />}
  {(original.length>FULL_ESSAY_ALIGNMENT_LIMIT||revised.length>FULL_ESSAY_ALIGNMENT_LIMIT)&&
   <p className="caption">全文超过 LLM 标注优化的长度上限，当前按词组规则展示。</p>}
 </>;
}
