import {useMemo,useState} from 'react';
import {ArrowUpRight,ChevronDown,Info} from 'lucide-react';
import {examName,questionYearLabel,type Question,type Review,type TemplateKey} from '../../lib/folio';
import type {ExpressionLibrary} from '../../lib/expressions';
import {buildTemplateReview,type TemplateEvidence,type TemplateProblemGroup} from '../../lib/template-review';
import {plain} from '../../lib/review-analysis';
import {wordDiff} from '../../lib/revisions';
import '../../styles/template-review.css';

type OpenReview=(writingId:string,reviewId?:string,noteId?:string)=>void;
function ComparisonText({item,side}:{item:TemplateEvidence;side:'before'|'after'}){
 if(!item.replacement)return <span>{side==='before'?item.original:'原批阅未提供独立修改句'}</span>;
 return <>{wordDiff(item.original,item.replacement).filter(p=>p.type!==(side==='before'?'add':'remove')).map((p,i)=>
  p.type==='same'?<span key={i}>{p.value}</span>:<mark key={i} className={side==='before'?'template-before':'template-after'}>{p.value}</mark>)}</>;
}
function Evidence({item,onOpen}:{item:TemplateEvidence;onOpen:OpenReview}){
 const explanation=plain(item.explanation),long=explanation.length>220;
 return <article className="template-evidence">
  <header><strong>{questionYearLabel(item.question)} · {examName(item.question)} · {item.question.title}</strong>
   <button className="text-button" onClick={()=>onOpen(item.writingId,item.reviewId,item.noteId)}>查看原批阅<ArrowUpRight size={13}/></button></header>
  <div className="template-comparison">
   <section><h4>原文</h4><p className="english"><ComparisonText item={item} side="before"/></p></section>
   <section><h4>问题{item.reminder?' / 提醒':''}</h4>{long?<details className="template-explanation"><summary>{explanation.slice(0,220)}…<span>展开完整说明</span></summary><p>{explanation}</p></details>:<p>{explanation||'请查看原批阅中的具体说明。'}</p>}</section>
   <section><h4>修改建议</h4><p className="english"><ComparisonText item={item} side="after"/></p></section>
  </div>
 </article>;
}
function Group({group,onOpen,initialOpen=false}:{group:TemplateProblemGroup;onOpen:OpenReview;initialOpen?:boolean}){
 const [expanded,setExpanded]=useState(initialOpen);
 const bodyId='template-review-'+group.id+(group.evidence[0].reminder?'-reminder':'');
 return <article className={'template-group'+(expanded?' expanded':'')}>
  <button className="template-group-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={()=>setExpanded(v=>!v)}>
   <div><small>{group.category}</small><h3>{group.title}</h3><p className="english">{group.template.replace(/\{\{[\s\S]*?\}\}/g,'…')}</p>
    <span className="template-labels">{group.labels.map(label=><span key={label}>{label}</span>)}</span></div>
   <span className="template-group-count">涉及 {group.writingCount} 篇作文<ChevronDown size={17}/></span>
  </button>
  {expanded&&<div id={bodyId} className="template-group-body">{group.evidence.map(item=><Evidence key={item.id} item={item} onOpen={onOpen}/>)}</div>}
 </article>;
}
export default function TemplateErrorReview({reviews,questions,templateKey,library,texts,currentTexts,onOpen}:{
 reviews:Review[];questions:Question[];templateKey:TemplateKey;library:ExpressionLibrary|null;texts:Record<string,string>;currentTexts:Record<string,string>;onOpen:OpenReview;
}){
 const [problem,setProblem]=useState(''),[category,setCategory]=useState(''),[sort,setSort]=useState('count');
 const result=useMemo(()=>library?buildTemplateReview(reviews,questions,templateKey,library,texts,currentTexts):null,[reviews,questions,templateKey,library,texts,currentTexts]);
 const categories=useMemo(()=>[...new Set([...(result?.groups||[]),...(result?.reminders||[])].map(g=>g.classification))].sort(),[result]);
 function filtered(groups:TemplateProblemGroup[]){return groups.filter(g=>!category||g.classification===category)
  .map(g=>({...g,evidence:g.evidence.filter(e=>!problem||e.problems.includes(problem as any))}))
  .filter(g=>g.evidence.length).map(g=>({...g,writingCount:new Set(g.evidence.map(e=>e.writingId)).size,latestAt:g.evidence.reduce((a,e)=>a>e.createdAt?a:e.createdAt,''),labels:[...new Set(g.evidence.flatMap(e=>e.labels))]}))
  .sort((a,b)=>sort==='recent'?b.latestAt.localeCompare(a.latestAt):b.writingCount-a.writingCount||b.latestAt.localeCompare(a.latestAt));}
 const groups=filtered(result?.groups||[]),reminders=filtered(result?.reminders||[]);
 return <section className="panel stats-section template-review" aria-labelledby="template-review-heading">
  <h2 id="template-review-heading">模板句易错回顾</h2><p className="caption">按模板集中查看错误，追溯原文与修改建议。</p>
  {!result?<p className="caption">表达库暂未加载，请刷新数据后重试。</p>:<>
   <div className="template-filters">
    <label>问题性质<select value={problem} onChange={e=>setProblem(e.target.value)}><option value="">全部问题</option>{['结构与拼写','填入内容','使用场景'].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>模板分类<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label className="template-sort">排序<select value={sort} onChange={e=>setSort(e.target.value)}><option value="count">涉及作文最多</option><option value="recent">最近出现</option></select></label>
   </div>
   {groups.length?groups.map((g,i)=><Group key={g.id} group={g} onOpen={onOpen} initialOpen={i===0}/>):<p className="template-empty">{result.groups.length?'当前筛选条件下没有相关问题。':'当前题型暂无可确认的模板句错误。'}</p>}
   <details className="template-reminders"><summary><Info size={17}/><span><strong>模板使用提醒</strong><small>重复表达、论证补充与可选优化</small></span><span className="template-reminder-count">{reminders.reduce((n,g)=>n+g.evidence.length,0)} 条<ChevronDown size={16}/></span></summary>
    {reminders.length?reminders.map(g=><Group key={g.id} group={g} onOpen={onOpen}/>):<p className="template-empty">当前条件下暂无使用提醒。</p>}
   </details>
   {result.unlocated>0&&<p className="caption template-pending">另有 {result.unlocated} 条批注的原文位置待核对，暂未计入；可在原批阅中检查关联位置。</p>}
  </>}
 </section>;
}
