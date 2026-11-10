import questions from '../data/questions.json';
import type { Question, Review, Writing } from '../lib/folio';
import type { WritingVersion } from '../lib/revisions';
import { parseReview, plain } from '../lib/review-analysis';
import { curatedNotes } from '../lib/review-curation';
import { noteAnchor, essayParagraphs } from '../lib/review-interactions';
import { alignmentInput } from '../lib/alignment-input';
import type { ShortReviewSource, ShortReviewSession, ShortReviewProgress, ShortReviewAttempt, ShortReviewResult } from '../lib/short-review';
import { all, decode, find, list, put } from './archive';

export class ShortReviewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const SESSION_KIND = 'labShortSession';
const ATTEMPT_KIND = 'labShortAttempt';
const RESULT_KIND = 'labShortResult';

export function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new ShortReviewError('记录编号不正确。');
  return value;
}

export async function shortReviewOverview() {
  const [writingRows, reviewRows, sessions] = await Promise.all([all('writing'), all('review'), list(SESSION_KIND, { limit: 10 })]);
  const writings = new Map(writingRows.map(row => { const value = decode<Writing>(row); return [value.id, value]; }));
  const sources = reviewRows.map(row => decode<Review>(row)).filter(review => writings.has(review.writingId)).map(review => {
    const writing = writings.get(review.writingId)!;
    const question = writing.questionSnapshot ?? (questions as Question[]).find(item => item.id === writing.questionId);
    return { reviewId: review.id, title: `${question?.title ?? '作文'} · ${review.label}`, createdAt: review.createdAt };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { sources, sessions: sessions.rows.map(row => { const value = decode<ShortReviewSession>(row); return { id: value.id, title: value.title, createdAt: value.createdAt }; }) };
}

export async function shortReviewSource(reviewId: string): Promise<ShortReviewSource> {
  const row = await find(reviewId);
  if (row?.kind !== 'review') throw new ShortReviewError('批阅已不存在，请重新选择。', 404);
  const review = decode<Review>(row);
  const writingRow = await find(review.writingId);
  if (writingRow?.kind !== 'writing') throw new ShortReviewError('作文已不存在，请重新选择。', 404);
  const writing = decode<Writing>(writingRow);
  const versionRow = review.revisionId ? await find(review.revisionId) : null;
  const version = versionRow?.kind === 'revision' ? decode<WritingVersion>(versionRow) : null;
  // A fallback is safe only when an explicit version binding identifies the current body.
  const source = version?.writingId === writing.id ? version.text
    : review.binding !== 'legacySnapshot' && review.writingRevision === (writing.revision ?? 1) ? writing.text : null;
  if (!source) throw new ShortReviewError('这份批阅的原稿版本尚不能核对，请选择其他批阅。');
  const question = writing.questionSnapshot ?? (questions as Question[]).find(item => item.id === review.questionId);
  const notes = curatedNotes(parseReview(review.markdown), review.curation);
  const paragraphs = essayParagraphs(source);
  const seen = new Set<string>();
  const items: ShortReviewSource['items'] = [];
  for (const note of notes) {
    const range = noteAnchor(source, note, review.study?.entries[note.id]).range;
    const pair = alignmentInput(range ? { ...note, origin: 'edited', scope: 'range', anchor: range } : note, source);
    if (!pair || pair.original.length > 1200 || pair.revised.length > 1200 || seen.has(pair.original)) continue;
    seen.add(pair.original);
    const paragraph = paragraphs.find(item => item.start <= pair.start && item.end >= pair.end);
    const context = paragraph ? source.slice(paragraph.start, paragraph.end) : source.slice(Math.max(0, pair.start - 300), pair.end + 300);
    const personalNotes = notes.filter(item => item.kind === 'personal' && !item.hidden).filter(item => {
      const at = noteAnchor(source, item, review.study?.entries[item.id]).range;
      return at && at.start < pair.end && at.end > pair.start;
    }).map(item => plain([item.explanation, item.replacement, item.shortNote].filter(Boolean).join('\n')).slice(0, 2000)).filter(Boolean).slice(0, 3);
    items.push({ noteId: note.id, original: pair.original, reference: pair.revised, explanation: plain(pair.explanation).slice(0, 5000), context: context.slice(0, 6000), personalNotes });
  }
  return { reviewId, writingId: writing.id, revision: review.curation?.revision ?? 0, title: `${question?.title ?? '作文'} · ${review.label}`, directions: question?.directions ?? '', images: question?.images ?? [], items };
}

export async function shortReviewProgress(id: string): Promise<ShortReviewProgress> {
  const row = await find(id);
  if (row?.kind !== SESSION_KIND) throw new ShortReviewError('练习记录不存在。', 404);
  const [attempts, results] = await Promise.all([list(ATTEMPT_KIND, { writingId: id, limit: 3 }), list(RESULT_KIND, { writingId: id, limit: 3 })]);
  return { session: decode<ShortReviewSession>(row), attempts: attempts.rows.map(row => decode<ShortReviewAttempt>(row)), results: results.rows.map(row => decode<ShortReviewResult>(row)) };
}

async function insertOnce(id: string, kind: string, payload: object) {
  const previous = await find(id);
  if (previous) {
    if (previous.kind !== kind) throw new ShortReviewError('练习记录类型不匹配。', 409);
    return;
  }
  try { await put(id, kind, payload); }
  catch (error) { if ((await find(id))?.kind !== kind) throw error; }
}

export async function startShortReview(body: Record<string, unknown>) {
  const id = identifier(body.id);
  if (!/^lab-short-[a-f0-9-]{36}$/.test(id)) throw new ShortReviewError('练习编号不正确。');
  const existing = await find(id);
  if (existing) {
    if (existing.kind !== SESSION_KIND || decode<ShortReviewSession>(existing).reviewId !== body.reviewId) throw new ShortReviewError('练习编号已被使用。', 409);
    return shortReviewProgress(id);
  }
  if (body.confirmed !== true || !Array.isArray(body.noteIds) || body.noteIds.length < 1 || body.noteIds.length > 3 || new Set(body.noteIds).size !== body.noteIds.length) throw new ShortReviewError('请选一至三条已确认的批注。');
  const source = await shortReviewSource(identifier(body.reviewId));
  if (source.revision !== body.revision) throw new ShortReviewError('批注刚刚更新，请重新读取后选择。', 409);
  const selected = body.noteIds.map(id => source.items.find(item => item.noteId === id));
  if (selected.some(item => !item)) throw new ShortReviewError('部分批注已变化，请重新选择。', 409);
  const session: ShortReviewSession = { ...source, items: selected as ShortReviewSource['items'], id, version: 1, createdAt: new Date().toISOString() };
  await insertOnce(id, SESSION_KIND, session);
  return shortReviewProgress(id);
}

export async function saveShortReview(body: Record<string, unknown>) {
  const id = identifier(body.id);
  const progress = await shortReviewProgress(id);
  const index = body.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= progress.session.items.length) throw new ShortReviewError('题目编号不正确。');
  if (body.action === 'answer') {
    if (typeof body.answer !== 'string' || body.answer.length > 2400 || typeof body.unable !== 'boolean' || (!body.unable && !body.answer.trim()) || (body.unable && body.answer !== '')) throw new ShortReviewError('请先作答，或选择暂时不会。');
    await insertOnce(`${id}-a-${index}`, ATTEMPT_KIND, { writingId: id, index, answer: body.answer, unable: body.unable, createdAt: new Date().toISOString() });
  } else {
    if (!progress.attempts.some(item => item.index === index)) throw new ShortReviewError('请先作答，再进行对照。');
    if (!['understood', 'uncertain'].includes(String(body.assessment))) throw new ShortReviewError('请选择对照后的自评结果。');
    await insertOnce(`${id}-r-${index}`, RESULT_KIND, { writingId: id, index, assessment: body.assessment, createdAt: new Date().toISOString() });
  }
  return shortReviewProgress(id);
}
