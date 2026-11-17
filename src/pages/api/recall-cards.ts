import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { identifier, ShortReviewError } from '../../server/short-review';
import { recallOverview, recallProgress, startRecall, saveRecall } from '../../server/exam-recall';
export const prerender = false;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const failure = (error: unknown) => error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '唤回卡暂时无法读取或保存，请重试。' }, 503);
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    return json(params.has('session') ? { progress: await recallProgress(identifier(params.get('session'))) } : await recallOverview());
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text(); if (text.length > 6000) return json({ error: '内容过大。' }, 413);
    let body; try { body = JSON.parse(text); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['start', 'hint', 'reveal', 'assess'].includes(body.action)) throw new ShortReviewError('请求格式不正确。');
    return json({ progress: await (body.action === 'start' ? startRecall(body) : saveRecall(body)) });
  } catch (error) { return failure(error); }
};
