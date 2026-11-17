import type { OriginType } from './transfer-review';
export interface ShortEntry { sessionId?: string; reviewId?: string; noteIds?: string[] }
export interface MaterialEntry { packId?: string; sourceType?: 'review' | 'session'; sourceId?: string; noteId?: string }
export interface TransferEntry { originType: OriginType; originId: string; noteId?: string; targetReviewId?: string; targetNoteId?: string }
export type LabRoute =
  | { view: 'home' | 'survey' }
  | { view: 'template'; sessionId?: string }
  | { view: 'short'; entry?: ShortEntry }
  | { view: 'materials'; entry?: MaterialEntry }
  | { view: 'transfer'; entry?: TransferEntry; sessionId?: string };
export interface LabQueueItem {
  key: string;
  title: string;
  detail: string;
  createdAt: string;
  status: 'unfinished' | 'revisit';
  route: LabRoute;
}
