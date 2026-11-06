import type { APIRoute } from 'astro';
import { validateSurveyAnswers, type SurveyResponse } from '../../lib/experience-survey';
import { decode, find, put } from '../../server/archive';
import { authorized, sameOrigin } from '../../server/session';

export const prerender = false;

const recordId = 'laboratory-experience-survey-v1';
const kind = 'laboratorySurvey';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function readResponse() {
  const row = await find(recordId);
  if (row && row.kind !== kind) throw new Error('Unexpected survey record type');
  return row ? decode<SurveyResponse>(row) : null;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    if (!await authorized(request)) return json({ error: '请先输入个人访问码' }, 401);
    return json({ response: await readResponse() });
  } catch {
    return json({ error: '暂时无法读取问卷，请重试。' }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源不匹配，请刷新后重试。' }, 403);
    if (!await authorized(request)) return json({ error: '请先输入个人访问码' }, 401);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: '答卷内容过大。' }, 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json({ error: '答卷格式有误。' }, 400); }
    const answers = validateSurveyAnswers(input);
    if (!answers) return json({ error: '请完成所有题目，并检查多选项限制。' }, 400);

    const previous = await readResponse();
    if (previous) return json({ response: previous });

    const response = { answers, submittedAt: new Date().toISOString() };
    try {
      await put(recordId, kind, response, null);
    } catch (error) {
      // A concurrent submit or an interrupted response may have already saved the fixed record.
      const saved = await readResponse();
      if (saved) return json({ response: saved });
      throw error;
    }
    return json({ response });
  } catch {
    return json({ error: '暂时无法保存答卷，已选答案仍在当前页面，请重试。' }, 503);
  }
};
