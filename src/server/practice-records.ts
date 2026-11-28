import {all, decode, find} from './archive';
import type {Question, Review, Writing} from '../lib/folio';
import type {WritingVersion} from '../lib/revisions';
import {DEFAULT_EXPRESSIONS, type ExpressionLibrary} from '../lib/expressions';
import {summarizePracticeRecords} from '../lib/practice-records';

export async function practiceRecordSummaries(writings: Writing[], questions: Question[]) {
  if (!writings.some(writing => writing.status !== 'draft')) return summarizePracticeRecords(writings, [], [], questions, DEFAULT_EXPRESSIONS);
  const [reviewRows, versionRows, expressionRow] = await Promise.all([all('review'), all('revision'), find('expression-library')]);
  const ids = new Set(writings.map(writing => writing.id));
  const reviews = reviewRows.filter(row => ids.has(row.writingId)).map(row => decode<Review>(row));
  const versions = versionRows.filter(row => ids.has(row.writingId)).map(row => decode<WritingVersion>(row));
  return summarizePracticeRecords(writings, reviews, versions, questions,
    expressionRow ? decode<ExpressionLibrary>(expressionRow) : DEFAULT_EXPRESSIONS);
}
