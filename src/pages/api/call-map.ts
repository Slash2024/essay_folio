import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
export const prerender = false;
const json = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const retired = () => json('考场调用地图已下线，请返回实验室入口。', 410);
export const GET: APIRoute = async ({ request }) => await authorized(request) ? retired() : json('请先输入个人访问码。', 401);
export const POST: APIRoute = async ({ request }) => !sameOrigin(request) ? json('请求来源不匹配。', 403) : await authorized(request) ? retired() : json('请先输入个人访问码。', 401);
