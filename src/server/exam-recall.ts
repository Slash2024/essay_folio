import { DEFAULT_EXPRESSIONS, type ExpressionLibrary } from '../lib/expressions';
import { interactionId } from '../lib/review-interactions';
import { CALL_TASKS, CALL_SCOPES, type CallBinding, type CallExpression, type CallMap, type CallMapView, type CallTaskId, type CallScope, type RecallCard, type RecallProgress, type RecallSession, type RecallResult } from '../lib/exam-recall';
import { all, decode, find, list, put } from './archive';
import { identifier, ShortReviewError } from './short-review';
export const CALL_MAP_KIND = 'labCallMap';
export const RECALL_KIND = 'labRecallSession';
const own = (object: object, key: unknown) => typeof key === 'string' && Object.hasOwn(object, key);
const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'createdAt').sort(([a], [b]) => a.localeCompare(b))) : v);
const taskById = (id: unknown) => CALL_TASKS.find(task => task.id === id);
const uuid = (value: unknown, prefix: string) => { const id = identifier(value); if (!new RegExp(`^${prefix}-[a-f0-9-]{36}$`).test(id)) throw new ShortReviewError('记录编号不正确。'); return id; };
async function library() {
  const row = await find('expression-library'), value = row ? decode<ExpressionLibrary>(row) : DEFAULT_EXPRESSIONS;
  if (!Array.isArray(value.sentences) || !Array.isArray(value.words)) throw new ShortReviewError('表达库暂时无法读取。', 503);
  const sign = (expression: Omit<CallExpression, 'signature'>): CallExpression => ({ ...expression, signature: interactionId('call-expression', JSON.stringify(expression)) });
  const expressions: CallExpression[] = [
    ...value.sentences.filter(e => e.enabled).map(e => sign({ key: `sentence:${e.id}`, kind: 'sentence', id: e.id, title: e.title, category: e.category, text: e.template, notes: e.notes, substitutions: e.substitutions })),
    ...value.words.filter(e => e.enabled).map(e => sign({ key: `word:${e.id}`, kind: 'word', id: e.id, title: e.term, category: '单词与短语', text: e.term, notes: e.meaning, substitutions: e.forms.join(' / ') })),
  ];
  return { expressions, signature: interactionId('call-library', JSON.stringify({ revision: value.revision, expressions })) };
}
function currentMap(map: CallMap, expressions: CallExpression[]): CallMapView {
  const current = !!map.primary && [map.primary, map.backup].filter(Boolean).every(binding => expressions.some(e => e.key === binding!.expression.key && e.signature === binding!.expression.signature));
  return { ...map, current };
}
export async function callMapOverview() {
  const [source, maps] = await Promise.all([library(), all(CALL_MAP_KIND)]);
  return { ...source, maps: maps.map(row => currentMap(decode<CallMap>(row), source.expressions)).filter(map => taskById(map.taskId)) };
}
const text = (value: unknown, max: number, label: string, required = false) => { if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new ShortReviewError(`请填写有效的${label}。`); return value.trim(); };
function mapInput(body: Record<string, unknown>) {
  const task = taskById(body.taskId);
  if (!task || !own(CALL_SCOPES, body.scope) || body.confirmed !== true || typeof body.baseRevision !== 'number' || !Number.isInteger(body.baseRevision) || body.baseRevision < 0) throw new ShortReviewError('请核对任务、适用范围和表达后确认保存。');
  const cue = text(body.cue, 600, '中文唤回情境', true);
  if (!/[\u3400-\u9fff]/.test(cue) || /[A-Za-z]/.test(cue)) throw new ShortReviewError('唤回情境请只用中文描述任务，不放入英文表达或英文缩写。');
  function binding(raw: unknown) {
    if (raw === null) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ShortReviewError('请选择表达。');
    const v = raw as Record<string, unknown>;
    return { key: text(v.key, 120, '表达编号', true), applies: text(v.applies, 1200, '适用条件', true), variables: text(v.variables, 1200, '替换内容', true), example: text(v.example, 2400, '熟悉的例句') };
  }
  const primary = binding(body.primary), backup = binding(body.backup);
  if (!primary && backup || primary && backup && primary.key === backup.key) throw new ShortReviewError('先设置首选表达，备用表达需与首选不同。');
  return { taskId: task.id, scope: body.scope as CallScope, cue, primary, backup };
}
export async function saveCallMap(body: Record<string, unknown>) {
  const operationId = uuid(body.operationId, 'lab-map-save'), input = mapInput(body), id = `lab-call-map-${input.taskId}`, row = await find(id);
  if (row && row.kind !== CALL_MAP_KIND) throw new ShortReviewError('调用地图记录类型不匹配。', 409);
  const previous = row ? decode<CallMap>(row) : null;
  const fromSaved = (map: CallMap) => ({ taskId: map.taskId, scope: map.scope, cue: map.cue, primary: map.primary ? { key: map.primary.expression.key, applies: map.primary.applies, variables: map.primary.variables, example: map.primary.example } : null, backup: map.backup ? { key: map.backup.expression.key, applies: map.backup.applies, variables: map.backup.variables, example: map.backup.example } : null });
  if (previous?.operationId === operationId) {
    if (canonical(fromSaved(previous)) !== canonical(input)) throw new ShortReviewError('保存编号已被用于其他内容，请重新保存。', 409);
    return callMapOverview();
  }
  if ((previous?.revision ?? 0) !== body.baseRevision) throw new ShortReviewError('调用地图已被更新，请重新读取并核对后保存。', 409);
  const source = await library();
  if (source.signature !== body.signature) throw new ShortReviewError('表达库已更新，请重新读取并核对表达后保存。', 409);
  const material = (binding: NonNullable<typeof input.primary> | null): CallBinding | null => {
    if (!binding) return null;
    const expression = source.expressions.find(e => e.key === binding.key);
    if (!expression) throw new ShortReviewError('选中的表达已停用或删除，请重新选择。', 409);
    const { key: _, ...fields } = binding; return { ...fields, expression };
  };
  const map: CallMap = { id, version: 1, taskId: input.taskId, revision: (previous?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), operationId, scope: input.scope, cue: input.cue, primary: material(input.primary), backup: material(input.backup) };
  await put(id, CALL_MAP_KIND, map, row);
  return callMapOverview();
}
async function once(id: string, kind: string, value: object) {
  const check = (row: NonNullable<Awaited<ReturnType<typeof find>>>) => { if (row.kind !== kind || canonical(decode(row)) !== canonical(value)) throw new ShortReviewError('这条记录已保存其他内容，请重新读取。', 409); };
  const previous = await find(id); if (previous) return check(previous);
  try { await put(id, kind, value); } catch (error) { const saved = await find(id); if (!saved) throw error; check(saved); }
}
export async function recallOverview() {
  const [overview, sessions] = await Promise.all([callMapOverview(), list(RECALL_KIND, { limit: 15 })]);
  return { maps: overview.maps.filter(map => map.current).map(map => ({ taskId: map.taskId, label: taskById(map.taskId)!.label, revision: map.revision, scope: map.scope })), staleCount: overview.maps.filter(map => map.primary && !map.current).length, sessions: sessions.rows.map(row => { const s = decode<RecallSession>(row); return { id: s.id, createdAt: s.createdAt, count: s.cards.length }; }) };
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
  const id = uuid(body.id, 'lab-recall');
  if (!Array.isArray(body.maps) || body.maps.length < 1 || body.maps.length > CALL_TASKS.length || typeof body.limit !== 'number' || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > 5) throw new ShortReviewError('请选择已确认的任务，每轮一至五张卡。');
  const selections = body.maps as { taskId: CallTaskId; revision: number }[];
  if (selections.some(m => !m || !taskById(m.taskId) || !Number.isInteger(m.revision)) || new Set(selections.map(m => m.taskId)).size !== selections.length) throw new ShortReviewError('任务选择不正确。');
  const requestKey = canonical({ maps: [...selections].sort((a, b) => a.taskId.localeCompare(b.taskId)), limit: body.limit });
  const previous = await find(id);
  if (previous) { const state = await recallState(id); if (state.session.requestKey !== requestKey) throw new ShortReviewError('本轮编号已被使用，请重新开始。', 409); return publicProgress(state); }
  const overview = await callMapOverview();
  const selected = selections.map(s => overview.maps.find(map => map.taskId === s.taskId && map.revision === s.revision && map.current));
  if (selected.some(map => !map)) throw new ShortReviewError('调用地图或表达库已更新，请重新读取并确认后开始。', 409);
  const chosen = (selected as CallMapView[]).sort((a, b) => interactionId(id, a.taskId).localeCompare(interactionId(id, b.taskId))).slice(0, body.limit);
  const cards: RecallCard[] = chosen.map(map => {
    const task = taskById(map.taskId)!;
    const variants: readonly string[] = map.cue === task.cue ? [task.cue, ...task.variants] : [map.cue];
    const seed = [...interactionId(id, map.taskId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return { mapId: map.id, mapRevision: map.revision, taskId: map.taskId, label: task.label, scope: map.scope, cue: variants[seed % variants.length], primary: map.primary!, backup: map.backup };
  });
  await once(id, RECALL_KIND, { id, version: 1, createdAt: new Date().toISOString(), requestKey, cards });
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
