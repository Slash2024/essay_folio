import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { identifier, shortReviewOverview, shortReviewSource, shortReviewProgress, startShortReview, saveShortReview, ShortReviewError } from '../../server/short-review';
export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    if (params.has('session')) return json({ progress: await shortReviewProgress(identifier(params.get('session'))) });
    if (params.has('review')) return json({ source: await shortReviewSource(identifier(params.get('review'))) });
    return json(await shortReviewOverview());
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 12000) return json({ error: '请求内容过大。' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ShortReviewError('请求格式不正确。');
    if (!['start', 'answer', 'assess'].includes(body.action)) throw new ShortReviewError('不支持的操作。');
    return json({ progress: await (body.action === 'start' ? startShortReview(body) : saveShortReview(body)) });
  } catch (error) { return failure(error); }
};
function failure(error: unknown) {
  return error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '短复习暂时无法保存或读取，请保留当前内容后重试。' }, 503);
}
