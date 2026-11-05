import type {Question,Review} from './folio';
import {plain,type IssueCategory} from './review-analysis';
import {curatedNotes} from './review-curation';
import {analyzeGroup,type AnalyticsIssue,type AnalyticsWriting} from './analytics';

export interface InsightEvidence {
 writingId:string;reviewId:string;noteId?:string;question:Question;
 id:string;createdAt:string;text:string;original?:string|null;replacement?:string|null;manual:boolean;classificationSource?:AnalyticsIssue['classificationSource'];classificationReason?:string;
}
interface PatternSpec {
 id:string;title:string;category:IssueCategory;test?:RegExp;task?:boolean;
}
const SPECIFIC:PatternSpec[]=[
 {id:'causal-claim',title:'把数据变化写成未经支持的因果关系',category:'论证与任务',test:/因果|原因.*(?:无|没有|缺乏|不能)|(?:无|缺乏).*依据.*(?:推断|解释)/,task:true},
 {id:'task-missing',title:'遗漏题目要求的任务',category:'论证与任务',test:/遗漏|漏写|未完成|没有回应|未回应|缺少.*(?:任务|要点)/,task:true},
 {id:'empty-example',title:'论点缺少具体支撑',category:'论证与任务',test:/空泛|笼统|泛泛|例子|例证|论据|具体.*(?:不足|不够)|缺乏.*支撑/,task:true},
 {id:'overclaim',title:'论断或结论超出证据范围',category:'论证与任务',test:/过度|绝对化|以偏概全|结论.*强|论断.*强/,task:true},
 {id:'with-structure',title:'with 结构与独立谓语混用',category:'谓语与句子结构',test:/\bwith\b.*(?:结构|谓语|分词)|(?:结构|谓语|分词).*\bwith\b/i},
 {id:'chart-unit',title:'图表对象、数据或单位表述不准',category:'词义与主题',test:/百分点|百分比|单位|图表.*(?:对象|数据)|数据.*(?:错误|不符)/,task:true},
];
const GENERAL:PatternSpec[]=[
 {id:'agreement',title:'主谓一致',category:'主谓一致'},
 {id:'predicate',title:'句子主干与谓语完整性',category:'谓语与句子结构'},
 {id:'tense',title:'时态与语态的选择',category:'时态与语态'},
 {id:'noun',title:'名词单复数与冠词',category:'单复数与冠词'},
 {id:'collocation',title:'介词与固定搭配',category:'介词与固定搭配'},
 {id:'spelling',title:'拼写与标点',category:'拼写与标点'},
 {id:'cohesion',title:'指代与句间衔接',category:'指代与衔接'},
 {id:'meaning',title:'词义与主题适配',category:'词义与主题'},
 {id:'argument',title:'任务完成与论证展开',category:'论证与任务',task:true},
 {id:'format',title:'字数与文体格式',category:'字数与格式',task:true},
 {id:'other',title:'待具体核对的问题',category:'其他问题'},
];
export interface IssuePattern extends PatternSpec {
 evidence:InsightEvidence[];writingCount:number;questionCount:number;recentCount:number;priorCount:number;sameQuestionCount:number;
}
export interface RewriteComparison {
 before:InsightEvidence;after:InsightEvidence;scoreDelta:number|null;beforeScore:ReturnType<typeof analyzeGroup>['rows'][number]['analysis']['score'];afterScore:RewriteComparison['beforeScore'];
 repeated:string[];notMentioned:string[];newlyMentioned:string[];
}
export interface StrengthInsight {id:string;title:string;evidence:InsightEvidence[];writingCount:number}
export interface TransferObservation {title:string;phrase:string;before:InsightEvidence;after:InsightEvidence;flagged:boolean}
const STRENGTHS=[
 {id:'task',title:'任务回应与切题',test:/(?:任务|要点|题意|主题).*(?:完整|充分|齐全|准确|明确)|切题|紧扣主题/},
 {id:'structure',title:'段落组织与衔接',test:/(?:结构|逻辑|衔接|层次|组织).*(?:清楚|清晰|合理|连贯|自然|紧凑)/},
 {id:'accuracy',title:'语言准确与表达稳妥',test:/(?:语言|语法|表达|用词).*(?:准确|正确|稳妥|自然|流畅|地道)/},
 {id:'argument',title:'论证与例子有效',test:/(?:论证|理由|论据|例子|例证).*(?:充分|具体|有力|贴切|清楚|有效)/},
 {id:'description',title:'图画或图表描述准确',test:/(?:描述|数据|趋势|图画|图表).*(?:准确|清楚|完整|到位)/},
];
const negative=/(?:没有|并非|不是|尚未|未能|不够|不足|不准确|不清楚|不完整|不自然|不充分|不连贯|不稳妥|不切题)/;
function evidence(row:ReturnType<typeof analyzeGroup>['rows'][number],text:string,issue?:AnalyticsIssue):InsightEvidence {
 const content=plain(text),original=issue?.original;
 return {id:JSON.stringify([row.review.id,issue?.id||text]),createdAt:row.review.createdAt,writingId:row.review.writingId,reviewId:row.review.id,noteId:issue?.noteId,question:row.question,text:original&&content.startsWith(original+'\n')?content.slice(original.length+1):content,original,replacement:issue?.replacement,manual:issue?.manual||false,classificationSource:issue?.classificationSource,classificationReason:issue?.classificationReason};
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
 const prior=new Set(rows.slice(-6,-3).map(r=>r.review.writingId));
 const patterns=new Map<string,IssuePattern>();
 for(const row of rows)for(const issue of row.analysis.issues)for(const spec of patternSpec(issue)){
  const item=patterns.get(spec.id)||{...spec,evidence:[],writingCount:0,questionCount:0,recentCount:0,priorCount:0,sameQuestionCount:0};
  item.evidence.push(evidence(row,issue.evidence,issue));patterns.set(spec.id,item);
 }
 for(const row of rows)for(const {spec,text} of taskEvidence(row.review)){
  if(patterns.get(spec.id)?.evidence.some(e=>e.reviewId===row.review.id))continue;
  const item=patterns.get(spec.id)||{...spec,evidence:[],writingCount:0,questionCount:0,recentCount:0,priorCount:0,sameQuestionCount:0};
  item.evidence.push(evidence(row,text));patterns.set(spec.id,item);
 }
 for(const p of patterns.values()){
  const ids=new Set(p.evidence.map(e=>e.writingId));p.writingCount=ids.size;
  const byQuestion=new Map<string,Set<string>>();
  for(const e of p.evidence){
   const drafts=byQuestion.get(e.question.id)||new Set<string>();
   drafts.add(e.writingId);
   byQuestion.set(e.question.id,drafts);
  }
  p.questionCount=byQuestion.size;
  p.sameQuestionCount=[...byQuestion.values()].filter(drafts=>drafts.size>1).length;
  p.priorCount=[...ids].filter(id=>prior.has(id)).length;
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
  rewrites.push({before:evidence(before,'前稿'),after:evidence(after,'重写稿'),beforeScore:b,afterScore:a,scoreDelta:valid(a)&&valid(b)?a.point!-b.point!:null,repeated:[...beforePatterns].filter(p=>afterPatterns.has(p)),notMentioned:[...beforePatterns].filter(p=>!afterPatterns.has(p)),newlyMentioned:[...afterPatterns].filter(p=>!beforePatterns.has(p))});
 }
 const strengths=new Map<string,StrengthInsight>();
 for(const row of rows){
  const praise=plain([row.analysis.score.advantages,row.analysis.sections[1]].filter(Boolean).join('\n'));
  const clauses=praise.split(/[。；;\n！？]|[，,]?(?:但是|然而|但|不过|只是)/).map(s=>s.trim()).filter(s=>s&&!negative.test(s));
  for(const spec of STRENGTHS){
   const matched=clauses.filter(c=>spec.test.test(c));if(!matched.length)continue;
   const item=strengths.get(spec.id)||{id:spec.id,title:spec.title,evidence:[],writingCount:0};
   for(const clause of new Set(matched)){
    const itemEvidence=evidence(row,clause);
    const quote=clause.match(/[“「"]([^”」"]+)[”」"]/)?.[1];
    if(quote&&texts[row.review.id]?.includes(quote)){
     itemEvidence.original=quote;
     itemEvidence.text=clause.replace(/[“「"][^”」"]+[”」"]/, '所引原句');
    }
    item.evidence.push(itemEvidence);
   }
   strengths.set(spec.id,item);
  }
  // A user-confirmed keep is shown as their own choice, never as model praise.
  for(const n of curatedNotes(row.analysis,row.review.curation).filter(n=>n.kind==='keep'&&!n.hidden)){
   const item=strengths.get('kept')||{id:'kept',title:'你确认可保留的原句',evidence:[],writingCount:0};
   item.evidence.push({...evidence(row,n.explanation||n.shortNote||n.title),id:JSON.stringify([row.review.id,n.id]),noteId:n.id,original:n.original,manual:true});strengths.set('kept',item);
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
 return {patterns:ranked,observations:ranked.filter(p=>p.writingCount>1).sort((a,b)=>b.questionCount-a.questionCount||b.writingCount-a.writingCount).slice(0,4),tasks:ranked.filter(p=>p.task),rewrites,strengths:[...strengths.values()].sort((a,b)=>b.writingCount-a.writingCount),reuse,sampleCount:rows.length};
}
