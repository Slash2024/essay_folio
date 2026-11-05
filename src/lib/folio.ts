import type {ReviewCuration,CurationVersion} from './review-curation';
import type {ReviewStudy} from './review-interactions';
import type { ReviewAnalysis, IssueCategory } from './review-analysis';
import reviewSettings from '../data/review-settings.json';
export type Exam = 'one' | 'two';
export type EssayType = 'small' | 'large';
export const SMALL_ESSAY_CATEGORIES = ['邀请信','感谢信','建议信','推荐信','通知','投诉信','回复信','介绍信','道歉信','辞职信','求职信/申请信','纪要'] as const;
export type SmallEssayCategory = typeof SMALL_ESSAY_CATEGORIES[number];
export const PICTURE_ESSAY_TOPICS = ['个人发展','社会道德','文化','环境保护','科技影响','经济消费'] as const;
export type PictureEssayTopic = typeof PICTURE_ESSAY_TOPICS[number];
export function questionCategories(question: Question): string[] { return question.smallCategories || question.topicCategories || (question.chartType ? [question.chartType] : []); }
export interface Question { id: string; exam?: Exam; chartType?: string; smallCategories?: SmallEssayCategory[]; topicCategories?: PictureEssayTopic[]; year: number; type: EssayType; title: string; directions: string; images: string[]; source: string; sourceLabel: string; provenance: string }
export interface Writing { id: string; questionId: string; text: string; status: 'draft'|'submitted'|'reviewed'; createdAt: string; updatedAt: string; revision?: number; lastEditedAt?: string; submittedAt?: string; parentId?: string; promptSnapshot?: string; rubricSnapshot?: string; questionSnapshot?: Question }
export interface Review { id: string; writingId: string; questionId: string; filename: string; markdown: string; createdAt: string; label: string; writingRevision?: number; revisionId?:string; binding?:'latest'|'legacySnapshot'; analysis?:ReviewAnalysis; issueOverrides?:Record<string,IssueCategory[]>; analysisUpdatedAt?:string; study?:ReviewStudy;curation?:ReviewCuration;curationHistory?:CurationVersion[] }
export interface Notice { id: string; writingId: string; state: 'sending'|'accepted'|'failed'; createdAt: string; error?: string }
export type TemplateKey = 'small' | 'large' | 'englishTwoLarge';
export interface Templates { small: string; large: string; englishTwoLarge: string }
export const DEFAULT_TEMPLATES: Templates = {...reviewSettings.templates,englishTwoLarge:reviewSettings.templates.large.replaceAll('英语（一）','英语（二）').replace('（小作文100，大作文160-200）','（本次为英语二大作文，满分15分；字数严格以所附年份 Directions 为准，约150词或至少150词。）').replace('第一段是否准确描述图画或图表；','第一段是否准确描述图表的对象、单位、数据与趋势，是否区分百分比与百分点；')+'\n\n本次只批阅英语（二）图表类大作文，满分15分，不使用英语一20分制。图表数字、对象和年份必须忠于题图，不得编造因果关系；估分按随附英语二评分参考执行。'};
export const DEFAULT_RUBRICS: Templates = {...reviewSettings.rubrics,englishTwoLarge:`英语（二）大作文评分参考（整理版，满分15分）

13–15分：任务完成充分；要点齐全，表达准确流畅，衔接清楚，语法和词汇较丰富。
10–12分：较好完成任务；内容较完整，结构连贯，语言基本准确，个别复杂表达有误。
7–9分：基本完成任务；覆盖主要要点，有一些不妨碍理解的错误。
4–6分：要点遗漏或展开不足；语言与衔接存在较多问题，影响理解。
1–3分：主要任务未完成；相关内容少，语言错误严重，理解困难。
0分：信息过少、无法辨认，或内容与任务无关。

先按任务完成、组织连贯、语言准确及表达范围定档，再在档内评分。图表描述与评论均以本题要求为准，字数严格遵照当年Directions，不套用英语一字数扣分阈值，也不虚构固定扣分规则。

来源：清华大学出版社《考研英语高分写作100篇（第2版）》试读，第2–3页（此处为摘要整理，非官方原文）。
https://www.tup.com.cn/upload/books/yz/101427-07.pdf`};
export function examName(q: Pick<Question,'exam'>) { return q.exam==='two'?'英语二':'英语一'; }
export function templateKey(q:Question):TemplateKey { return q.exam==='two'?'englishTwoLarge':q.type; }
export function templateName(key:TemplateKey) { return key==='englishTwoLarge'?'英语二大作文':key==='large'?'英语一大作文':'英语一小作文'; }
export const templateKeys:TemplateKey[]=['large','small','englishTwoLarge'];
export function rubricLabel(q:Question) { return q.exam==='two'?'评分参考（可编辑）':'评分标准（用户提供）'; }
export function wordTarget(q:Question) { return q.type==='small'?'约 100 词':q.exam==='two'?(/at least|no less than/i.test(q.directions)?'至少 150 词':'约 150 词'):'160–200 词'; }
export function scoreTarget(q:Question) { return `${q.type==='small'?10:q.exam==='two'?15:20} 分 · ${wordTarget(q)}`; }
export function wordCount(text: string) { return (text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)||[]).length; }
export function typeName(type: EssayType) { return type==='small'?'小作文':'大作文'; }
export function reviewPackage(q: Question, text: string, prompt: string, rubric: string = DEFAULT_RUBRICS[templateKey(q)]) { return `${prompt}\n\n---\n## ${rubricLabel(q)}\n\n${rubric}\n\n---\n## 真题\n${q.year} 年考研${examName(q)} · ${typeName(q.type)}\n\n${q.directions}\n${q.images.length ? '\n【题图】请结合随附题图批阅；如未收到图片，请先告知。\n':''}\n---\n## 我的作文\n\n${text}\n\n---\n请按以上提示词与评分标准批阅原始作文，并用 Markdown 输出。`; }

export function reviewIsOutdated(writing:Writing|null,review:Review|undefined) {
  if(!writing||!review)return false;
  if(review.writingRevision!==undefined)return review.writingRevision!==(writing.revision||1);
  return !!writing.lastEditedAt&&writing.lastEditedAt>review.createdAt;
}
