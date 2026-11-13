import type { Writing } from '../lib/folio';
import type { TransferOverview, TransferSource, TransferSession, TransferProgress, TransferMaterial } from '../lib/transfer-review';
import { interactionId } from '../lib/review-interactions';
import { shortReviewOverview, shortReviewSource, shortReviewProgress, identifier, insertOnce, ShortReviewError } from './short-review';
import { savedMaterialPack, MATERIAL_KIND } from './laboratory-materials';
import type { MaterialPack } from '../lib/laboratory';
import { decode, find, list } from './archive';
export const TRANSFER_KIND = 'labTransferSession';

export async function transferOverview(): Promise<TransferOverview> {
  const [overview, packs, sessions] = await Promise.all([shortReviewOverview(), list(MATERIAL_KIND, { limit: 20 }), list(TRANSFER_KIND, { limit: 15 })]);
  return {
    origins: [
      ...packs.rows.map(row => { const pack = decode<MaterialPack>(row); return { type: 'pack' as const, id: pack.id, title: pack.title, createdAt: pack.createdAt }; }),
      ...overview.sessions.map(value => ({ ...value, type: 'session' as const })),
      ...overview.sources.map(value => ({ type: 'review' as const, id: value.reviewId, title: value.title, createdAt: value.createdAt })),
    ],
    targets: overview.sources,
    sessions: sessions.rows.map(row => { const session = decode<TransferSession>(row); return { id: session.id, createdAt: session.createdAt }; }),
  };
}
export async function transferSource(type: string, id: string): Promise<TransferSource> {
  let source;
  if (type === 'review') source = await shortReviewSource(id);
  else if (type === 'session') source = (await shortReviewProgress(id)).session;
  else if (type === 'pack') {
    const pack = await savedMaterialPack(id);
    source = { title: pack.title, writingId: pack.sourceWritingId, reviewId: pack.reviewId, directions: pack.directions, images: pack.images, items: [pack.item], revision: 0 };
  } else throw new ShortReviewError('请选择旧问题的来源。');
  const row = await find(source.writingId);
  if (row?.kind !== 'writing') throw new ShortReviewError('原作文已不存在，请选择其他来源。', 404);
  const writing = decode<Writing>(row);
  return { ...source, originType: type, originId: id, questionId: writing.questionId, signature: interactionId('transfer', JSON.stringify(source)) };
}
export async function transferProgress(id: string): Promise<TransferProgress> {
  const row = await find(id);
  if (row?.kind !== TRANSFER_KIND) throw new ShortReviewError('复测记录不存在。', 404);
  const [attempt, result, hint] = await Promise.all([find(`${id}-answer`), find(`${id}-result`), find(`${id}-hint`)]);
  return { session: decode<TransferSession>(row), hintUsed: hint?.kind === 'labTransferHint', attempt: attempt?.kind === 'labTransferAttempt' ? decode<NonNullable<TransferProgress['attempt']>>(attempt) : null, result: result?.kind === 'labTransferResult' ? decode<NonNullable<TransferProgress['result']>>(result) : null };
}
export async function startTransfer(body: Record<string, unknown>) {
  const id = identifier(body.id);
  if (!/^lab-transfer-[a-f0-9-]{36}$/.test(id)) throw new ShortReviewError('复测编号不正确。');
  const previous = await find(id);
  if (previous) {
    const progress = await transferProgress(id);
    const saved = progress.session;
    if (saved.originType !== body.originType || saved.originId !== body.originId || saved.origin.item.noteId !== body.originNoteId || saved.targetReviewId !== body.targetReviewId || saved.target.item.noteId !== body.targetNoteId) throw new ShortReviewError('复测编号已被使用，请重新选材。', 409);
    return progress;
  }
  if (body.confirmed !== true) throw new ShortReviewError('请确认两条批注适合检验同一问题。');
  const [origin, target] = await Promise.all([transferSource(String(body.originType), identifier(body.originId)), transferSource('review', identifier(body.targetReviewId))]);
  if (origin.signature !== body.originSignature || target.signature !== body.targetSignature) throw new ShortReviewError('来源材料已更新，请重新读取。', 409);
  if (origin.questionId === target.questionId) throw new ShortReviewError('请选择另一道题，进行换语境复测。');
  const oldItem = origin.items.find(item => item.noteId === body.originNoteId), newItem = target.items.find(item => item.noteId === body.targetNoteId);
  if (!oldItem || !newItem) throw new ShortReviewError('原句或批注已变化，请重新选择。', 409);
  if (oldItem.original.replace(/\s+/g, ' ').trim().toLowerCase() === newItem.original.replace(/\s+/g, ' ').trim().toLowerCase()) throw new ShortReviewError('两句原文相同，请选择不同的句子。');
  const material = (source: TransferSource, item: TransferMaterial['item']): TransferMaterial => ({ title: source.title, questionId: source.questionId, directions: source.directions, images: source.images ?? [], item });
  const session: TransferSession = { id, version: 1, createdAt: new Date().toISOString(), originType: origin.originType, originId: origin.originId, targetReviewId: target.reviewId, origin: material(origin, oldItem), target: material(target, newItem) };
  await insertOnce(id, TRANSFER_KIND, session);
  return transferProgress(id);
}
export async function saveTransfer(body: Record<string, unknown>) {
  const id = identifier(body.id), progress = await transferProgress(id);
  if (body.action === 'hint') {
    if (!progress.attempt) await insertOnce(`${id}-hint`, 'labTransferHint', { writingId: id, createdAt: new Date().toISOString() });
  } else if (body.action === 'answer') {
    if (typeof body.answer !== 'string' || body.answer.length > 2400 || typeof body.unable !== 'boolean' || typeof body.hintUsed !== 'boolean' || (body.unable ? body.answer !== '' : !body.answer.trim())) throw new ShortReviewError('请先作答，或选择暂时不会。');
    await insertOnce(`${id}-answer`, 'labTransferAttempt', { writingId: id, index: 0, answer: body.answer, unable: body.unable, hintUsed: progress.hintUsed || body.hintUsed, createdAt: new Date().toISOString() });
  } else {
    if (!progress.attempt) throw new ShortReviewError('请先独立作答，再进行对照。');
    if (!['understood', 'uncertain'].includes(String(body.assessment))) throw new ShortReviewError('请选择对照后的自评结果。');
    await insertOnce(`${id}-result`, 'labTransferResult', { writingId: id, index: 0, assessment: body.assessment, createdAt: new Date().toISOString() });
  }
  return transferProgress(id);
}
