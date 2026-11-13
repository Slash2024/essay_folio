import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { identifier, ShortReviewError } from '../../server/short-review';
import { transferOverview, transferSource, transferProgress, startTransfer, saveTransfer } from '../../server/transfer-review';
export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    if (params.has('session')) return json({ progress: await transferProgress(identifier(params.get('session'))) });
    if (params.has('source')) return json({ source: await transferSource(params.get('type') ?? '', identifier(params.get('source'))) });
    return json(await transferOverview());
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text();
    if (text.length > 6000) return json({ error: '请求内容过大。' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['start', 'answer', 'assess', 'hint'].includes(body.action)) throw new ShortReviewError('请求格式不正确。');
    return json({ progress: await (body.action === 'start' ? startTransfer(body) : saveTransfer(body)) });
  } catch (error) { return failure(error); }
};
function failure(error: unknown) {
  return error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '复测暂时无法读取或保存，请保留当前作答后重试。' }, 503);
}
