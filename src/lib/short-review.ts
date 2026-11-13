export interface ShortReviewItem {
  noteId: string;
  original: string;
  reference: string;
  explanation: string;
  context: string;
  personalNotes: string[];
}
export interface ShortReviewSource {
  reviewId: string;
  writingId: string;
  title: string;
  directions: string;
  images: string[];
  revision: number;
  items: ShortReviewItem[];
}
export interface ShortReviewSession extends ShortReviewSource {
  id: string;
  createdAt: string;
  version: 1;
}
export type SelfAssessment = 'understood' | 'uncertain';
export interface ShortReviewAttempt {
  index: number;
  answer: string;
  unable: boolean;
  createdAt: string;
}
export interface ShortReviewResult {
  index: number;
  assessment: SelfAssessment;
  createdAt: string;
}
export interface ShortReviewProgress {
  session: ShortReviewSession;
  attempts: ShortReviewAttempt[];
  results: ShortReviewResult[];
}
export interface ShortReviewOverview {
  sources: { reviewId: string; questionId: string; writingId: string; title: string; createdAt: string }[];
  sessions: { id: string; title: string; createdAt: string }[];
}
