import seed from '../data/expressions.json';
import { DEFAULT_EXPRESSIONS, type ExpressionLibrary } from '../lib/expressions';
import { SENTENCE_QUIZ_CUES, WORD_SCENARIOS } from '../lib/expression-quiz-cues';
import { gradeQuiz, quizScore, slotCount, QUIZ_REVIEW_REASONS, type QuizSource, type QuizQuestion, type QuizSession, type QuizAnswer, type QuizReview, type QuizCorrection, type QuizPractice, type QuizProgress, type QuizOverview, type QuizCueConfig, type QuizCueEditor, type QuizMode, type QuizScope, type QuizCuePack, type QuizRange } from '../lib/expression-quiz';
import { interactionId } from '../lib/review-interactions';
import { all, decode, find, list, put } from './archive';
import { ShortReviewError, identifier } from './short-review';
export const QUIZ_KIND = 'labQuizSession';
const ANSWER = 'labQuizAnswer', REVIEW = 'labQuizReview', CORRECTION = 'labQuizCorrection', PRACTICE = 'labQuizPractice', CUE = 'labQuizCue', REPORT = 'labQuizReport';
const canonical = (value: unknown) => JSON.stringify(value, (key, v) => key === 'createdAt' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const signature = (v: unknown) => interactionId('quiz-source', JSON.stringify(v));
const uuid = (v: unknown, prefix: string) => { const id = identifier(v); if (!new RegExp(`^${prefix}-[a-f0-9-]{36}$`).test(id)) throw new ShortReviewError('抽背编号不正确。'); return id; };
const cueId = (key: string) => interactionId('lab-quiz-cue', key);
// Use stored taxonomy, never infer a writing task from an English term. Imported
// words without taxonomy retain their documented source and a general-word bin.
function categoryOf(item: { category?: unknown; kind: string; meaning?: string }): QuizRange {
  const parts = typeof item.category === 'string' ? item.category.split(/[/／]/).map(s => s.trim()).filter(Boolean) : [];
  if (parts.length) return { main: parts[0], sub: parts[1] || '未细分' };
  const source = item.meaning?.match(/[（(]\s*来源[：:]([^\n]*)[）)]\s*$/)?.[1];
  return { main: source?.includes('大作文') ? '大作文' : source?.includes('小作文') ? '小作文' : '未分类', sub: item.kind === 'word' ? '通用词条' : '未细分' };
}
const inRange = (source: QuizSource, range?: QuizRange) => !range?.main || source.category?.main === range.main && (!range.sub || source.category.sub === range.sub);
function readRange(value: unknown): QuizRange | undefined {
  if (value === undefined) return undefined; // Existing clients and rounds keep their scope semantics.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShortReviewError('请选择有效的一级与二级分类。');
  const { main, sub } = value as Record<string, unknown>;
  if (typeof main !== 'string' || typeof sub !== 'string' || main.length > 200 || sub.length > 200 || main !== main.trim() || sub !== sub.trim() || !main && !!sub) throw new ShortReviewError('请选择有效的一级与二级分类。');
  return { main, sub };
}
function cueText(v: unknown) {
  if (typeof v !== 'string' || v.length > 900 || v.trim() && (!/[\u3400-\u9fff]/.test(v) || /[A-Za-z]/.test(v))) throw new ShortReviewError('提示请用中文描述，不放入英文或英文缩写；每项最多900字。');
  return v.trim();
}
async function once(id: string, kind: string, value: object) {
  const check = (row: NonNullable<Awaited<ReturnType<typeof find>>>) => { if (row.kind !== kind || canonical(decode(row)) !== canonical(value)) throw new ShortReviewError('这次操作已经保存了其他内容，请重新读取。', 409); };
  const old = await find(id); if (old) { check(old); return; }
  try { await put(id, kind, value); } catch (error) { const row = await find(id); if (!row) throw error; check(row); }
}
async function sources() {
  const [row, cueRows, packRow] = await Promise.all([find('expression-library'), all(CUE), find('lab-quiz-cue-pack')]);
  const library = row ? decode<ExpressionLibrary>(row) : DEFAULT_EXPRESSIONS;
  if (packRow && packRow.kind !== 'labQuizCuePack') throw new ShortReviewError('抽背提示资料类型不正确。', 503);
  const pack = packRow ? decode<QuizCuePack>(packRow) : null;
  const reviewed = new Map((pack?.version === 1 ? pack.entries : []).map(entry => [entry.key, entry]));
  const configs = new Map(cueRows.map(row => { const c = decode<QuizCueConfig>(row); return [c.key, c]; }));
  const entries: QuizCueEditor[] = [], pool: QuizSource[] = [];
  for (const item of [...library.sentences.map(s => ({ ...s, kind: 'sentence' as const })), ...library.words.map(w => ({ ...w, kind: 'word' as const }))]) {
    if (!item.enabled) continue;
    const key = `${item.kind}:${item.id}`, text = item.kind === 'word' ? item.term : item.template;
    const answers = item.kind === 'word' ? [item.term, ...item.forms] : [item.template];
    const sourceSignature = signature(item), config = configs.get(key), current = config?.sourceSignature === sourceSignature;
    const defaults = item.kind === 'sentence' && seed.sentences.some(s => s.id === item.id && s.template === item.template) ? SENTENCE_QUIZ_CUES[item.id] : null;
    // A source filename is metadata, not a leaked English answer. Remove only
    // that trailing annotation; real English in a cue still needs review.
    const cleanChinese = (v: string) => {
      const text = v.replace(/\s*[（(]\s*来源[：:][^\n]*[）)]\s*$/g, '').trim();
      return /[\u3400-\u9fff]/.test(text) && !/[A-Za-z]/.test(text) ? text : '';
    };
    const reviewedEntry = reviewed.get(key);
    const bound = reviewedEntry?.text === text && (item.kind !== 'word' || reviewedEntry.sourceMeaning === item.meaning) ? reviewedEntry : null;
    const meaning = current ? config.meaning : bound ? cleanChinese(bound.meaning) : defaults?.[0] ?? (item.kind === 'word' ? cleanChinese(item.meaning) : '');
    const scenario = current ? config.scenario : bound ? cleanChinese(bound.scenario) : defaults?.[1] ?? (item.kind === 'word' ? WORD_SCENARIOS[item.term.toLowerCase()] ?? '' : '');
    const accepted = [...new Set([...answers, ...(current ? config.answers : [])])];
    entries.push({ key, title: item.kind === 'word' ? item.term : item.title, text, kind: item.kind, sourceSignature, meaning, scenario, answers: current ? config.answers : [], revision: config?.revision ?? 0, stale: !!config && !current });
    pool.push({ key, title: item.kind === 'word' ? item.meaning : item.title, text, kind: item.kind, answers: accepted, meaning, scenario, signature: sourceSignature, category: categoryOf(item) });
  }
  return { entries, pool, signature: signature({ revision: library.revision, pool }) };
}
function questions(pool: QuizSource[], mode: QuizMode, scope: QuizScope, range?: QuizRange): QuizQuestion[] {
  const grouped = new Map<string, QuizQuestion>();
  for (const source of pool) {
    if (scope !== 'all' && source.kind !== scope || !inRange(source, range)) continue;
    const prompt = source[mode]; if (!prompt) continue;
    const slots = slotCount(source.text), key = `${source.kind}:${slots}:${prompt.replace(/\s+/g, '')}`;
    const previous = grouped.get(key);
    if (previous) previous.sources.push(source); else grouped.set(key, { prompt, kind: source.kind, slots, sources: [source] });
  }
  return [...grouped.values()];
}
export async function quizCues() { const value = await sources(); return { entries: value.entries }; }
export async function saveQuizCue(body: Record<string, unknown>) {
  const operationId = uuid(body.operationId, 'lab-quiz-cue-save');
  if (typeof body.key !== 'string' || !Number.isInteger(body.baseRevision)) throw new ShortReviewError('提示设置不正确。');
  const meaning = cueText(body.meaning), scenario = cueText(body.scenario);
  if (!Array.isArray(body.answers) || body.answers.length > 12 || body.answers.some(a => typeof a !== 'string' || !/[A-Za-z]/.test(a) || a.length > 1800)) throw new ShortReviewError('可接受答案最多12项，每项最多1800字。');
  const answers = [...new Set((body.answers as string[]).map(a => a.trim()).filter(Boolean))];
  const source = (await sources()).entries.find(e => e.key === body.key);
  if (!source) throw new ShortReviewError('该表达已停用或删除，请重新读取。', 409);
  if (source.sourceSignature !== body.sourceSignature) throw new ShortReviewError('表达库已更新，请重新核对提示与答案。', 409);
  const id = cueId(source.key), row = await find(id), previous = row ? decode<QuizCueConfig>(row) : null;
  if (row && row.kind !== CUE) throw new ShortReviewError('提示记录类型冲突。', 409);
  const fields = { key: source.key, sourceSignature: source.sourceSignature, meaning, scenario, answers };
  if (previous?.operationId === operationId) {
    if (canonical(fields) !== canonical({ key: previous.key, sourceSignature: previous.sourceSignature, meaning: previous.meaning, scenario: previous.scenario, answers: previous.answers })) throw new ShortReviewError('保存编号冲突。', 409);
    return quizCues();
  }
  if ((previous?.revision ?? 0) !== body.baseRevision) throw new ShortReviewError('提示已在其他页面修改，请重新读取。', 409);
  await put(id, CUE, { ...fields, revision: source.revision + 1, operationId }, row);
  return quizCues();
}
async function state(id: string) {
  const row = await find(id); if (row?.kind !== QUIZ_KIND) throw new ShortReviewError('抽背记录不存在。', 404);
  const session = decode<QuizSession>(row);
  const values = await Promise.all([ANSWER, REVIEW, CORRECTION, PRACTICE].map(kind => list(kind, { writingId: id, limit: 100 })));
  return { session, answers: values[0].rows.map(row => decode<QuizAnswer>(row)), reviews: values[1].rows.map(row => decode<QuizReview>(row)), corrections: values[2].rows.map(row => decode<QuizCorrection>(row)), practices: values[3].rows.map(row => decode<QuizPractice>(row)) };
}
async function publicProgress(value: Awaited<ReturnType<typeof state>>): Promise<QuizProgress> {
  const { session: s, answers, reviews, corrections, practices } = value;
  const score = quizScore(s.questions.length, answers, reviews, corrections);
  if (score.complete) {
    const snapshot = { writingId: s.id, score, answerIds: answers.map(a => a.index).sort((a, b) => a - b), corrections, reviews };
    await once(interactionId('lab-quiz-report', canonical(snapshot)), REPORT, { ...snapshot, createdAt: new Date().toISOString() });
  }
  return {
    session: { id: s.id, createdAt: s.createdAt, mode: s.mode, scope: s.scope, retryOf: s.retryOf, ...(s.range ? { range: s.range } : {}) },
    questions: s.questions.map((q, index) => ({ index, prompt: q.prompt, kind: q.kind, slots: q.slots })),
    results: answers.sort((a, b) => a.index - b.index).map(a => ({ ...a, references: s.questions[a.index].sources.map(e => ({ key: e.key, title: e.title, text: e.text, answers: e.answers })), pending: reviews.some(r => r.index === a.index) && !corrections.some(c => c.index === a.index), correction: corrections.find(c => c.index === a.index) })),
    practices, score,
  };
}
export async function quizProgress(id: string) { return publicProgress(await state(id)); }
export async function quizOverview(offset = 0): Promise<QuizOverview> {
  const [source, rows] = await Promise.all([sources(), list(QUIZ_KIND, { offset, limit: 10 })]);
  const counts = {} as QuizOverview['counts'];
  for (const mode of ['meaning', 'scenario'] as const) counts[mode] = { all: questions(source.pool, mode, 'all').length, word: questions(source.pool, mode, 'word').length, sentence: questions(source.pool, mode, 'sentence').length };
  const totals = (pool: QuizSource[]) => ({ all: pool.length, word: pool.filter(e => e.kind === 'word').length, sentence: pool.filter(e => e.kind === 'sentence').length });
  const coverage: QuizOverview['coverage'] = { enabled: totals(source.pool), covered: { meaning: totals(source.pool.filter(e => !!e.meaning)), scenario: totals(source.pool.filter(e => !!e.scenario)) } };
  const selections = new Map<string, QuizRange>();
  for (const range of [{ main: '', sub: '' }, ...source.pool.flatMap(s => s.category ? [{ main: s.category.main, sub: '' }, s.category] : [])]) selections.set(JSON.stringify(range), range);
  const ranges = [...selections.values()].map(range => {
    const pool = source.pool.filter(s => inRange(s, range));
    return { ...range, enabled: pool.length, covered: { meaning: pool.filter(s => !!s.meaning).length, scenario: pool.filter(s => !!s.scenario).length }, counts: { meaning: questions(pool, 'meaning', 'all').length, scenario: questions(pool, 'scenario', 'all').length } };
  });
  const sessions = await Promise.all(rows.rows.map(async row => { const s = decode<QuizSession>(row), v = await state(s.id); return { id: s.id, createdAt: s.createdAt, mode: s.mode, scope: s.scope, ...(s.range ? { range: s.range } : {}), score: quizScore(s.questions.length, v.answers, v.reviews, v.corrections) }; }));
  return { signature: source.signature, counts, coverage, ranges, excluded: source.pool.filter(e => !e.meaning || !e.scenario).length, sessions: sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), totalSessions: rows.total, offset, hasNext: rows.hasNext };
}
export async function startQuiz(body: Record<string, unknown>) {
  const id = uuid(body.id, 'lab-quiz');
  if (!['meaning', 'scenario'].includes(String(body.mode)) || !['all', 'word', 'sentence'].includes(String(body.scope)) || !Number.isInteger(body.count) || Number(body.count) < 1 || Number(body.count) > 50) throw new ShortReviewError('每轮抽查1至50题，请选择提示方式与范围。');
  const retryOf = body.retryOf == null ? null : identifier(body.retryOf);
  const range = readRange(body.range);
  const requestKey = canonical({ mode: body.mode, scope: body.scope, count: body.count, signature: body.signature, retryOf, ...(range ? { range } : {}) });
  const previous = await find(id);
  if (previous) { const v = await state(id); if (v.session.requestKey !== requestKey) throw new ShortReviewError('本轮编号已被使用，请重新开始。', 409); return publicProgress(v); }
  const source = await sources();
  if (source.signature !== body.signature) throw new ShortReviewError('表达库或提示已更新，请重新读取后开始。', 409);
  if (range?.main && !source.pool.some(s => inRange(s, range))) throw new ShortReviewError('该分类已不存在，请重新读取并选择抽查范围。', 409);
  let pool = questions(source.pool, body.mode as QuizMode, body.scope as QuizScope, range);
  if (retryOf) {
    const old = await state(retryOf);
    if (old.session.mode !== body.mode) throw new ShortReviewError('重练请保留原轮的提示方式。');
    const keys = new Set(old.answers.filter(a => !old.corrections.some(c => c.index === a.index && c.verdict === 'correct') && (a.verdict === 'incorrect' || old.corrections.some(c => c.index === a.index && c.verdict === 'incorrect')) && !old.reviews.some(r => r.index === a.index && !old.corrections.some(c => c.index === a.index))).flatMap(a => old.session.questions[a.index].sources.map(s => s.key)));
    pool = pool.filter(q => q.sources.some(s => keys.has(s.key)));
  }
  if (Number(body.count) > pool.length) throw new ShortReviewError(`当前范围可抽${pool.length}题，请减少数量，或在“调整抽背提示”中补充提示。`);
  // Fisher–Yates with server randomness; a retry reopens the durable snapshot.
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const session: QuizSession = { id, version: 1, createdAt: new Date().toISOString(), mode: body.mode as QuizMode, scope: body.scope as QuizScope, librarySignature: source.signature, requestKey, retryOf, questions: pool.slice(0, Number(body.count)), ...(range ? { range } : {}) };
  if (new TextEncoder().encode(JSON.stringify(session)).length > 350000) throw new ShortReviewError('本轮长句或答案变体较多，请减少抽查数量后开始。');
  // Random selection is fixed by the first successful insert. Concurrent retries
  // can return that snapshot, but cannot replace it with a second random draw.
  try { await put(id, QUIZ_KIND, session); } catch (error) { const saved = await find(id); if (saved?.kind !== QUIZ_KIND || decode<QuizSession>(saved).requestKey !== requestKey) throw error; }
  return quizProgress(id);
}
export async function saveQuiz(body: Record<string, unknown>) {
  const id = identifier(body.id), v = await state(id), index = body.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= v.session.questions.length) throw new ShortReviewError('题目序号不正确。');
  const question = v.session.questions[index], old = v.answers.find(a => a.index === index), createdAt = new Date().toISOString();
  if (body.action === 'answer' || body.action === 'practice') {
    if (typeof body.answer !== 'string' || body.answer.length > 3000 || typeof body.skipped !== 'boolean' || !body.skipped && !body.answer.trim()) throw new ShortReviewError('请输入英文，或选择“想不起来”。');
    if (body.action === 'answer' && v.session.questions.slice(0, index).some((_, i) => !v.answers.some(a => a.index === i))) throw new ShortReviewError('请按顺序完成本轮抽背。');
    if (body.action === 'practice' && !old) throw new ShortReviewError('请先提交首次作答。');
    const answer = body.skipped ? '' : body.answer.trim();
    if (body.action === 'answer' && old) {
      if (old.answer !== answer || old.skipped !== body.skipped) throw new ShortReviewError('首次作答已保存，不能覆盖；可使用重练本题。', 409);
      return publicProgress(v);
    }
    const result: QuizAnswer = { writingId: id, index, answer, skipped: body.skipped, ...gradeQuiz(question, answer, body.skipped), createdAt };
    if (body.action === 'answer') await once(`${id}-a-${index}`, ANSWER, result);
    else {
      const operationId = uuid(body.operationId, 'lab-quiz-practice');
      // One supplementary practice per item per round keeps replay records bounded.
      await once(`${id}-p-${index}`, PRACTICE, { ...result, id: operationId });
    }
  } else if (body.action === 'review') {
    if (!old || old.skipped) throw new ShortReviewError('请先提交英文作答，再申请复核。');
    await once(`${id}-r-${index}`, REVIEW, { writingId: id, index, createdAt });
  } else if (body.action === 'correct') {
    if (!old || old.skipped || !v.reviews.some(r => r.index === index) || !['correct', 'incorrect'].includes(String(body.verdict)) || !(QUIZ_REVIEW_REASONS as readonly unknown[]).includes(body.reason) || body.confirmed !== true) throw new ShortReviewError('请先申请复核，核对参考表达后确认结论。');
    await once(`${id}-c-${index}`, CORRECTION, { writingId: id, index, verdict: body.verdict, reason: body.reason, createdAt });
  } else throw new ShortReviewError('操作不正确。');
  return quizProgress(id);
}
