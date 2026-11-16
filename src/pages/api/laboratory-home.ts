import type { APIRoute } from 'astro';
import { authorized } from '../../server/session';
import { laboratoryQueue } from '../../server/laboratory-home';
export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    return json({ items: await laboratoryQueue() });
  } catch { return json({ error: '待继续记录暂时无法读取，可先从下方独立入口进入。' }, 503); }
};
