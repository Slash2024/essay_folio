export const CALL_TASKS = [
  { id: 'describe', label: '描述题面', scope: 'large', cue: '题目需要简要描述图画、图表或材料。想起一条能帮助组织描述的表达。', variants: ['准备开篇交代题面中的主要信息，先想起一条你确认过的描述表达。', '需要把看到的关键信息准确写出来。想起一条适合组织这部分内容的表达。'], applies: '用于交代题面信息；根据图画、图表或材料选择合适的描述内容。', variables: '补入实际人物、对象、数据或变化，核对时态与数量。', pattern: /描述|图画|图表|趋势|数据|开篇/ },
  { id: 'reason', label: '解释原因', scope: 'large', cue: '已经交代一种现象，现在需要解释它为什么发生。想起一条连接原因与结果的表达。', variants: ['准备说明某种选择背后的原因，先想起一条适合组织因果关系的表达。', '论述需要从现象进入原因分析。想起一条你确认过的归因表达。'], applies: '用于解释原因或影响因素；先确认本题确实存在相应因果关系。', variables: '补入本题的原因与结果，核对因果方向、主谓和搭配。', pattern: /原因|归因|驱动|因素|因果/ },
  { id: 'support', label: '展开观点', scope: 'large', cue: '已经提出观点，现在需要说明它为什么成立或有什么影响。想起一条能帮助展开的表达。', variants: ['需要把抽象观点展开为具体作用或意义。想起一条你熟悉的论证表达。', '段落只有观点，还需要补充解释。想起一条能组织这部分展开的表达。'], applies: '用于解释观点的意义、作用或影响；展开内容需要支撑本题观点。', variables: '补入具体作用、对象和逻辑关系，避免只换主题词。', pattern: /意义|影响|作用|重要|观点|赋能/ },
  { id: 'example', label: '举例说明', scope: 'large', cue: '准备给观点增加一个具体例子。想起一条能引入或组织例子的表达。', variants: ['需要用熟悉案例说明当前观点。先想起一条你确认过的举例表达。', '观点比较抽象，准备补充事例。想起一条适合连接观点与事例的表达。'], applies: '用于引出或组织事例；例子应能说明本题观点。', variables: '补入人物、事件和与本题有关的一面，避免虚构事实或生硬套例。', pattern: /举例|例子|案例|事例/ },
  { id: 'action', label: '建议与措施', scope: 'both', cue: '需要说明接下来可以怎么办。想起一条适合提出建议或具体措施的表达。', variants: ['准备从分析转向行动。想起一条你确认过的建议表达。', '题目要求提出可行做法。先想起一条能组织建议与行动的表达。'], applies: '用于提出建议或措施；核对行动主体、可行性以及语气。', variables: '补入谁、采取什么行动，以及行动与本题的关系。', pattern: /建议|措施|行动|做法/ },
  { id: 'conclusion', label: '总结与收束', scope: 'large', cue: '正文论述已完成，需要收束全文并回应主题。想起一条适合总结的表达。', variants: ['准备结束文章，回到中心观点。想起一条你熟悉的收束表达。', '需要把前文观点简要归拢。想起一条已确认的总结表达。'], applies: '用于归拢前文并回应主题；不要在结尾突然引入未论证的新结论。', variables: '补入本题结论或态度，与前文观点保持一致。', pattern: /总结|结尾|收束|展望/ },
  { id: 'letter', label: '应用文回应', scope: 'small', cue: '题目要求完成一项应用文交际任务。想起一条适合回应收信人或交代写作目的的表达。', variants: ['需要向特定对象说明来意。先想起一条你确认过的应用文表达。', '准备回应收信人的要求。想起一条符合身份、对象和场合的表达。'], applies: '用于应用文交际；按邀请、感谢、推荐、解释等具体目的核对语气。', variables: '补入收信人需要的信息，核对身份、称呼及具体任务。', pattern: /邀请|感谢|推荐|来信|回信|应用文|通知|道歉|投诉|写信/ },
] as const;
export type CallTaskId = typeof CALL_TASKS[number]['id'];
export const CALL_SCOPES = { large: '大作文', small: '小作文', both: '大小作文通用' } as const;
export type CallScope = keyof typeof CALL_SCOPES;
export interface CallExpression { key: string; kind: 'sentence' | 'word'; id: string; title: string; category: string; text: string; notes: string; substitutions: string; signature: string }
export interface CallBinding { expression: CallExpression; applies: string; variables: string; example: string }
export interface CallMap { id: string; version: 1; taskId: CallTaskId; revision: number; updatedAt: string; operationId: string; scope: CallScope; cue: string; primary: CallBinding | null; backup: CallBinding | null }
export interface CallMapView extends CallMap { current: boolean }
export interface CallMapOverview { signature: string; expressions: CallExpression[]; maps: CallMapView[] }
export interface RecallCard { mapId: string; mapRevision: number; taskId: CallTaskId; label: string; scope: CallScope; cue: string; primary: CallBinding; backup: CallBinding | null }
export interface RecallSession { id: string; version: 1; createdAt: string; requestKey: string; cards: RecallCard[] }
export const RECALL_ASSESSMENTS = { independent: '独立想起', prompted: '提示后想起', unrecalled: '暂未想起' } as const;
export type RecallAssessment = keyof typeof RECALL_ASSESSMENTS;
export interface RecallResult { writingId: string; index: number; assessment: RecallAssessment; createdAt: string }
export interface RecallProgress {
  session: { id: string; createdAt: string; total: number };
  cards: { index: number; taskId: CallTaskId; label: string; cue: string; scope: CallScope }[];
  hints: { index: number; text: string }[];
  reveals: { index: number; recalled: boolean; primary: CallBinding; backup: CallBinding | null }[];
  results: RecallResult[];
}
export interface RecallOverview { maps: { taskId: CallTaskId; label: string; revision: number; scope: CallScope }[]; staleCount: number; sessions: { id: string; createdAt: string; count: number }[] }
export function expressionParts(text: string) { return text.split(/(\{\{[\s\S]*?\}\}|\[[^\]\n]+\]|\.{3,}|…+|\b(?:sb|sth)\b\.?)/gi).filter(Boolean).map(part => ({ text: part, variable: /^(?:\{\{|\[|\.{3}|…|(?:sb|sth)\b)/i.test(part) })); }
export function suggestedExpressions(taskId: CallTaskId, expressions: CallExpression[]) { const task = CALL_TASKS.find(t => t.id === taskId)!; return expressions.filter(e => task.pattern.test([e.category, e.title].join(' '))).slice(0, 5); }
