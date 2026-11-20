import { slotCount, type QuizRange } from '../lib/expression-quiz';
import type { RecallCard, RecallProgress, RecallSession, RecallResult } from '../lib/exam-recall';
import { decode, find, list, put } from './archive';
import { identifier, ShortReviewError } from './short-review';
import { expressionRecallSources } from './expression-quiz';
export const RECALL_KIND = 'labRecallSession';
const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'createdAt').sort(([a], [b]) => a.localeCompare(b))) : v);
const uuid = (value: unknown) => { const id = identifier(value); if (!/^lab-recall-[a-f0-9-]{36}$/.test(id)) throw new ShortReviewError('记录编号不正确。'); return id; };
function readRange(value: unknown): QuizRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShortReviewError('请选择唤回分类。');
  const { main, sub } = value as Record<string, unknown>;
  if (typeof main !== 'string' || typeof sub !== 'string' || main.length > 200 || sub.length > 200 || main !== main.trim() || sub !== sub.trim() || !main && !!sub) throw new ShortReviewError('请选择有效的唤回分类。');
  return { main, sub };
}
async function once(id: string, kind: string, value: object) {
  const check = (row: NonNullable<Awaited<ReturnType<typeof find>>>) => { if (row.kind !== kind || canonical(decode(row)) !== canonical(value)) throw new ShortReviewError('这条记录已保存其他内容，请重新读取。', 409); };
  const previous = await find(id); if (previous) return check(previous);
  try { await put(id, kind, value); } catch (error) { const saved = await find(id); if (!saved) throw error; check(saved); }
}
export async function recallOverview() {
  const [source, sessions] = await Promise.all([expressionRecallSources(), list(RECALL_KIND, { limit: 15 })]);
  const ranges = new Map<string, QuizRange>();
  for (const range of [{ main: '', sub: '' }, ...source.pool.flatMap(s => s.category ? [{ main: s.category.main, sub: '' }, s.category] : [])]) ranges.set(JSON.stringify(range), range);
  return { signature: source.signature, ranges: [...ranges.values()].map(range => ({ ...range, count: source.pool.filter(s => !range.main || s.category?.main === range.main && (!range.sub || s.category.sub === range.sub)).length })), sessions: sessions.rows.map(row => { const s = decode<RecallSession>(row); return { id: s.id, createdAt: s.createdAt, count: s.cards.length }; }) };
}
async function recallState(id: string) {
  const row = await find(id); if (row?.kind !== RECALL_KIND) throw new ShortReviewError('唤回记录不存在。', 404);
  const [hints, reveals, results] = await Promise.all([list('labRecallHint', { writingId: id, limit: 5 }), list('labRecallReveal', { writingId: id, limit: 5 }), list('labRecallResult', { writingId: id, limit: 5 })]);
  return { session: decode<RecallSession>(row), hints: hints.rows.map(row => decode<{ writingId: string; index: number; text: string }>(row)), reveals: reveals.rows.map(row => decode<{ writingId: string; index: number; recalled: boolean }>(row)), results: results.rows.map(row => decode<RecallResult>(row)) };
}
function publicProgress(state: Awaited<ReturnType<typeof recallState>>): RecallProgress {
  const { session, hints, reveals, results } = state;
  return { session: { id: session.id, createdAt: session.createdAt, total: session.cards.length }, cards: session.cards.map((card, index) => ({ index, taskId: card.taskId, label: card.label, cue: card.cue, scope: card.scope })), hints: hints.map(({ index, text }) => ({ index, text })), reveals: reveals.map(({ index, recalled }) => ({ index, recalled, primary: session.cards[index].primary, backup: session.cards[index].backup })), results };
}
export async function recallProgress(id: string) { return publicProgress(await recallState(id)); }
export async function startRecall(body: Record<string, unknown>) {
  const id = uuid(body.id);
  // An old client may reopen its already saved round, but cannot create another
  // round using the retired configuration contract.
  if (body.maps !== undefined) {
    const previous = await find(id);
    if (!previous) throw new ShortReviewError('旧版出卡方式已停用，请刷新页面后开始。', 410);
    const saved = await recallState(id);
    if (!Array.isArray(body.maps) || body.maps.some(m => !m || typeof m.taskId !== 'string') || saved.session.requestKey !== canonical({ maps: [...body.maps].sort((a, b) => a.taskId.localeCompare(b.taskId)), limit: body.limit })) throw new ShortReviewError('本轮编号已被使用，请重新开始。', 409);
    return publicProgress(saved);
  }
  const range = readRange(body.range);
  if (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 5) throw new ShortReviewError('每轮一至五张卡。');
  const requestKey = canonical({ range, limit: body.limit, signature: body.signature });
  const previous = await find(id);
  if (previous) { const saved = await recallState(id); if (saved.session.requestKey !== requestKey) throw new ShortReviewError('本轮编号已被使用，请重新开始。', 409); return publicProgress(saved); }
  const source = await expressionRecallSources();
  if (source.signature !== body.signature) throw new ShortReviewError('表达库或情景提示已更新，请重新读取后开始。', 409);
  const pool = source.pool.filter(s => !range.main || s.category?.main === range.main && (!range.sub || s.category.sub === range.sub));
  if (!pool.length) throw new ShortReviewError('所选范围暂无可用的情景提示，请重新选择或在表达库抽背中补充提示。', 409);
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const cards: RecallCard[] = pool.slice(0, Number(body.limit)).map((s, index) => ({
    sourceKey: s.key, taskId: `card-${index}`, label: [s.category?.main, s.category?.sub].filter(Boolean).join(' / ') || '表达唤回',
    scope: s.category?.main === '大作文' ? 'large' : s.category?.main === '小作文' ? 'small' : 'other', cue: s.scenario,
    primary: { expression: { key: s.key, kind: s.kind, id: s.key.slice(s.kind.length + 1), title: s.title, category: [s.category?.main, s.category?.sub].filter(Boolean).join(' / '), text: s.text, notes: s.meaning, substitutions: '', signature: s.signature }, applies: s.scenario, variables: slotCount(s.text) ? '核对标出的可变位置，按实际题意替换，并检查语法与搭配。' : '核对词义、词形、搭配与当前语境。', example: '' }, backup: null,
  }));
  const session: RecallSession = { id, version: 2, createdAt: new Date().toISOString(), requestKey, range, cards };
  try { await put(id, RECALL_KIND, session); } catch (error) { const saved = await find(id); if (saved?.kind !== RECALL_KIND || decode<RecallSession>(saved).requestKey !== requestKey) throw error; }
  return recallProgress(id);
}
export async function saveRecall(body: Record<string, unknown>) {
  const id = identifier(body.id), state = await recallState(id), { session } = state, index = body.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= session.cards.length || index > 0 && !state.results.some(r => r.index === index - 1)) throw new ShortReviewError('请按顺序完成本轮卡片。');
  const hint = state.hints.find(h => h.index === index), reveal = state.reveals.find(r => r.index === index), createdAt = new Date().toISOString();
  if (body.action === 'hint') {
    if (!reveal && !hint) {
      const words = session.cards[index].primary.expression.text.replace(/\{\{[\s\S]*?\}\}|\[[^\]]*\]/g, ' ').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
      await once(`${id}-h-${index}`, 'labRecallHint', { writingId: id, index, text: words.slice(0, Math.min(2, Math.max(1, words.length - 1))).join(' ') || '回想这条表达的开头。', createdAt });
    }
  } else if (body.action === 'reveal') {
    if (typeof body.recalled !== 'boolean') throw new ShortReviewError('请先记录展开前是否想起。');
    await once(`${id}-v-${index}`, 'labRecallReveal', { writingId: id, index, recalled: body.recalled, createdAt });
  } else if (body.action === 'assess') {
    if (!reveal || body.confirmed !== true || !['independent', 'prompted', 'unrecalled'].includes(String(body.assessment))) throw new ShortReviewError('请展开核对表达与适用条件，再记录本次结果。');
    if (body.assessment === 'independent' && (!reveal.recalled || hint) || body.assessment === 'prompted' && (!reveal.recalled || !hint)) throw new ShortReviewError('本次展开前的回忆与提示记录不支持这个结果，请重新核对。');
    await once(`${id}-r-${index}`, 'labRecallResult', { writingId: id, index, assessment: body.assessment, createdAt });
  } else throw new ShortReviewError('操作不正确。');
  return recallProgress(id);
}
