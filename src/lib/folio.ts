import type {ReviewCuration,CurationVersion} from './review-curation';
import type {AlignmentStore} from './annotation-alignment';
import type {ReviewStudy} from './review-interactions';
import type { ReviewAnalysis, IssueCategory } from './review-analysis';
import reviewSettings from '../data/review-settings.json';
export type Exam = 'one' | 'two';
export type EssayType = 'small' | 'large';
export const SMALL_ESSAY_CATEGORIES = ['邀请信','感谢信','建议信','推荐信','通知','投诉信','回复信','介绍信','道歉信','辞职信','求职信/申请信','纪要'] as const;
export type SmallEssayCategory = typeof SMALL_ESSAY_CATEGORIES[number];
export const PICTURE_ESSAY_TOPICS = ['个人发展','社会道德','文化','环境保护','科技影响','经济消费'] as const;
export type PictureEssayTopic = typeof PICTURE_ESSAY_TOPICS[number];
export const LARGE_ESSAY_CATEGORIES = [...PICTURE_ESSAY_TOPICS, '材料类'] as const;
export type LargeEssayCategory = typeof LARGE_ESSAY_CATEGORIES[number];
export function questionYearLabel(q: Pick<Question,'year'>) { return q.year === null ? '补充题' : `${q.year} 年`; }
export function questionCategories(question: Question): string[] { return question.smallCategories || question.topicCategories || (question.chartType ? [question.chartType] : []); }
export interface Question { id: string; exam?: Exam; chartType?: string; smallCategories?: SmallEssayCategory[]; topicCategories?: LargeEssayCategory[]; year: number | null; type: EssayType; title: string; directions: string; originalDirections?: string; gradingStandard?: 'english-one'; images: string[]; source: string; sourceLabel: string; provenance: string }
export interface Writing { id: string; questionId: string; text: string; status: 'draft'|'submitted'|'reviewed'; createdAt: string; updatedAt: string; revision?: number; lastEditedAt?: string; submittedAt?: string; parentId?: string; promptSnapshot?: string; rubricSnapshot?: string; questionSnapshot?: Question }
export interface Review { id: string; writingId: string; questionId: string; filename: string; markdown: string; createdAt: string; label: string; writingRevision?: number; revisionId?:string; binding?:'latest'|'legacySnapshot'; analysis?:ReviewAnalysis; issueOverrides?:Record<string,IssueCategory[]>; analysisUpdatedAt?:string; study?:ReviewStudy;curation?:ReviewCuration;curationHistory?:CurationVersion[];alignments?:AlignmentStore }
export interface Notice { id: string; writingId: string; state: 'sending'|'accepted'|'failed'; createdAt: string; error?: string }
export type TemplateKey = 'small' | 'large' | 'englishTwoLarge';
export interface Templates { small: string; large: string; englishTwoLarge: string }
// English-two tasks remain identifiable, but both large-essay pools share one practice standard.
export const DEFAULT_TEMPLATES: Templates = {...reviewSettings.templates,englishTwoLarge:reviewSettings.templates.large};
export const DEFAULT_RUBRICS: Templates = {...reviewSettings.rubrics,englishTwoLarge:reviewSettings.rubrics.large};
export const gradingTemplateKeys = ['large','small'] as const;
export function gradingTemplateName(key:EssayType) { return key==='large'?'大作文（英语一、英语二共用）':'英语一小作文'; }
export function sharedReviewSettings(defaults:Templates,saved:Partial<Templates>={}):Templates {
 const merged={...defaults,...saved};return {...merged,englishTwoLarge:merged.large};
}
export const ENGLISH_TWO_PRACTICE_NOTE='英语二题目 · 按英语一大作文标准练习：160–200 词，满分 20 分，与英语一大作文共用评分标准。';
export function practiceQuestion(q:Question):Question {
 if(q.exam!=='two'||q.type!=='large')return q;
 const originalDirections=q.originalDirections??q.directions;
 const directions=originalDirections.replace(/(?:about|at least|no less than)\s+150\s+words/gi,'160–200 words').replace(/\b15\s*points\b/gi,'20 points');
 return {...q,directions,originalDirections,gradingStandard:'english-one'};
}
export function examName(q: Pick<Question,'exam'>) { return q.exam==='two'?'英语二':'英语一'; }
export function templateKey(q:Question):TemplateKey { return q.exam==='two'?'englishTwoLarge':q.type; }
export function templateName(key:TemplateKey) { return key==='englishTwoLarge'?'英语二大作文':key==='large'?'英语一大作文':'英语一小作文'; }
export const templateKeys:TemplateKey[]=['large','small','englishTwoLarge'];
export function rubricLabel(q:Question) { return q.exam==='two'?'英语一大作文评分标准（用户提供）':'评分标准（用户提供）'; }
export function wordTarget(q:Question) { return q.type==='small'?'约 100 词':'160–200 词'; }
export function scoreMaximum(type:EssayType) { return type==='small'?10:20; }
export function scoreTarget(q:Question) { return `${scoreMaximum(q.type)} 分 · ${wordTarget(q)}`; }
export function wordCount(text: string) { return (text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)||[]).length; }
export function typeName(type: EssayType) { return type==='small'?'小作文':'大作文'; }
export function reviewPrompt(q: Question, prompt: string) {
 let result=prompt;
 if(q.exam==='two')result+=`\n\n【本次练习统一口径，优先于模板及原题中的字数、分值与卷别评分要求】\n${ENGLISH_TWO_PRACTICE_NOTE} 原题来源仍为英语二，任务、数据和材料内容保持不变。不得使用英语二150词、15分制或其评分档次；须按随附的英语一大作文评分标准评价原始作文，明确给出满分20分。`;
 if(q.topicCategories?.includes('材料类'))result+=`\n\n【本题任务补充】\n本题为${examName(q)}材料类大作文，满分${scoreMaximum(q.type)}分，字数要求为${wordTarget(q)}。须解释是否或在多大程度上同意材料作者的观点，并以理由和相关例子论证；无需描述图画或图表。模板中的图画／图表描述要求不适用于本题。`;
 return result;
}
export function reviewPackage(q: Question, text: string, prompt: string, rubric: string = DEFAULT_RUBRICS[templateKey(q)]) {
 const question=practiceQuestion(q);
 return `${reviewPrompt(question,prompt)}\n\n---\n## ${rubricLabel(question)}\n\n${rubric}\n\n---\n## 真题${question.exam==='two'?'（练习适配版）':''}\n${questionYearLabel(question)} · 考研${examName(question)} · ${typeName(question.type)}\n${question.exam==='two'?'\n'+ENGLISH_TWO_PRACTICE_NOTE+'\n':''}\n${question.directions}\n${question.images.length ? '\n【题图】请结合随附题图批阅；如未收到图片，请先告知。\n':''}\n---\n## 我的作文\n\n${text}\n\n---\n请按以上提示词与评分标准批阅原始作文，并用 Markdown 输出。`;
}

export function reviewIsOutdated(writing:Writing|null,review:Review|undefined) {
  if(!writing||!review)return false;
  if(review.writingRevision!==undefined)return review.writingRevision!==(writing.revision||1);
  return !!writing.lastEditedAt&&writing.lastEditedAt>review.createdAt;
}
