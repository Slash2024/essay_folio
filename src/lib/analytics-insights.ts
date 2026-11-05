import type {Question,Review} from './folio';
import {plain,type IssueCategory} from './review-analysis';
import {curatedNotes} from './review-curation';
import {analyzeGroup,type AnalyticsIssue,type AnalyticsWriting} from './analytics';

export interface InsightEvidence {
 writingId:string;reviewId:string;noteId?:string;question:Question;
 text:string;original?:string|null;replacement?:string|null;manual:boolean;
}
interface PatternSpec {
 id:string;title:string;category:IssueCategory;test?:RegExp;task?:boolean;
 practice:string;check:string;
}
// These are training recipes, not diagnoses. A recipe is shown only when an
// existing review issue supplies the matching evidence.
const SPECIFIC:PatternSpec[]=[
 {id:'causal-claim',title:'把数据变化写成未经支持的因果关系',category:'论证与任务',test:/因果|原因.*(?:无|没有|缺乏|不能)|(?:无|缺乏).*依据.*(?:推断|解释)/,task:true,practice:'取一幅新图，先写两句只含对象、时间、数值和变化的描述；另写一句可能的解释，并明确它只是推测。',check:'逐句核对：题图是否支持这句话？描述与个人解释是否分开？'},
 {id:'task-missing',title:'遗漏题目要求的任务',category:'论证与任务',test:/遗漏|漏写|未完成|没有回应|未回应|缺少.*(?:任务|要点)/,task:true,practice:'动笔前把 Directions 拆成任务清单，给每项安排一句或一段；写完逐项标出对应原句。',check:'下一道新题的每项任务，都能在正文中找到明确回应。'},
 {id:'empty-example',title:'论点缺少具体支撑',category:'论证与任务',test:/空泛|笼统|泛泛|例子|例证|论据|具体.*(?:不足|不够)|缺乏.*支撑/,task:true,practice:'选正文中的一个论点，补齐“谁在什么情境下做了什么，产生什么结果”，再删掉不能支撑论点的细节。',check:'例子与论点之间有明确的解释句，而不只是重复观点。'},
 {id:'overclaim',title:'论断或结论超出证据范围',category:'论证与任务',test:/过度|绝对化|以偏概全|结论.*强|论断.*强/,task:true,practice:'圈出 all、always、must 等强断言，核对证据；必要时缩小对象、时间或适用条件。',check:'下一篇的每个结论，都没有超出前文理由或材料能够支持的范围。'},
 {id:'with-structure',title:'with 结构与独立谓语混用',category:'谓语与句子结构',test:/\bwith\b.*(?:结构|谓语|分词)|(?:结构|谓语|分词).*\bwith\b/i,practice:'把同一个意思分别写成完整主句、with 复合结构和独立的两个句子，各检查一次主语与谓语。',check:'带 with 的成分是否有完整主句承接？其中是否误放了限定谓语？'},
 {id:'chart-unit',title:'图表对象、数据或单位表述不准',category:'词义与主题',test:/百分点|百分比|单位|图表.*(?:对象|数据)|数据.*(?:错误|不符)/,task:true,practice:'给图表写三条简短描述，逐条标注对象、年份、单位；分别练一次“增长到”和“增长了”。',check:'所有数字能回到题图核对，比例变化没有混淆百分比与百分点。'},
];
const GENERAL:PatternSpec[]=[
 {id:'agreement',title:'主谓一致',category:'主谓一致',practice:'摘出两句自己的错句，只圈核心主语和限定谓语；更换主语的单复数，再各写一句。',check:'写完下一篇后，逐句确认核心主语与限定谓语的数一致。'},
 {id:'predicate',title:'句子主干与谓语完整性',category:'谓语与句子结构',practice:'选三句长句，先删去修饰成分，检查剩余主干；再把修饰成分逐一加回。',check:'每个独立句都有完整主干，两个完整句没有只用逗号连接。'},
 {id:'tense',title:'时态与语态的选择',category:'时态与语态',practice:'标出题目的时间范围，再给每个谓语标注时间与动作主体，检查是否需要被动。',check:'描述过去、现状与一般规律时，时态选择有依据。'},
 {id:'noun',title:'名词单复数与冠词',category:'单复数与冠词',practice:'从自己的原句中选三个名词短语，依次判断可数性、单复数和是否需要冠词。',check:'下一篇逐个检查可数单数名词，并核对泛指与特指。'},
 {id:'collocation',title:'介词与固定搭配',category:'介词与固定搭配',practice:'从下方证据选两组搭配，记录完整结构；遮住修改稿，换一个主题各写一句，再核对。',check:'检查的是完整搭配及其宾语，而不只记一个孤立单词。'},
 {id:'spelling',title:'拼写与标点',category:'拼写与标点',practice:'遮住修改稿，重新写出证据中的词或句；隔一段时间再默写一次，并做句末标点检查。',check:'下一篇提交前单独留一次拼写与标点检查。'},
 {id:'cohesion',title:'指代与句间衔接',category:'指代与衔接',practice:'圈出 this、it、they 等指代词，标出它们对应的对象；再给相邻两句写出具体逻辑关系。',check:'每个指代对象唯一、清楚，连接词与两句的实际关系一致。'},
 {id:'meaning',title:'词义与主题适配',category:'词义与主题',practice:'从证据中选一处表达，先用简单英语准确说清意思，再比较修改稿为何更符合对象与语境。',check:'优先确认词义、动作主体和作用对象准确，再考虑高级表达。'},
 {id:'argument',title:'任务完成与论证展开',category:'论证与任务',task:true,practice:'选一个正文观点，写出“观点—理由—具体例子—回扣题目”的四句短段，再删去重复内容。',check:'段落有实际支撑，而且每句都服务于题目要求。'},
 {id:'format',title:'字数与文体格式',category:'字数与格式',task:true,practice:'对照本题 Directions 列出字数、文体和格式要求，再检查原稿；按任务重要性调整篇幅。',check:'使用本题要求核对，不将不同卷别、不同题型的规则混用。'},
 {id:'other',title:'待具体核对的问题',category:'其他问题',practice:'先打开下方原批阅，确认问题的具体位置和原因；遮住修改稿重写这一处，再核对差异。',check:'能解释为什么修改，并在一个不同语境中正确写出。'},
];
export interface IssuePattern extends PatternSpec {
 evidence:InsightEvidence[];writingCount:number;questionCount:number;recentCount:number;
}
export interface RewriteComparison {
 before:InsightEvidence;after:InsightEvidence;scoreDelta:number|null;
 repeated:string[];notMentioned:string[];newlyMentioned:string[];
}
export interface StrengthInsight {id:string;title:string;use:string;evidence:InsightEvidence[];writingCount:number}
export interface TransferObservation {title:string;phrase:string;before:InsightEvidence;after:InsightEvidence;flagged:boolean}
const STRENGTHS=[
 {id:'task',title:'任务回应与切题',test:/(?:任务|要点|题意|主题).*(?:完整|充分|齐全|准确|明确)|切题|紧扣主题/,use:'继续保留动笔前拆解任务、写后逐项核对的做法。'},
 {id:'structure',title:'段落组织与衔接',test:/(?:结构|逻辑|衔接|层次|组织).*(?:清楚|清晰|合理|连贯|自然|紧凑)/,use:'保留已获肯定的段落功能安排，换题时重新组织具体内容。'},
 {id:'accuracy',title:'语言准确与表达稳妥',test:/(?:语言|语法|表达|用词).*(?:准确|正确|稳妥|自然|流畅|地道)/,use:'把这些原句作为准确表达的参考，先保证复现正确，再扩展句式。'},
 {id:'argument',title:'论证与例子有效',test:/(?:论证|理由|论据|例子|例证).*(?:充分|具体|有力|贴切|清楚|有效)/,use:'保留论点与例子之间的解释方式，换题时替换为相关事实。'},
 {id:'description',title:'图画或图表描述准确',test:/(?:描述|数据|趋势|图画|图表).*(?:准确|清楚|完整|到位)/,use:'沿用先核对对象与信息、再组织描述的步骤。'},
];
const negative=/(?:没有|并非|不是|尚未|未能|不够|不足|不准确|不清楚|不完整|不自然|不充分|不连贯|不稳妥|不切题)/;
function evidence(row:ReturnType<typeof analyzeGroup>['rows'][number],text:string,issue?:AnalyticsIssue):InsightEvidence {
 return {writingId:row.review.writingId,reviewId:row.review.id,noteId:issue?.noteId,question:row.question,text:plain(text),original:issue?.original,replacement:issue?.replacement,manual:issue?.manual||false};
}
function patternSpec(issue:AnalyticsIssue):PatternSpec[]{
 const found:PatternSpec[]=[];
 for(const category of issue.categories){
  const specific=SPECIFIC.find(s=>s.category===category&&s.test?.test(plain(issue.evidence)));
  const general=GENERAL.find(s=>s.category===category);
  if(specific||general)found.push((specific||general)!);
 }
 return found;
}
function taskEvidence(review:Review):{spec:PatternSpec;text:string}[]{
 const a=review.analysis;
 if(!a)return [];
 const notes=curatedNotes(a,review.curation),taskHidden=notes.some(n=>n.kind==='task'&&n.hidden);
 const source=[taskHidden?'':a.sections[0],a.score.deductions].filter(Boolean).join('\n');
 const clauses=plain(source).split(/[。；;\n]/).filter(s=>!/(?:没有|并未|并不|不|未)偏题|没有遗漏|无遗漏|无明显|不构成|不存在|无需修改/.test(s));
 const result:{spec:PatternSpec;text:string}[]=[];
 for(const text of clauses){
  if(!/遗漏|漏写|未完成|未回应|偏题|不足|不够|缺乏|空泛|过度|超出|错误|混淆/.test(text))continue;
  const specific=SPECIFIC.find(s=>s.task&&s.test?.test(text));
  const fallback=/论证|论据|例证|例子/.test(text)?GENERAL.find(s=>s.id==='argument'):/字数|格式/.test(text)?GENERAL.find(s=>s.id==='format'):undefined;
  const spec=specific||fallback;
  // Do not reintroduce a summary whose corresponding issue was curated away.
  if(spec&&!a.issues.some(i=>[...i.categories,...i.suggested].includes(spec.category)))result.push({spec,text});
 }
 return result;
}
export function buildInsights(reviews:Review[],questions:Question[],key:string,writings:AnalyticsWriting[]=[],texts:Record<string,string>={}){
 const group=analyzeGroup(reviews,questions,key),rows=group.rows;
 const recent=new Set(rows.slice(-3).map(r=>r.review.writingId));
 const patterns=new Map<string,IssuePattern>();
 for(const row of rows)for(const issue of row.analysis.issues)for(const spec of patternSpec(issue)){
  const item=patterns.get(spec.id)||{...spec,evidence:[],writingCount:0,questionCount:0,recentCount:0};
  item.evidence.push(evidence(row,issue.evidence,issue));patterns.set(spec.id,item);
 }
 for(const row of rows)for(const {spec,text} of taskEvidence(row.review)){
  if(patterns.get(spec.id)?.evidence.some(e=>e.reviewId===row.review.id))continue;
  const item=patterns.get(spec.id)||{...spec,evidence:[],writingCount:0,questionCount:0,recentCount:0};
  item.evidence.push(evidence(row,text));patterns.set(spec.id,item);
 }
 for(const p of patterns.values()){
  const ids=new Set(p.evidence.map(e=>e.writingId));p.writingCount=ids.size;
  p.questionCount=new Set(p.evidence.map(e=>e.question.id)).size;
  p.recentCount=[...ids].filter(id=>recent.has(id)).length;
 }
 const ranked=[...patterns.values()].sort((a,b)=>Number(!!b.task)-Number(!!a.task)||b.writingCount-a.writingCount||b.recentCount-a.recentCount||a.id.localeCompare(b.id));
 const rowMap=new Map(rows.map(r=>[r.review.writingId,r]));
 const rewrites:RewriteComparison[]=[];
 for(const w of writings){
  if(!w.parentId)continue;const before=rowMap.get(w.parentId),after=rowMap.get(w.id);
  if(!before||!after||before.question.id!==after.question.id)continue;
  const beforePatterns=new Set(ranked.filter(p=>p.evidence.some(e=>e.writingId===w.parentId)).map(p=>p.title));
  const afterPatterns=new Set(ranked.filter(p=>p.evidence.some(e=>e.writingId===w.id)).map(p=>p.title));
  const b=before.analysis.score,a=after.analysis.score;
  const valid=(s:typeof a)=>s.max===group.max&&s.point!==null&&s.point>=0&&s.point<=group.max;
  rewrites.push({before:evidence(before,'前稿'),after:evidence(after,'重写稿'),scoreDelta:valid(a)&&valid(b)?a.point!-b.point!:null,repeated:[...beforePatterns].filter(p=>afterPatterns.has(p)),notMentioned:[...beforePatterns].filter(p=>!afterPatterns.has(p)),newlyMentioned:[...afterPatterns].filter(p=>!beforePatterns.has(p))});
 }
 const strengths=new Map<string,StrengthInsight>();
 for(const row of rows){
  const praise=plain([row.analysis.score.advantages,row.analysis.sections[1]].filter(Boolean).join('\n'));
  const clauses=praise.split(/[。；;\n！？]|[，,]?(?:但是|然而|但|不过|只是)/).map(s=>s.trim()).filter(s=>s&&!negative.test(s));
  for(const spec of STRENGTHS){
   const matched=clauses.filter(c=>spec.test.test(c));if(!matched.length)continue;
   const item=strengths.get(spec.id)||{id:spec.id,title:spec.title,use:spec.use,evidence:[],writingCount:0};
   item.evidence.push(evidence(row,matched.join('；')));strengths.set(spec.id,item);
  }
  // A user-confirmed keep is shown as their own choice, never as model praise.
  for(const n of curatedNotes(row.analysis,row.review.curation).filter(n=>n.kind==='keep'&&!n.hidden)){
   const item=strengths.get('kept')||{id:'kept',title:'你确认可保留的原句',use:'这些是你整理时确认可保留的写法，可回看原句及理由；不代表批阅给出了额外加分。',evidence:[],writingCount:0};
   item.evidence.push({...evidence(row,n.explanation||n.shortNote||n.title),noteId:n.id,original:n.original,manual:true});strengths.set('kept',item);
  }
 }
 for(const s of strengths.values())s.writingCount=new Set(s.evidence.map(e=>e.writingId)).size;
 // Exact reuse is only an observation. It does not establish independent
 // authorship, appropriate context, or mastery of the underlying rule.
 const normalized=(s:string)=>s.toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9']+/g,' ').trim();
 const writingMap=new Map(writings.map(w=>[w.id,w]));
 const reuse:TransferObservation[]=[],seen=new Set<string>();
 for(const p of ranked)for(const source of p.evidence){
  const phrase=plain(source.replacement||'').trim(),needle=normalized(phrase),words=needle.split(' ');
  if(words.length<4||words.length>24||` ${normalized(source.original||'')} `.includes(` ${needle} `))continue;
  const before=rowMap.get(source.writingId)!;
  for(const after of rows){
   const writing=writingMap.get(after.review.writingId);
   if(!writing?.submittedAt||writing.parentId||writing.submittedAt<=before.review.createdAt||after.question.id===source.question.id)continue;
   const text=texts[after.review.id];if(!text||!` ${normalized(text)} `.includes(` ${needle} `))continue;
   const id=`${p.id}:${after.review.id}:${needle}`;if(seen.has(id))continue;seen.add(id);
   reuse.push({title:p.title,phrase,before:source,after:evidence(after,'后续新题正文中出现了这段表达'),flagged:p.evidence.some(e=>e.reviewId===after.review.id)});
  }
 }
 return {patterns:ranked,priorities:ranked.slice(0,3),tasks:ranked.filter(p=>p.task),rewrites,strengths:[...strengths.values()].sort((a,b)=>b.writingCount-a.writingCount),transfers:ranked.filter(p=>p.questionCount>1),reuse,sampleCount:rows.length};
}
