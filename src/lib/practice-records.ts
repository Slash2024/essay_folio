import {templateKey, type Question, type Review, type Writing} from './folio';
import type {WritingVersion} from './revisions';
import type {ExpressionLibrary} from './expressions';
import {latestReviews} from './analytics';
import {applyOverrides, parseReview} from './review-analysis';
import {curatedNotes} from './review-curation';
import {buildTemplateReview, type TemplateEvidence} from './template-review';

export interface PracticeRecordSummary {
  reviewId: string | null;
  progress: {reviewed: number; total: number; percent: number} | null;
  templateErrors: TemplateEvidence[] | null;
  templateUnlocated: number;
}

/** A read-only view of the latest review; never create missing history or scores. */
export function summarizePracticeRecords(writings: Writing[], reviews: Review[], versions: WritingVersion[],
  questions: Question[], library: ExpressionLibrary): Record<string, PracticeRecordSummary> {
  const latest = new Map(latestReviews(reviews).map(review => [review.writingId, review]));
  const versionMap = new Map(versions.map(version => [version.id, version]));
  const questionMap = new Map(questions.map(question => [question.id, question]));
  const summaries: Record<string, PracticeRecordSummary> = {};
  for (const writing of writings) {
    const review = writing.status === 'draft' ? undefined : latest.get(writing.id);
    const summary: PracticeRecordSummary = {reviewId: review?.id || null, progress: null, templateErrors: null, templateUnlocated: 0};
    summaries[writing.id] = summary;
    if (!review || review.questionId !== writing.questionId) continue;
    // Reparse the current Markdown, while retaining stable note IDs and owner edits.
    const analysis = applyOverrides(parseReview(review.markdown), review.issueOverrides);
    const currentReview = {...review, analysis};
    const notes = curatedNotes(analysis, review.curation).filter(note => !note.hidden);
    const reviewed = notes.filter(note => ['revisit', 'mastered'].includes(review.study?.entries[note.id]?.status || 'unread')).length;
    summary.progress = {reviewed, total: notes.length, percent: notes.length ? Math.round(reviewed / notes.length * 100) : 0};
    const question = questionMap.get(writing.questionId) || writing.questionSnapshot;
    const bound = review.revisionId ? versionMap.get(review.revisionId) : undefined;
    // A missing/mismatched immutable source cannot mean zero template errors.
    if (!question || !bound || bound.writingId !== writing.id || bound.questionId !== writing.questionId) continue;
    const result = buildTemplateReview([currentReview], [question], templateKey(question), library,
      {[review.id]: bound.text}, {[writing.id]: writing.text});
    summary.templateErrors = [...new Map(result.groups.flatMap(group => group.evidence).map(item => [item.id, item])).values()];
    summary.templateUnlocated = result.unlocated;
  }
  return summaries;
}
