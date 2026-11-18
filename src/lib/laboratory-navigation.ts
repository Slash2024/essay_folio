import type { CallTaskId } from './exam-recall';
import type { OriginType } from './transfer-review';
export interface ShortEntry { sessionId?: string; reviewId?: string; noteIds?: string[] }
export interface MaterialEntry { packId?: string; sourceType?: 'review' | 'session'; sourceId?: string; noteId?: string }
export interface TransferEntry { originType: OriginType; originId: string; noteId?: string; targetReviewId?: string; targetNoteId?: string }
export type LabRoute =
  | { view: 'home' | 'survey' }
  | { view: 'callmap'; taskId?: CallTaskId }
  | { view: 'recall'; taskId?: CallTaskId; sessionId?: string }
  | { view: 'template'; sessionId?: string; expressionId?: string }
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

const LAB_ENTRY_VIEWS = ['home', 'survey', 'short', 'materials', 'transfer', 'callmap', 'recall', 'template'] as const;
export function labViewFromSearch(search: string): LabRoute['view'] | undefined {
  const value = new URLSearchParams(search).get('lab');
  return LAB_ENTRY_VIEWS.find(view => view === value);
}
