import {ArrowUpRight} from 'lucide-react';
import {questionYearLabel} from '../../lib/folio';
import {dateLabel} from '../../lib/client';
import type {buildInsights,InsightEvidence,IssuePattern,RewriteComparison} from '../../lib/analytics-insights';

type OpenReview=(id:string,reviewId?:string,noteId?:string)=>void;
type Insights=ReturnType<typeof buildInsights>;
const open=(e:InsightEvidence,onOpen:OpenReview)=>onOpen(e.writingId,e.reviewId,e.noteId);

function EvidenceList({items,onOpen,owners,owner}:{items:InsightEvidence[];onOpen:OpenReview;owners:Map<string,string>;owner:string}){
 return <div className="insight-evidence-list">{items.map(e=>{
  const shared=owners.get(e.id)!==owner;
  return <article key={e.id}>
   <button className="text-button" onClick={()=>open(e,onOpen)}>{questionYearLabel(e.question)} · {e.question.title}<ArrowUpRight size={13}/></button>
   {!shared&&<>
    {e.original&&<blockquote className="english">{e.original}</blockquote>}
    {e.replacement&&<p className="insight-replacement"><small>批阅修改句</small><span className="english">{e.replacement}</span></p>}
    {e.text&&<p>{e.text}</p>}
    {e.classificationReason&&<p>分类依据：{e.classificationReason}</p>}
    <small>{e.classificationSource==='llm'?'LLM 分类':e.classificationSource==='manual'?'人工分类':e.manual?'人工整理':'原批阅依据'}</small>
   </>}
  </article>;
 })}</div>;
}
function PatternDetails({pattern,onOpen,owners}:{pattern:IssuePattern;onOpen:OpenReview;owners:Map<string,string>}){
 const last=pattern.evidence.reduce((a,b)=>a.createdAt>b.createdAt?a:b);
 return <details className="insight-pattern" id={'pattern-'+pattern.id}>
  <summary><span>{pattern.title}</span><small>{pattern.writingCount} 稿 · {pattern.questionCount} 题</small></summary>
  <p className="caption">最近出现于 {questionYearLabel(last.question)} · {last.question.title}（{dateLabel(last.createdAt)}）
   {pattern.sameQuestionCount>0&&` · ${pattern.sameQuestionCount} 题有多稿提及`}</p>
  <EvidenceList items={pattern.evidence} onOpen={onOpen} owners={owners} owner={pattern.id}/>
 </details>;
}
function scoreLabel(s:RewriteComparison['beforeScore']){
 const point=s.point===null?'':`${s.point} / ${s.max}`;
 const range=s.low===null||s.high===null?'':`${s.low}–${s.high}`;
 return [point,range&&`区间 ${range}`].filter(Boolean).join(' · ')||'未提供估分';
}
function showPattern(id:string){
 const section=document.getElementById('pattern-'+id);
 if(section instanceof HTMLDetailsElement){
  section.open=true;
  section.querySelector('summary')?.focus();
  section.scrollIntoView({block:'nearest'});
 }
}
export default function AnalyticsInsights({insights,onOpen}:{insights:Insights;onOpen:OpenReview}){
 const owners=new Map<string,string>();
 for(const section of [...insights.patterns,...insights.strengths])
  for(const item of section.evidence)if(!owners.has(item.id))owners.set(item.id,section.id);
 const changes=insights.sampleCount>=6
  ?insights.patterns.filter(p=>p.recentCount!==p.priorCount).sort((a,b)=>Math.abs(b.recentCount-b.priorCount)-Math.abs(a.recentCount-a.priorCount)).slice(0,4)
  :[];
 const recurringStrengths=insights.strengths.filter(s=>s.id!=='kept'&&s.writingCount>1);
 return <div className="analytics-insights">
  <section className="panel stats-section"><h2>主要观察</h2>
   {insights.observations.length>0&&<ul className="analytics-observations">{insights.observations.map(p=><li key={p.id}>
    <button className="text-button" onClick={()=>showPattern(p.id)}>{p.title}</button>
    <span>{p.writingCount} 稿提及，涉及 {p.questionCount} 题{p.sameQuestionCount>0&&`，其中 ${p.sameQuestionCount} 题有多稿提及`}。</span>
   </li>)}</ul>}
   {changes.length>0&&<><h3 className="insight-subheading">前 3 稿与最近 3 稿</h3><ul className="analytics-observations">{changes.map(p=><li key={p.id}>
    <button className="text-button" onClick={()=>showPattern(p.id)}>{p.title}</button><span>{p.priorCount} / 3 稿 → {p.recentCount} / 3 稿</span>
   </li>)}</ul></>}
   {recurringStrengths.length>0&&<p>多稿获肯定：{recurringStrengths.map(s=>`${s.title}（${s.writingCount} 稿）`).join('、')}。</p>}
   {!insights.observations.length&&!changes.length&&!recurringStrengths.length&&<p className="caption">当前批阅尚未形成跨稿重复记录。</p>}
  </section>
  <section className="panel stats-section"><h2>具体失误模式</h2>{insights.patterns.filter(p=>!p.task).map(p=><PatternDetails key={p.id} pattern={p} onOpen={onOpen} owners={owners}/>)}
   {!insights.patterns.some(p=>!p.task)&&<p className="caption">暂无可归纳的记录。</p>}
  </section>
  <section className="panel stats-section"><h2>任务与论证表现</h2>{insights.tasks.map(p=><PatternDetails key={p.id} pattern={p} onOpen={onOpen} owners={owners}/>)}
   {!insights.tasks.length&&<p className="caption">暂无可归纳的记录。</p>}
  </section>
  <section className="panel stats-section"><h2>重写与新题对照</h2>
   <h3 className="insight-subheading">同题重写</h3>{insights.rewrites.length?insights.rewrites.map(pair=><article className="insight-comparison" key={pair.after.reviewId}>
    <h4>{questionYearLabel(pair.after.question)} · {pair.after.question.title}</h4>
    <div className="insight-pair-actions">{([[pair.before,pair.beforeScore],[pair.after,pair.afterScore]] as const).map(([e,score])=><div key={e.reviewId}>
     <button className="text-button" onClick={()=>open(e,onOpen)}>{e.text}<ArrowUpRight size={13}/></button><p>{scoreLabel(score)}</p>
    </div>)}</div>
    <dl className="insight-recipe"><div><dt>再次提到</dt><dd>{pair.repeated.join('；')||'—'}</dd></div>
     <div><dt>本次未提及</dt><dd>{pair.notMentioned.join('；')||'—'}</dd></div>
     <div><dt>本次新提到</dt><dd>{pair.newlyMentioned.join('；')||'—'}</dd></div>
    </dl>
   </article>):<p className="caption">暂无前稿和重写稿均已批阅的记录。</p>}
   <h3 className="insight-subheading">换题后的观察</h3>{insights.reuse.length?insights.reuse.map((r,i)=><article className="insight-comparison" key={i}>
    <h4>{r.title} · 新题正文出现了原建议表达</h4><blockquote className="english">{r.phrase}</blockquote>
    <p>{r.flagged?'新题批阅提到同一模式。':'新题批阅未提到同一模式。'}</p>
    <div className="insight-pair-actions"><button className="text-button" onClick={()=>open(r.before,onOpen)}>原建议<ArrowUpRight size={13}/></button>
     <button className="text-button" onClick={()=>open(r.after,onOpen)}>新题 · {questionYearLabel(r.after.question)}<ArrowUpRight size={13}/></button></div>
   </article>):<p className="caption">暂无建议表达在后续新题正文中复现的记录。</p>}
  </section>
  <section className="panel stats-section"><h2>值得保留的写法</h2>{insights.strengths.length?insights.strengths.map(s=><details className="insight-pattern" key={s.id}>
   <summary><span>{s.title}</span><small>{s.writingCount} 稿</small></summary>
   <EvidenceList items={s.evidence} onOpen={onOpen} owners={owners} owner={s.id}/>
  </details>):<p className="caption">暂无明确的正面评价或可保留批注。</p>}</section>
 </div>;
}
