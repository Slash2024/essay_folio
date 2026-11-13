import type { MaterialSource, MaterialPack } from '../lib/laboratory';
import { interactionId } from '../lib/review-interactions';
import { decode, find, list, put } from './archive';
import { identifier, ShortReviewError, shortReviewOverview, shortReviewProgress, shortReviewSource } from './short-review';

export const MATERIAL_KIND = 'labMaterialPack';

export async function materialOverview() {
  const [overview, packs] = await Promise.all([shortReviewOverview(), list(MATERIAL_KIND, { limit: 20 })]);
  return { ...overview, packs: packs.rows.map(row => {
    const value = decode<MaterialPack>(row);
    return { id: value.id, title: value.title, createdAt: value.createdAt };
  }) };
}
export async function materialSource(type: string, id: string): Promise<MaterialSource> {
  let source;
  if (type === 'session') {
    const progress = await shortReviewProgress(id);
    source = { ...progress.session, attempts: [...progress.attempts].sort((a, b) => a.index - b.index), results: [...progress.results].sort((a, b) => a.index - b.index) };
  } else if (type === 'review') {
    source = { ...await shortReviewSource(id), attempts: [], results: [] };
  } else throw new ShortReviewError('请选择作文批阅或短复习记录。');
  return { ...source, sourceType: type, sourceId: id, signature: interactionId('materials', JSON.stringify(source)) };
}
export async function savedMaterialPack(id: string) {
  const row = await find(id);
  if (row?.kind !== MATERIAL_KIND) throw new ShortReviewError('材料包不存在。', 404);
  return decode<MaterialPack>(row);
}
export async function saveMaterialPack(body: Record<string, unknown>) {
  const id = identifier(body.id), sourceId = identifier(body.sourceId), noteId = identifier(body.noteId);
  if (!/^lab-pack-[a-f0-9-]{36}$/.test(id)) throw new ShortReviewError('材料包编号不正确。');
  const previous = await find(id);
  if (previous) {
    const saved = await savedMaterialPack(id);
    if (saved.sourceType !== body.sourceType || saved.sourceId !== sourceId || saved.item.noteId !== noteId) throw new ShortReviewError('保存编号已被使用，请重新打开材料。', 409);
    return saved;
  }
  const source = await materialSource(String(body.sourceType), sourceId);
  if (body.signature !== source.signature) throw new ShortReviewError('来源材料刚刚更新，请重新读取后保存。', 409);
  const index = source.items.findIndex(item => item.noteId === noteId);
  if (index < 0) throw new ShortReviewError('这条批注已变化，请重新选择。', 409);
  const pack: MaterialPack = {
    id, version: 1, createdAt: new Date().toISOString(), title: source.title,
    reviewId: source.reviewId, sourceWritingId: source.writingId,
    sourceType: source.sourceType, sourceId, directions: source.directions, images: source.images ?? [],
    item: source.items[index], attempt: source.attempts.find(item => item.index === index) ?? null,
    result: source.results.find(item => item.index === index) ?? null,
  };
  try { await put(id, MATERIAL_KIND, pack); }
  catch (error) {
    if ((await find(id))?.kind !== MATERIAL_KIND) throw error;
    const saved = await savedMaterialPack(id);
    if (saved.sourceType !== pack.sourceType || saved.sourceId !== sourceId || saved.item.noteId !== noteId) throw new ShortReviewError('保存编号冲突，请重新打开材料。', 409);
    return saved;
  }
  return pack;
}
