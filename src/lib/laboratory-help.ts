import type { LabRoute } from './laboratory-navigation';
export const LAB_GUIDES = {
  quiz: { title: '表达库抽背', purpose: '根据中文或情景默写英文，自动核对并保存首次正确率。' },
  materials: { title: '复习材料包', purpose: '把一个问题的原句、批注、笔记和作答整理在一起。' },
  transfer: { title: '换语境复测', purpose: '用另一道题中的纠错句，检验同一类问题能否处理。' },
  recall: { title: '情境唤回卡', purpose: '只看中文任务，主动回忆表达，再展开核对。' },
  template: { title: '模板迁移训练', purpose: '把一条熟悉句式适配到三道题的关键表达中。' },
  survey: { title: '产品体验问卷', purpose: '用七道客观题记录近期真实使用体验。' },
} as const;
export type LabGuideId = keyof typeof LAB_GUIDES;
export function guideForView(view: LabRoute['view']) {
  if (!Object.hasOwn(LAB_GUIDES, view)) return undefined;
  const id = view as LabGuideId;
  return { id, ...LAB_GUIDES[id], href: `/laboratory/help/${id}/` };
}
