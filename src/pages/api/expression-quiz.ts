import type { APIRoute } from 'astro';
import { authorized, sameOrigin } from '../../server/session';
import { ShortReviewError, identifier } from '../../server/short-review';
import { quizOverview, quizProgress, startQuiz, saveQuiz, quizCues, saveQuizCue } from '../../server/expression-quiz';
export const prerender = false;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const failure = (error: unknown) => error instanceof ShortReviewError ? json({ error: error.message }, error.status) : json({ error: '抽背记录暂时无法读取或保存，输入已保留，请重试。' }, 503);
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const params = new URL(request.url).searchParams;
    if (params.has('session')) return json({ progress: await quizProgress(identifier(params.get('session'))) });
    if (params.has('cues')) return json(await quizCues());
    const offset = Number(params.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new ShortReviewError('页码不正确。');
    return json(await quizOverview(offset));
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码。' }, 401);
    const text = await request.text(); if (text.length > 30000) return json({ error: '内容过大。' }, 413);
    let body; try { body = JSON.parse(text); } catch { throw new ShortReviewError('请求格式不正确。'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ShortReviewError('请求格式不正确。');
    if (body.action === 'cue') return json(await saveQuizCue(body));
    return json({ progress: await (body.action === 'start' ? startQuiz(body) : saveQuiz(body)) });
  } catch (error) { return failure(error); }
};
