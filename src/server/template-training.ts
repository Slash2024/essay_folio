import rawQuestions from '../data/questions.json';
import { practiceQuestion, type Question } from '../lib/folio';
import { DEFAULT_EXPRESSIONS, type ExpressionLibrary } from '../lib/expressions';
import { interactionId } from '../lib/review-interactions';
import { CHECK_VALUES, TEMPLATE_CHECKS, TEMPLATE_DECISIONS, TRAINING_MODES, trainingMode, type TemplateSession, type TemplateProgress, type TemplateAttempt, type TemplateResult, type TemplateChecks, type TrainingMode, type TemplateDecision } from '../lib/template-training';
import { decode, find, list, put } from './archive';
import { identifier, ShortReviewError } from './short-review';
export const TEMPLATE_KIND = 'labTemplateSession';
const questions = (rawQuestions as Question[]).map(practiceQuestion);
const own = (o: object, key: unknown) => typeof key === 'string' && Object.hasOwn(o, key);
async function source() {
  const row = await find('expression-library');
  const library = row ? decode<ExpressionLibrary>(row) : DEFAULT_EXPRESSIONS;
  if (!Array.isArray(library.sentences)) throw new ShortReviewError('表达库暂时无法读取。', 503);
  const expressions = library.sentences.filter(item => item.enabled);
  return { expressions, questions, signature: interactionId('template', JSON.stringify({ revision: library.revision, expressions, questions })) };
}
async function once(id: string, kind: string, value: object) {
  const check = (row: NonNullable<Awaited<ReturnType<typeof find>>>) => {
    const saved = decode<Record<string, unknown>>(row), incoming = value as Record<string, unknown>;
    if (row.kind !== kind || Object.keys(incoming).some(key => key !== 'createdAt' && JSON.stringify(saved[key]) !== JSON.stringify(incoming[key]))) throw new ShortReviewError('这条练习已保存了其他内容，请重新读取记录。', 409);
  };
  const previous = await find(id); if (previous) return check(previous);
  try { await put(id, kind, value); } catch (error) { const saved = await find(id); if (!saved) throw error; check(saved); }
}
export async function templateOverview() {
  const [current, history] = await Promise.all([source(), list(TEMPLATE_KIND, { limit: 15 })]);
  return { ...current, sessions: history.rows.map(row => { const s = decode<TemplateSession>(row); return { id: s.id, title: s.expression.title, createdAt: s.createdAt }; }) };
}
export async function templateProgress(id: string): Promise<TemplateProgress> {
  const row = await find(id);
  if (row?.kind !== TEMPLATE_KIND) throw new ShortReviewError('模板训练记录不存在。', 404);
  const [attempts, results, validation, hint] = await Promise.all([list('labTemplateAttempt', { writingId: id, limit: 4 }), list('labTemplateResult', { writingId: id, limit: 4 }), find(`${id}-validation`), find(`${id}-hint`)]);
  return { session: decode<TemplateSession>(row), attempts: attempts.rows.map(row => decode<TemplateAttempt>(row)), results: results.rows.map(row => decode<TemplateResult>(row)), validation: validation?.kind === 'labTemplateValidation' ? decode<{ question: Question }>(validation).question : null, hintUsed: hint?.kind === 'labTemplateHint' };
}
export async function startTemplate(body: Record<string, unknown>) {
  const id = identifier(body.id);
  if (!/^lab-template-[a-f0-9-]{36}$/.test(id)) throw new ShortReviewError('训练编号不正确。');
  if (!Array.isArray(body.questionIds) || body.questionIds.length !== 3 || new Set(body.questionIds).size !== 3 || !own(TRAINING_MODES, body.mode) || body.confirmed !== true) throw new ShortReviewError('请选择三道不同的同类题，并确认已核对题面。');
  const previous = await find(id);
  if (previous) {
    const p = await templateProgress(id);
    if (p.session.expression.id !== body.expressionId || p.session.mode !== body.mode || JSON.stringify(p.session.questions.map(q => q.id)) !== JSON.stringify(body.questionIds)) throw new ShortReviewError('训练编号已被使用，请重新选择。', 409);
    return p;
  }
  const current = await source();
  if (current.signature !== body.signature) throw new ShortReviewError('表达库或题库已更新，请重新读取后选择。', 409);
  const expression = current.expressions.find(item => item.id === body.expressionId);
  const selected = body.questionIds.map(id => current.questions.find(q => q.id === id && trainingMode(q) === body.mode));
  if (!expression || selected.some(q => !q)) throw new ShortReviewError('表达或题目已变化，请重新选择。', 409);
  await once(id, TEMPLATE_KIND, { id, version: 1, createdAt: new Date().toISOString(), mode: body.mode as TrainingMode, expression, questions: selected as Question[] });
  return templateProgress(id);
}
export async function saveTemplate(body: Record<string, unknown>) {
  const id = identifier(body.id), progress = await templateProgress(id);
  const now = new Date().toISOString();
  if (body.action === 'validation') {
    if (![0, 1, 2].every(index => progress.results.some(item => item.index === index))) throw new ShortReviewError('请先完成三题训练和自检。');
    const question = questions.find(q => q.id === body.questionId && trainingMode(q) === progress.session.mode && !progress.session.questions.some(old => old.id === q.id));
    if (!question || body.confirmed !== true) throw new ShortReviewError('请选择未参与本轮训练的同类题，并确认题面。');
    if (progress.validation) {
      if (progress.validation.id !== question.id) throw new ShortReviewError('本轮验证题已确定，请继续已保存的题目。', 409);
    } else await once(`${id}-validation`, 'labTemplateValidation', { writingId: id, question, createdAt: now });
    return templateProgress(id);
  }
  if (body.action === 'hint') {
    if (!progress.validation) throw new ShortReviewError('请先开始独立验证。');
    if (!progress.attempts.some(item => item.index === 3)) await once(`${id}-hint`, 'labTemplateHint', { writingId: id, createdAt: now });
    return templateProgress(id);
  }
  const index = body.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 3 || (index === 3 && !progress.validation)) throw new ShortReviewError('题目编号不正确。');
  if (index > 0 && !progress.results.some(item => item.index === index - 1)) throw new ShortReviewError('请先完成上一题的作答和自检。');
  if (body.action === 'answer') {
    if (!own(TEMPLATE_DECISIONS, body.decision) || typeof body.task !== 'string' || !body.task.trim() || body.task.length > 1200 || body.confirmed !== true || typeof body.answer !== 'string' || body.answer.length > 2400 || typeof body.unable !== 'boolean' || (body.unable ? body.answer !== '' : !/[A-Za-z]/.test(body.answer)) || typeof body.elapsedSeconds !== 'number' || !Number.isInteger(body.elapsedSeconds) || body.elapsedSeconds < 0 || body.elapsedSeconds > 604800) throw new ShortReviewError('请确认本题任务、选择模板处理方式，并作答或选择暂时不会。');
    const attempt: TemplateAttempt = { writingId: id, index, decision: body.decision as TemplateDecision, task: body.task.trim(), answer: body.answer.trim(), unable: body.unable, hintUsed: index === 3 && progress.hintUsed, elapsedSeconds: body.elapsedSeconds, createdAt: now };
    await once(`${id}-a-${index}`, 'labTemplateAttempt', attempt);
  } else if (body.action === 'assess') {
    const attempt = progress.attempts.find(item => item.index === index);
    if (!attempt) throw new ShortReviewError('请先保存作答，再核对本题。');
    const checks = body.checks as TemplateChecks;
    if (!checks || typeof checks !== 'object' || Array.isArray(checks) || Object.keys(checks).length !== 4 || TEMPLATE_CHECKS.some(item => !own(CHECK_VALUES, checks[item.id]) || (['topic', 'task'].includes(item.id) && checks[item.id] === 'na') || (attempt.unable && checks[item.id] === 'matched'))) throw new ShortReviewError('请完成四项自检；暂时不会的题目不能标记为已对应。');
    await once(`${id}-r-${index}`, 'labTemplateResult', { writingId: id, index, checks: Object.fromEntries(TEMPLATE_CHECKS.map(item => [item.id, checks[item.id]])), createdAt: now });
  } else throw new ShortReviewError('操作不正确。');
  return templateProgress(id);
}
