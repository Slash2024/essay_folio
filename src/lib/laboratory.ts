import type { ShortReviewItem, ShortReviewSource, ShortReviewAttempt, ShortReviewResult } from './short-review';

export interface MaterialSource extends ShortReviewSource {
  sourceType: 'review' | 'session';
  sourceId: string;
  signature: string;
  attempts: ShortReviewAttempt[];
  results: ShortReviewResult[];
}
export interface MaterialPack {
  id: string;
  version: 1;
  createdAt: string;
  title: string;
  reviewId: string;
  sourceWritingId: string;
  sourceType: MaterialSource['sourceType'];
  sourceId: string;
  directions: string;
  images: string[];
  item: ShortReviewItem;
  attempt: ShortReviewAttempt | null;
  result: ShortReviewResult | null;
}
export type MaterialOverview = {
  sources: { reviewId: string; title: string; createdAt: string }[];
  sessions: { id: string; title: string; createdAt: string }[];
  packs: Pick<MaterialPack, 'id' | 'title' | 'createdAt'>[];
};
export const FEEDBACK_EASE = [
  { id: 'smooth', label: '顺手' }, { id: 'effort', label: '要多花工夫' }, { id: 'blocked', label: '没能完成' },
] as const;
export const FEEDBACK_VALUE = [
  { id: 'helpful', label: '有帮助' }, { id: 'unclear', label: '还不确定' }, { id: 'unhelpful', label: '帮助不大' },
] as const;
export const FEEDBACK_FACTORS = {
  short: [
    { id: 'size', label: '任务量合适' }, { id: 'selection', label: '选材费力' },
    { id: 'comparison', label: '参考对照清楚' }, { id: 'mastery', label: '仍难判断是否掌握' },
    { id: 'resume', label: '保存或继续不顺' },
  ],
  materials: [
    { id: 'finding', label: '材料更好找' }, { id: 'comparison', label: '对照更清楚' },
    { id: 'notes', label: '相关笔记不足' }, { id: 'association', label: '材料关联不准确' },
    { id: 'volume', label: '内容太多' },
  ],
} as const;
export type FeedbackFeature = keyof typeof FEEDBACK_FACTORS;
export interface FeatureFeedback {
  id: string;
  version: 1;
  feature: FeedbackFeature;
  contextId: string | null;
  phase: 'selection' | 'practice' | 'result' | 'reading';
  ease: typeof FEEDBACK_EASE[number]['id'];
  value: typeof FEEDBACK_VALUE[number]['id'];
  factors: string[];
  createdAt: string;
}
