import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { decode, find, put } from '../../server/archive';
import { FEEDBACK_EASE, FEEDBACK_VALUE, FEEDBACK_FACTORS, type FeatureFeedback, type FeedbackFeature } from '../../lib/laboratory';
export const prerender = false;
const KIND = 'labFeatureFeedback';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text();
    if (text.length > 4096) return json({ error: '反馈内容过大。' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: '反馈格式不正确。' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !/^lab-feedback-[a-f0-9-]{36}$/.test(body.id)
      || !Object.hasOwn(FEEDBACK_FACTORS, body.feature)
      || !FEEDBACK_EASE.some(item => item.id === body.ease) || !FEEDBACK_VALUE.some(item => item.id === body.value)
      || !['selection', 'practice', 'result', 'reading'].includes(body.phase)) return json({ error: '请选择使用感受和帮助程度。' }, 400);
    const feature = body.feature as FeedbackFeature;
    if (!Array.isArray(body.factors) || body.factors.length > 2 || new Set(body.factors).size !== body.factors.length || body.factors.some((factor: unknown) => !FEEDBACK_FACTORS[feature].some(item => item.id === factor))) return json({ error: '主要感受最多选择两项。' }, 400);
    const feedback: FeatureFeedback = { id: body.id, version: 1, feature, contextId: body.contextId ?? null, phase: body.phase, ease: body.ease, value: body.value, factors: [...body.factors].sort(), createdAt: new Date().toISOString() };
    const previous = await find(feedback.id);
    if (previous) return retry(previous.kind, decode<FeatureFeedback>(previous), feedback);
    if (feedback.contextId !== null) {
      if (typeof feedback.contextId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(feedback.contextId)) return json({ error: '反馈来源不正确。' }, 400);
      const context = await find(feedback.contextId);
      if (context?.kind !== (feature === 'short' ? 'labShortSession' : 'labMaterialPack')) return json({ error: '反馈对应的练习或材料包已不存在。' }, 404);
    }
    try { await put(feedback.id, KIND, { ...feedback, questionId: feature }); }
    catch (error) {
      const saved = await find(feedback.id);
      if (!saved) throw error;
      return retry(saved.kind, decode<FeatureFeedback>(saved), feedback);
    }
    return json({ feedback });
  } catch { return json({ error: '反馈暂时无法保存，已选内容保留，请重试。' }, 503); }
};
function retry(kind: string, saved: FeatureFeedback, incoming: FeatureFeedback) {
  const fields = ['feature', 'contextId', 'phase', 'ease', 'value', 'factors'] as const;
  if (kind !== KIND || fields.some(field => JSON.stringify(saved[field]) !== JSON.stringify(incoming[field]))) return json({ error: '反馈编号冲突，请重新打开反馈。' }, 409);
  return json({ feedback: saved });
}
