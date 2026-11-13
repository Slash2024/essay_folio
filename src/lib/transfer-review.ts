import type { ShortReviewItem, ShortReviewSource, ShortReviewAttempt, ShortReviewResult } from './short-review';
export type OriginType = 'review' | 'session' | 'pack';
export interface TransferSource extends ShortReviewSource {
  originType: OriginType;
  originId: string;
  questionId: string;
  signature: string;
}
export interface TransferMaterial {
  title: string;
  questionId: string;
  directions: string;
  images: string[];
  item: ShortReviewItem;
}
export interface TransferSession {
  id: string;
  version: 1;
  createdAt: string;
  originType: OriginType;
  originId: string;
  targetReviewId: string;
  origin: TransferMaterial;
  target: TransferMaterial;
}
export interface TransferProgress {
  session: TransferSession;
  hintUsed: boolean;
  attempt: (ShortReviewAttempt & { hintUsed: boolean }) | null;
  result: ShortReviewResult | null;
}
export interface TransferOverview {
  origins: { type: OriginType; id: string; title: string; createdAt: string }[];
  targets: { reviewId: string; questionId: string; title: string; createdAt: string }[];
  sessions: Pick<TransferSession, 'id' | 'createdAt'>[];
}
