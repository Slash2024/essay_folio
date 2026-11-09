import type {ReviewAnalysis} from './review-analysis';
import type {AlignmentPair,AlignmentStore} from './annotation-alignment';
import {alignmentParts,currentAlignment} from './annotation-alignment';
import {wordDiff} from './revisions';

export const FULL_ESSAY_ALIGNMENT_ID='full-essay';
export const FULL_ESSAY_ALIGNMENT_LIMIT=6000;

export function fullEssayInput(original:string,analysis:ReviewAnalysis){
 const revised=analysis.revisedEssay;
 if(!original.trim()||!revised?.trim()||original===revised||
  original.length>FULL_ESSAY_ALIGNMENT_LIMIT||revised.length>FULL_ESSAY_ALIGNMENT_LIMIT)return null;
 return {
  original,revised,display:'essay',start:0,end:original.length,
  explanation:'对照批阅对应原文与批阅第六部分的完整修改作文，按修改成分划分展示片段。'
 };
}

export function essayComparisonParts(original:string,revised:string,alignments?:AlignmentStore){
 const pair:AlignmentPair={original,revised,display:'essay'};
 const active=currentAlignment(alignments,FULL_ESSAY_ALIGNMENT_ID,pair);
 return active?alignmentParts(active.segments):wordDiff(original,revised);
}
