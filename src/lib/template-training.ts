import type { Question } from './folio';
import type { SentenceEntry } from './expressions';
export const TRAINING_MODES = { picture: '图画类', chart: '图表类', material: '材料类', small: '应用文' } as const;
export type TrainingMode = keyof typeof TRAINING_MODES;
export const TEMPLATE_DECISIONS = { keep: '可保留', adapt: '需改写', skip: '不适用' } as const;
export type TemplateDecision = keyof typeof TEMPLATE_DECISIONS;
export const TEMPLATE_CHECKS = [
  { id: 'topic', title: '主题与对象', prompt: '主题词、人物或对象是否对应本题，而非只换了标签？' },
  { id: 'reference', title: '指代与语气', prompt: '代词有明确所指，语气符合本题身份、对象和场合吗？' },
  { id: 'support', title: '论据与展开', prompt: '理由、例子或具体行动能支撑本题，避免泛泛而谈吗？' },
  { id: 'task', title: '任务回应', prompt: '这一两句承担的任务明确，并回应了你确认的本题要点吗？' },
] as const;
export const CHECK_VALUES = { matched: '已对应', revise: '需调整', uncertain: '不确定', na: '本句不涉及' } as const;
export type TemplateChecks = Record<typeof TEMPLATE_CHECKS[number]['id'], keyof typeof CHECK_VALUES>;
export interface TemplateSession { id: string; version: 1; createdAt: string; mode: TrainingMode; expression: SentenceEntry; questions: Question[] }
export interface TemplateAttempt { writingId: string; index: number; decision: TemplateDecision; task: string; answer: string; unable: boolean; hintUsed: boolean; elapsedSeconds: number; createdAt: string }
export interface TemplateResult { writingId: string; index: number; checks: TemplateChecks; createdAt: string }
export interface TemplateProgress { session: TemplateSession; validation: Question | null; hintUsed: boolean; attempts: TemplateAttempt[]; results: TemplateResult[] }
export interface TemplateOverview { signature: string; expressions: SentenceEntry[]; questions: Question[]; sessions: { id: string; title: string; createdAt: string }[] }
export function trainingMode(q: Question): TrainingMode { return q.type === 'small' ? 'small' : q.topicCategories?.includes('材料类') ? 'material' : q.chartType || /\b(?:charts?|tables?|graphs?)\b/i.test(q.directions) ? 'chart' : 'picture'; }
export function trainingSignals(attempt: TemplateAttempt, previous: TemplateAttempt[]) {
  const signals: string[] = [];
  if (attempt.unable) return ['本题暂未写出关键句，保留为后续练习。'];
  if (/\{\{[\s\S]*?\}\}|\[[A-Za-z][^\]\n]{0,60}\]|\b(?:sb|sth)\b/i.test(attempt.answer)) signals.push('检测到可能未替换的模板空位，请核对。');
  if (previous.some(item => !item.unable && item.answer.replace(/\s+/g, ' ').trim().toLowerCase() === attempt.answer.replace(/\s+/g, ' ').trim().toLowerCase())) signals.push('与本轮另一题的回答完全相同，请核对是否适合不同题意。');
  if (/\b(?:it|they|this|that|these|those|he|she|we|you)\b/i.test(attempt.answer)) signals.push('包含代词或指示词，请逐一核对所指和写信身份。');
  if (attempt.decision === 'skip') signals.push('你选择了不使用该模板，请按本题任务检查替代表达。');
  return signals.length ? signals : ['未发现空位或整句重复信号；是否切题仍需结合题面逐项核对。'];
}
