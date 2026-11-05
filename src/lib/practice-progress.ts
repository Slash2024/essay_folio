import type { EarnedMilestone } from './achievement-types';
import { LARGE_ESSAY_CATEGORIES, SMALL_ESSAY_CATEGORIES, questionCategories, type Question, type Writing } from './folio';

export const PRACTICE_GROUPS = [
  { id: 'one-large', label: '英语一 · 大作文', art: 'large' },
  { id: 'one-small', label: '英语一 · 小作文', art: 'small' },
  { id: 'two-large', label: '英语二 · 大作文', art: 'two' },
] as const;
export type PracticeGroup = typeof PRACTICE_GROUPS[number]['id'];
export type PracticeState = 'unstarted' | 'draft' | 'practiced' | 'reviewed';
export interface QuestionProgress {
  questionId: string;
  submittedCount: number;
  reviewedCount: number;
  draftCount: number;
  latestDraftId?: string;
  latestSubmittedId?: string;
  latestReviewedId?: string;
}
export interface PracticeProgress { questions: QuestionProgress[]; generatedAt: string; milestones?: EarnedMilestone[] }
export const practiceGroup = (q: Question) => `${q.exam || 'one'}-${q.type}`;
export const practiceState = (p?: QuestionProgress): PracticeState => p?.reviewedCount ? 'reviewed' : p?.submittedCount ? 'practiced' : p?.draftCount ? 'draft' : 'unstarted';
export const progressPercent = (done: number, total: number) => total ? Math.round(done / total * 100) : 0;
export function practiceCategories(group: PracticeGroup): readonly string[] {
  return group === 'one-large' ? LARGE_ESSAY_CATEGORIES : group === 'one-small' ? SMALL_ESSAY_CATEGORIES : ['柱状图','条形图','饼图','曲线图','表格','材料类'];
}

// Each writing ID contributes at most once. Revisions, snapshots and multiple
// imports of the same review never increase the submitted-writing count.
export function collectPracticeProgress(questions: Question[], writings: Writing[], reviews: { writingId: string }[], generatedAt = new Date().toISOString()): PracticeProgress {
  const result = new Map(questions.map(q => [q.id, { questionId: q.id, submittedCount: 0, reviewedCount: 0, draftCount: 0 } as QuestionProgress]));
  const reviewed = new Set(reviews.map(r => r.writingId));
  const unique = new Map<string, Writing>();
  for (const w of writings) {
    if (!unique.has(w.id) || w.updatedAt > unique.get(w.id)!.updatedAt) unique.set(w.id, w);
  }
  const ordered = [...unique.values()].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  for (const w of ordered) {
    const p = result.get(w.questionId);
    if (!p || !w.text?.trim()) continue;
    if (w.status === 'draft') { p.draftCount++; p.latestDraftId ??= w.id; }
    else if (w.status === 'submitted' || w.status === 'reviewed') {
      p.submittedCount++; p.latestSubmittedId ??= w.id;
      if (w.status === 'reviewed' || reviewed.has(w.id)) { p.reviewedCount++; p.latestReviewedId ??= w.id; }
    }
  }
  return { questions: [...result.values()], generatedAt };
}
export function summarizePractice(questions: Question[], progress: Map<string, QuestionProgress>) {
  let practiced = 0, reviewed = 0, submitted = 0, drafts = 0, rewritten = 0;
  for (const q of questions) {
    const p = progress.get(q.id);
    if (!p) continue;
    if (p.submittedCount) practiced++;
    if (p.reviewedCount) reviewed++;
    if (p.draftCount) drafts++;
    if (p.submittedCount > 1) rewritten++;
    submitted += p.submittedCount;
  }
  return { total: questions.length, practiced, reviewed, submitted, drafts, rewritten, percent: progressPercent(practiced, questions.length) };
}
export function categoryPractice(questions: Question[], category: string, progress: Map<string, QuestionProgress>) {
  return summarizePractice(questions.filter(q => questionCategories(q).includes(category)), progress);
}
