import type { QuizRange } from './expression-quiz';
export const RECALL_SCOPES = { large: '大作文', small: '小作文', both: '大小作文通用', other: '其他表达' } as const;
export type RecallScope = keyof typeof RECALL_SCOPES;
export interface RecallExpression { key: string; kind: 'sentence' | 'word'; id: string; title: string; category: string; text: string; notes: string; substitutions: string; signature: string }
export interface RecallBinding { expression: RecallExpression; applies: string; variables: string; example: string }
// Optional provenance fields deserialize historical card snapshots as-is.
export interface RecallCard { sourceKey?: string; mapId?: string; mapRevision?: number; taskId: string; label: string; scope: RecallScope; cue: string; primary: RecallBinding; backup: RecallBinding | null }
export interface RecallSession { id: string; version: 1 | 2; createdAt: string; requestKey: string; cards: RecallCard[]; range?: QuizRange }
export const RECALL_ASSESSMENTS = { independent: '独立想起', prompted: '提示后想起', unrecalled: '暂未想起' } as const;
export type RecallAssessment = keyof typeof RECALL_ASSESSMENTS;
export interface RecallResult { writingId: string; index: number; assessment: RecallAssessment; createdAt: string }
export interface RecallProgress {
  session: { id: string; createdAt: string; total: number };
  cards: { index: number; taskId: string; label: string; cue: string; scope: RecallScope }[];
  hints: { index: number; text: string }[];
  reveals: { index: number; recalled: boolean; primary: RecallBinding; backup: RecallBinding | null }[];
  results: RecallResult[];
}
export interface RecallOverview { signature: string; ranges: (QuizRange & { count: number })[]; sessions: { id: string; createdAt: string; count: number }[] }
export function expressionParts(text: string) { return text.split(/(\{\{[\s\S]*?\}\}|\[[^\]\n]+\]|\.{3,}|…+|\b(?:sb|sth)\b\.?)/gi).filter(Boolean).map(part => ({ text: part, variable: /^(?:\{\{|\[|\.{3}|…|(?:sb|sth)\b)/i.test(part) })); }
