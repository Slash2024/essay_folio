import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { identifier, ShortReviewError } from '../../server/short-review';
import { templateOverview, templateProgress, startTemplate, saveTemplate } from '../../server/template-training';
export const prerender = false;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const failure = (error: unknown) => error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '模板训练暂时无法读取或保存，请保留当前内容后重试。' }, 503);
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    return json(params.has('session') ? { progress: await templateProgress(identifier(params.get('session'))) } : await templateOverview());
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text();
    if (text.length > 9000) return json({ error: '请求内容过大。' }, 413);
    let body; try { body = JSON.parse(text); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['start', 'answer', 'assess', 'validation', 'hint'].includes(body.action)) throw new ShortReviewError('请求格式不正确。');
    return json({ progress: await (body.action === 'start' ? startTemplate(body) : saveTemplate(body)) });
  } catch (error) { return failure(error); }
};
