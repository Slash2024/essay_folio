import type { EarnedMilestone } from '../lib/achievement-types';
import { gradeQuiz, quizTokens, type QuizSession, type QuizAnswer, type QuizReview, type QuizCorrection, type QuizSource } from '../lib/expression-quiz';

export interface QuizAchievementStats {
  attempts: number; correctExpressions: number; recoveredExpressions: number;
  wordExpressions: number; sentenceExpressions: number; meaningExpressions: number;
  scenarioExpressions: number; coveredCategories: number;
}
const recordKey = (row: {writingId: string; index: number}) => JSON.stringify([row.writingId, row.index]);
const timestamp = (value: string) => Date.parse(value);

// Read initial-answer records only. Supplementary practice and report snapshots
// are deliberately not inputs; a report revision cannot create another attempt.
export function collectQuizAchievements(sessions: QuizSession[], answers: QuizAnswer[], reviews: QuizReview[], corrections: QuizCorrection[]): QuizAchievementStats {
  const rounds = new Map(sessions.map(s => [s.id, s]));
  const initial = new Map<string, QuizAnswer>();
  for (const a of answers) {
    const old = initial.get(recordKey(a));
    if (!old || timestamp(a.createdAt) < timestamp(old.createdAt)) initial.set(recordKey(a), a);
  }
  const final = new Map<string, QuizCorrection>();
  for (const c of corrections) {
    const old = final.get(recordKey(c));
    if (!old || timestamp(c.createdAt) > timestamp(old.createdAt)) final.set(recordKey(c), c);
  }
  const pending = new Set(reviews.map(recordKey));
  const correct = new Set<string>(), recovered = new Set<string>();
  const words = new Set<string>(), sentences = new Set<string>();
  const meaning = new Set<string>(), scenario = new Set<string>();
  const categories = new Map<string, string>();
  const failures = new Map<string, {session: string; time: number}[]>();
  let attempts = 0;
  const events = [...initial.values()].sort((a,b) => timestamp(a.createdAt) - timestamp(b.createdAt));
  for (const a of events) {
    const session = rounds.get(a.writingId);
    if (!session || !Number.isInteger(a.index) || a.index < 0) continue;
    const question = session.questions[a.index];
    if (!question?.sources?.length) continue;
    const effective = !a.skipped && typeof a.answer === 'string' && /[a-z]/i.test(a.answer.trim());
    if (effective) attempts++;
    const correction = final.get(recordKey(a));
    if (pending.has(recordKey(a)) && !correction) continue;
    const success = effective && (correction?.verdict ?? a.verdict) === 'correct';
    // A grouped prompt may accept several expressions, but one answer can only
    // earn one source. An ambiguous manually accepted answer earns effort only.
    let source: QuizSource | undefined = question.sources.find(s => s.key === a.matchedKey);
    if (!source && effective) source = question.sources.find(s => s.key === gradeQuiz(question, a.answer).matchedKey);
    if (!source && question.sources.length === 1) source = question.sources[0];
    if (!source?.key || !['word','sentence'].includes(source.kind)) continue;
    const version = JSON.stringify([source.key, quizTokens(source.text)]);
    const time = timestamp(a.createdAt), started = timestamp(session.createdAt);
    if (!success) {
      if (Number.isFinite(time)) {
        const previous = failures.get(version) ?? [];
        previous.push({session: session.id, time}); failures.set(version, previous);
      }
      continue;
    }
    correct.add(source.key);
    (source.kind === 'word' ? words : sentences).add(source.key);
    if (session.mode === 'meaning') meaning.add(source.key);
    if (session.mode === 'scenario') scenario.add(source.key);
    if (Number.isFinite(started) && Number.isFinite(time) && (failures.get(version) ?? []).some(f => f.session !== session.id && f.time < started && started <= time)) recovered.add(source.key);
    const main = source.category?.main?.trim(), sub = source.category?.sub?.trim();
    if (main && sub && !/未分类|未细分/.test(main + sub)) categories.set(source.key, JSON.stringify([main, sub]));
  }
  const categoryCounts = new Map<string, number>();
  for (const category of categories.values()) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  return {attempts, correctExpressions: correct.size, recoveredExpressions: recovered.size, wordExpressions: words.size, sentenceExpressions: sentences.size, meaningExpressions: meaning.size, scenarioExpressions: scenario.size, coveredCategories: [...categoryCounts.values()].filter(n => n >= 5).length};
}

export function earnedQuizMilestones(s: QuizAchievementStats): EarnedMilestone[] {
  const rules: (EarnedMilestone & {earned: boolean})[] = [
    ...([
      ['E01','开卷唤词',10], ['E02','百答成习',100],
      ['E03','往复成诵',300], ['E04','词海行舟',500],
    ] as const).map(([id,title,rank]) => ({id,title,rank,group:'表达抽背',family:'quiz-attempts',detail:`累计完成 ${rank} 次有效初答。`,earned:s.attempts >= rank})),
    ...([
      ['E05','拾词成串',10], ['E06','词句渐熟',30], ['E07','百语在心',100],
    ] as const).map(([id,title,rank]) => ({id,title,rank,group:'表达抽背',family:'quiz-independent',detail:`独立答对 ${rank} 条不同表达。`,earned:s.correctExpressions >= rank})),
    ...([
      ['E08','失而复得',5], ['E09','旧误新解',20],
    ] as const).map(([id,title,rank]) => ({id,title,rank,group:'表达抽背',family:'quiz-recovered',detail:`累计将 ${rank} 条曾答错或跳过的表达，在新一轮中独立答对。`,earned:s.recoveredExpressions >= rank})),
    {id:'E10',title:'词式兼修',rank:1,group:'表达抽背',family:'quiz-kinds',detail:'分别独立答对 10 条词条与 10 条句式。',earned:s.wordExpressions >= 10 && s.sentenceExpressions >= 10},
    {id:'E11',title:'两路唤回',rank:1,group:'表达抽背',family:'quiz-modes',detail:'中文释义与情景描述模式各独立答对 10 条不同表达。',earned:s.meaningExpressions >= 10 && s.scenarioExpressions >= 10},
    {id:'E12',title:'分径寻章',rank:1,group:'表达抽背',family:'quiz-categories',detail:'在 5 个二级分类中，各独立答对 5 条不同表达。',earned:s.coveredCategories >= 5},
  ];
  return rules.filter(r => r.earned).map(({earned: _earned,...rule}) => rule);
}
