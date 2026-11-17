import type { LabRoute } from './laboratory-navigation';
export type LabToolView = Exclude<LabRoute['view'], 'home' | 'survey'>;
export const LAB_TOOLS: Record<LabToolView, { title: string; role: string; description: string; action: string }> = {
  short: { title: '短复习单', role: '改对一句', description: '从已有批阅选 1–3 句，独立修改后核对。', action: '进入短复习' },
  materials: { title: '复习材料包', role: '整理回看', description: '把原句、批注、笔记和本轮作答放在一起。', action: '进入材料包' },
  transfer: { title: '换语境复测', role: '换题再试', description: '到另一道题中，处理同一类问题。', action: '进入换语境复测' },
  callmap: { title: '考场调用地图', role: '准备表达', description: '按写作任务确定首选、备用和适用条件。', action: '进入考场调用地图' },
  recall: { title: '情境唤回卡', role: '主动想起', description: '只看中文任务，默想或口述，再展开核对。', action: '进入情境唤回卡' },
  template: { title: '模板迁移训练', role: '适配新题', description: '把熟悉句式用于三道题的关键表达。', action: '进入模板迁移训练' },
};
export const LAB_GROUPS = [
  { id: 'review', label: '批阅复习', title: '把批阅里的问题练会', description: '从原句修改，到材料整理，再到另一道题复测。', tools: ['short', 'materials', 'transfer'] as LabToolView[] },
  { id: 'expression', label: '考前表达', title: '记住表达，也能用上', description: '先整理可用表达，再练回忆，最后检验新题适配。', tools: ['callmap', 'recall', 'template'] as LabToolView[] },
] as const;
export function laboratoryGroup(view: LabRoute['view']) { return LAB_GROUPS.find(group => group.tools.includes(view as LabToolView)); }
