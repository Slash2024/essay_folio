import type { TemplateSession, TemplateResult } from '../lib/template-training';
import type { LabQueueItem } from '../lib/laboratory-navigation';
import type { ShortReviewSession, ShortReviewResult, ShortReviewItem } from '../lib/short-review';
import type { TransferSession } from '../lib/transfer-review';
import { all, decode } from './archive';

export async function laboratoryQueue(): Promise<LabQueueItem[]> {
  const [shortRows, shortResults, transferRows, transferResults, templateRows, templateResults, templateValidations] = await Promise.all([
    all('labShortSession'), all('labShortResult'), all('labTransferSession'), all('labTransferResult'), all('labTemplateSession'), all('labTemplateResult'), all('labTemplateValidation'),
  ]);
  const shortBySession = new Map<string, ShortReviewResult[]>();
  for (const row of shortResults) {
    const result = decode<ShortReviewResult & { writingId: string }>(row);
    const group = shortBySession.get(result.writingId) ?? [];
    group.push(result); shortBySession.set(result.writingId, group);
  }
  const transferBySession = new Map(transferResults.map(row => {
    const result = decode<ShortReviewResult & { writingId: string }>(row); return [result.writingId, result];
  }));
  const latestShort = new Map<string, { session: ShortReviewSession; item: ShortReviewItem; result: ShortReviewResult }>();
  const latestTransfer = new Map<string, { session: TransferSession; result: ShortReviewResult }>();
  const active = new Set<string>();
  const queue: LabQueueItem[] = [];
  for (const row of shortRows) {
    const session = decode<ShortReviewSession>(row), results = shortBySession.get(session.id) ?? [];
    const done = new Set(results.filter(result => result.index >= 0 && result.index < session.items.length).map(result => result.index));
    if (done.size < session.items.length) {
      queue.push({ key: session.id, title: '继续短复习', detail: `${session.title} · 已对照 ${done.size}/${session.items.length} 句`, createdAt: session.createdAt, status: 'unfinished', route: { view: 'short', entry: { sessionId: session.id } } });
      for (const item of session.items) active.add(`short:${session.reviewId}:${item.noteId}`);
    }
    for (const result of results) {
      const item = session.items[result.index];
      if (!item) continue;
      const key = `short:${session.reviewId}:${item.noteId}`, previous = latestShort.get(key);
      if (!previous || result.createdAt > previous.result.createdAt) latestShort.set(key, { session, item, result });
    }
  }
  for (const [key, { session, item, result }] of latestShort) {
    if (result.assessment === 'uncertain' && !active.has(key)) queue.push({ key, title: '短复习中仍需再看的句子', detail: item.original, createdAt: result.createdAt, status: 'revisit', route: { view: 'short', entry: { reviewId: session.reviewId, noteIds: [item.noteId] } } });
  }
  for (const row of transferRows) {
    const session = decode<TransferSession>(row), result = transferBySession.get(session.id);
    const key = `transfer:${session.origin.questionId}:${session.origin.item.noteId}:${session.target.questionId}:${session.target.item.noteId}`;
    if (!result) {
      active.add(key);
      queue.push({ key: session.id, title: '继续换语境复测', detail: session.target.title, createdAt: session.createdAt, status: 'unfinished', route: { view: 'transfer', sessionId: session.id } });
    } else if (!latestTransfer.has(key) || result.createdAt > latestTransfer.get(key)!.result.createdAt) latestTransfer.set(key, { session, result });
  }
  for (const [key, { session, result }] of latestTransfer) {
    if (result.assessment === 'uncertain' && !active.has(key)) queue.push({ key, title: '换语境后仍需再看的句子', detail: session.target.item.original, createdAt: result.createdAt, status: 'revisit', route: { view: 'transfer', entry: { originType: session.originType, originId: session.originId, noteId: session.origin.item.noteId, targetReviewId: session.targetReviewId, targetNoteId: session.target.item.noteId } } });
  }
  const validationIds = new Set(templateValidations.map(row => decode<{ writingId: string }>(row).writingId));
  const templateDone = new Map<string, Set<number>>();
  for (const row of templateResults) {
    const result = decode<TemplateResult>(row), indexes = templateDone.get(result.writingId) ?? new Set<number>();
    indexes.add(result.index); templateDone.set(result.writingId, indexes);
  }
  for (const row of templateRows) {
    const session = decode<TemplateSession>(row), done = templateDone.get(session.id) ?? new Set<number>();
    const count = [0, 1, 2].filter(index => done.has(index)).length;
    if (count < 3 || validationIds.has(session.id) && !done.has(3)) queue.push({ key: session.id, title: count < 3 ? '继续模板迁移训练' : '继续模板独立验证', detail: `${session.expression.title} · 已自检 ${count}/3 题`, createdAt: session.createdAt, status: 'unfinished', route: { view: 'template', sessionId: session.id } });
  }
  return queue.sort((a, b) => Number(b.status === 'unfinished') - Number(a.status === 'unfinished') || b.createdAt.localeCompare(a.createdAt) || a.key.localeCompare(b.key)).slice(0, 12);
}
