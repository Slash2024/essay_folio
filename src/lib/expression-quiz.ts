export type QuizMode = 'meaning' | 'scenario';
export type QuizScope = 'all' | 'word' | 'sentence';
export type QuizVerdict = 'correct' | 'incorrect';
export interface QuizSource {
  key: string; kind: 'word' | 'sentence'; title: string; text: string;
  answers: string[]; meaning: string; scenario: string; signature: string;
}
export interface QuizQuestion {
  prompt: string; kind: 'word' | 'sentence'; slots: number; sources: QuizSource[];
}
export interface QuizSession {
  id: string; version: 1; createdAt: string; mode: QuizMode; scope: QuizScope;
  requestKey: string; librarySignature: string; retryOf: string | null; questions: QuizQuestion[];
}
export interface QuizAnswer {
  writingId: string; index: number; answer: string; skipped: boolean; verdict: QuizVerdict;
  matchedKey: string | null; reason: string; createdAt: string;
}
export interface QuizReview { writingId: string; index: number; createdAt: string }
export interface QuizCorrection { writingId: string; index: number; verdict: QuizVerdict; reason: string; createdAt: string }
export interface QuizPractice extends QuizAnswer { id: string }
export interface QuizScore {
  total: number; answered: number; correct: number; incorrect: number; skipped: number;
  pending: number; graded: number; accuracy: number | null; corrected: number; complete: boolean;
}
export interface QuizProgress {
  session: Pick<QuizSession, 'id' | 'createdAt' | 'mode' | 'scope' | 'retryOf'>;
  questions: { index: number; prompt: string; kind: 'word' | 'sentence'; slots: number }[];
  results: (QuizAnswer & { references: { key: string; title: string; text: string; answers: string[] }[]; pending: boolean; correction?: QuizCorrection })[];
  practices: QuizPractice[]; score: QuizScore;
}
export interface QuizHistory { id: string; createdAt: string; mode: QuizMode; scope: QuizScope; score: QuizScore }
export interface QuizOverview { signature: string; counts: Record<QuizMode, Record<QuizScope, number>>; excluded: number; sessions: QuizHistory[]; totalSessions: number; offset: number; hasNext: boolean }
export interface QuizCueConfig { key: string; sourceSignature: string; meaning: string; scenario: string; answers: string[]; revision: number; operationId: string }
export interface QuizCueEditor { key: string; title: string; text: string; kind: 'word' | 'sentence'; sourceSignature: string; meaning: string; scenario: string; answers: string[]; revision: number; stale: boolean }
export const QUIZ_MODES = { meaning: '中文释义', scenario: '情景描述' } as const;
export const QUIZ_SCOPES = { all: '全部', word: '单词／短语', sentence: '句式' } as const;
export const QUIZ_REVIEW_REASONS = ['可接受的同义表达', '可接受的词形或句式变体', '题干不够明确', '原判定正确，保留结果'] as const;

// Recitation checks the fixed skeleton only. Explicit slots, not arbitrary text,
// may replace variable positions; it never judges grammar inside a filled slot.
export function quizTokens(text: string): string[] {
  return text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, '-')
    .replace(/\{\{[\s\S]*?\}\}|\[[^\]\n]+\]|\.{3,}|…+|_{2,}/g, ' __slot__ ')
    .toLowerCase().match(/__slot__|[a-z0-9]+(?:['-][a-z0-9]+)*/g)?.filter((token, index, all) => token !== '__slot__' || all[index - 1] !== '__slot__') ?? [];
}
export function slotCount(text: string) { return quizTokens(text).filter(t => t === '__slot__').length; }
export function gradeQuiz(question: QuizQuestion, answer: string, skipped = false) {
  if (skipped) return { verdict: 'incorrect' as const, matchedKey: null, reason: '本次选择“想不起来”，按未答对记录。' };
  if (/[\u3400-\u9fff]/.test(answer.replace(/\{\{[\s\S]*?\}\}|\[[^\]\n]+\]/g, ''))) return { verdict: 'incorrect' as const, matchedKey: null, reason: '英文答案中出现中文内容；请只写英文固定部分，用 ___ 表示可变位置。' };
  const tokens = quizTokens(answer), key = tokens.join(' ');
  for (const source of question.sources) {
    if (source.answers.some(value => quizTokens(value).join(' ') === key)) return { verdict: 'correct' as const, matchedKey: source.key, reason: question.slots ? '固定骨架与已收录答案一致；本题未检查槽位内容的语法。' : '与已收录的表达或可接受变体一致。' };
  }
  const expected = quizTokens(question.sources[0].text);
  const reason = question.slots && tokens.filter(t => t === '__slot__').length !== question.slots
    ? `本题默写固定骨架，请用 ___ 标记 ${question.slots} 个可变位置。具体填入内容不在本题自动判分范围内。`
    : tokens.length < expected.length ? '未匹配已收录答案，可能有漏词或拼写差异；请对照标出的变化。'
    : '未匹配已收录答案，请核对拼写、词形、词序和固定搭配。合理的其他表达可申请复核。';
  return { verdict: 'incorrect' as const, matchedKey: null, reason };
}
export function quizScore(total: number, answers: QuizAnswer[], reviews: QuizReview[], corrections: QuizCorrection[]): QuizScore {
  let correct = 0, incorrect = 0, pending = 0, skipped = 0, corrected = 0;
  for (const answer of answers) {
    const correction = corrections.find(c => c.index === answer.index);
    if (answer.skipped) skipped++;
    if (reviews.some(r => r.index === answer.index) && !correction) { pending++; continue; }
    const verdict = correction?.verdict ?? answer.verdict;
    if (correction) corrected++;
    if (verdict === 'correct') correct++; else incorrect++;
  }
  const graded = correct + incorrect;
  return { total, answered: answers.length, correct, incorrect, skipped, pending, graded, accuracy: graded ? Math.round(correct / graded * 1000) / 10 : null, corrected, complete: answers.length === total };
}
