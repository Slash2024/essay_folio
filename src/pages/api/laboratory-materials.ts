import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { identifier, ShortReviewError } from '../../server/short-review';
import { materialOverview, materialSource, savedMaterialPack, saveMaterialPack } from '../../server/laboratory-materials';
export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    if (params.has('pack')) return json({ pack: await savedMaterialPack(identifier(params.get('pack'))) });
    if (params.has('source')) return json({ source: await materialSource(params.get('type') ?? '', identifier(params.get('source'))) });
    return json(await materialOverview());
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text();
    if (text.length > 4096) return json({ error: '请求内容过大。' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ShortReviewError('请求格式不正确。');
    return json({ pack: await saveMaterialPack(body) });
  } catch (error) { return failure(error); }
};
function failure(error: unknown) {
  return error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '材料暂时无法读取或保存，请稍后重试。' }, 503);
}
