type Group = {
  id: string;
  label?: string;
  options: readonly string[];
  multiple?: boolean;
  limit?: number;
  exclusiveFrom?: number;
};

type Question = { title: string; hint?: string; groups: Group[] };

const frictionOptions = ['顺手完成', '额外花工夫后完成', '因此推迟或没做完', '没涉及 / 记不清'];
const unclear = '原本没有明确目标 / 记不清';

export const surveyQuestions: Question[] = [
  {
    title: '最近一次练习，哪一项占用的时间最长？',
    hint: '按实际用时选。即使这个环节很顺手，也可以选它。',
    groups: [{ id: 'time', options: [
      '找题、看题或查找参考材料', '构思、写作或重写', '整理送审材料或导入批阅',
      '阅读批阅、核对意见或修改原句', '整理表达、批注或个人笔记', '回看旧稿、复习或检查掌握情况', '几项差不多 / 记不清',
    ] }],
  },
  {
    title: '最近一次练习，你原本想做的事，最后做到了哪一步？',
    groups: [
      { id: 'intent', label: '原本最想做的事', options: [
        '选定题目或列出提纲', '写完计划中的段落或整篇作文', '送审或导入批阅',
        '看完批阅并决定怎么处理', '整理表达、批注或个人笔记', '重写或复习', unclear,
      ] },
      { id: 'outcome', label: '实际结果', options: [
        '按原来的做法完成', '换了做法后完成', '只完成一部分', '当次没有开始这项任务', unclear,
      ] },
    ],
  },
  {
    title: '这几次练习中，各环节实际发生过什么？',
    hint: '每个环节选一项。同一环节遇到过不同情况时，选后果最重的一次。反复切换、查找、核对或等待后才做完，选「额外花工夫后完成」。',
    groups: [
      ['topic', '找到要练的题，确认题目要求'],
      ['material', '在写作时找到需要的表达或参考材料'],
      ['send', '准备并发出送审材料'],
      ['import', '把批阅结果导回网站'],
      ['review', '核对批注意见，决定怎么处理'],
      ['notes', '保存或找回表达、批注、个人笔记'],
      ['mastery', '重写或复习后，判断自己是否掌握'],
    ].map(([id, label]) => ({ id, label, options: frictionOptions })),
  },
  {
    title: '最近一次练习中途停下后，再打开网站时发生了什么？',
    hint: '送审后等待批阅、临时离开或隔天继续，都可以算。按最近一次实际情况选。',
    groups: [{ id: 'resume', options: [
      '直接接上了之前的进度', '找到了上次的内容，但要重看一遍才能想起下一步',
      '花时间找回上次的题目、草稿、批注或笔记', '找不到要继续的位置，重新做了一部分',
      '停下后，至今没有继续这项任务', '这几次没有中途停下 / 记不清',
    ] }],
  },
  {
    title: '这几次练习中，你实际做过哪些额外动作？',
    hint: '最多选两项。如果超过两项，选做得最频繁的。已经习惯、当时没觉得麻烦的动作也算。',
    groups: [{ id: 'workarounds', multiple: true, limit: 2, exclusiveFrom: 6, options: [
      '把题目、原句或批注复制到别处，以便对照或继续处理',
      '在几个页面之间来回切换，把一次练习需要的信息拼在一起', '重新输入或整理已经录入过的信息',
      '重问一个已经问过的问题，或重新查找已经看过的资料', '用截图、浏览器标签页或纸上记号标记进度',
      '自己另外做清单、表格或提醒，跟踪待处理的事项', '以上都没有 / 记不清',
    ] }],
  },
  {
    title: '在这几次练习里，你把哪些以前留下的内容真正用到了另一道题上？',
    hint: '打开看过后，如果实际用于构思、写作或自查，就可以勾选。',
    groups: [{ id: 'reuse', multiple: true, exclusiveFrom: 4, options: [
      '表达库里的词句或模板', '旧稿里的段落、结构或论证思路',
      '以前的批注，用来检查新稿是否有同类问题', '自己写过的个人笔记',
      '查过旧材料，最后没有用到新题上', '这几次没有查过旧材料', '这几次没有练习其他题目 / 记不清',
    ] }],
  },
  {
    title: '最近一次看完批阅后，你对同一篇作文实际做了什么？',
    hint: '回想你最近一次看完批阅的作文，可以是这 14 天之前的。只选已经做过的动作。',
    groups: [{ id: 'followup', multiple: true, exclusiveFrom: 5, options: [
      '回到原句或题目，核对某条批注意见', '独立试着改过某个句子', '独立重写过一个段落或整篇作文',
      '对照过原稿和重写稿', '隔一段时间后，再回看或复习过这篇作文',
      '看完批阅后，目前还没有做以上任何一步', '没有看完过批阅 / 记不清',
    ] }],
  },
];

export type SurveyAnswers = Record<string, number[]>;
export type SurveyResponse = { answers: SurveyAnswers; submittedAt: string };

export function validateSurveyAnswers(value: unknown): SurveyAnswers | null {
  const groups = surveyQuestions.flatMap(question => question.groups);
  if (!value || typeof value !== 'object' || Object.keys(value).length !== groups.length) return null;
  const input = value as Record<string, unknown>;
  const answers: SurveyAnswers = {};
  for (const { id, options, multiple, limit, exclusiveFrom = Infinity } of groups) {
    const choices = input[id];
    if (!Array.isArray(choices) || !choices.length || choices.length > (limit ?? (multiple ? options.length : 1))) return null;
    if (choices.some(choice => !Number.isInteger(choice) || choice < 0 || choice >= options.length)) return null;
    if (new Set(choices).size !== choices.length || (choices.length > 1 && choices.some(choice => choice >= exclusiveFrom))) return null;
    answers[id] = [...choices].sort((a, b) => a - b);
  }
  return answers;
}
