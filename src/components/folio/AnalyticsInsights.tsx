import {ArrowUpRight} from 'lucide-react';
import {questionYearLabel} from '../../lib/folio';
import type {buildInsights,InsightEvidence,IssuePattern} from '../../lib/analytics-insights';

type OpenReview=(id:string,reviewId?:string,noteId?:string)=>void;
function EvidenceList({items,onOpen}:{items:InsightEvidence[];onOpen:OpenReview}){
 return <div className="insight-evidence-list">{items.map((e,i)=><article key={`${e.reviewId}-${e.noteId||i}`}>
  <button className="text-button" onClick={()=>onOpen(e.writingId,e.reviewId,e.noteId)}>{questionYearLabel(e.question)} · {e.question.title}<ArrowUpRight size={13}/></button>
  {e.original&&<blockquote className="english">{e.original}</blockquote>}
  {e.replacement&&<p className="insight-replacement"><small>建议表达</small><span className="english">{e.replacement}</span></p>}
  <p>{e.text}</p><small>{e.manual?'已按人工整理更新':'原批阅依据'}</small>
 </article>)}</div>;
}
function PatternDetails({pattern,onOpen}:{pattern:IssuePattern;onOpen:OpenReview}){
 return <details className="insight-pattern"><summary><span>{pattern.title}</span><small>{pattern.writingCount} 稿 · {pattern.questionCount} 道题</small></summary>
  <p className="caption">下方列出 {pattern.evidence.length} 条相关依据；同一稿件在出现稿件数中只计一次。</p>
  <dl className="insight-recipe"><div><dt>怎么练</dt><dd>{pattern.practice}</dd></div><div><dt>怎么验证</dt><dd>{pattern.check}</dd></div></dl>
  <EvidenceList items={pattern.evidence} onOpen={onOpen}/>
 </details>;
}
export default function AnalyticsInsights({insights,onOpen}:{insights:ReturnType<typeof buildInsights>;onOpen:OpenReview}){
 return <div className="analytics-insights">
  <section className="panel stats-section insight-priorities"><h2>下一篇先练什么</h2><p className="caption">先关注任务影响，再参考出现稿件数与最近三稿记录。每次最多三项；这是基于现有批阅的训练建议，不估算可提分数。</p>
   {insights.priorities.length?<div className="insight-priority-grid">{insights.priorities.map((p,i)=><article className="insight-priority" key={p.id}><span className="insight-number">{i+1}</span><h3>{p.title}</h3><p className="caption">{p.writingCount} 稿提到 · {p.questionCount} 道题 · 最近三稿中 {p.recentCount} 稿</p><dl className="insight-recipe"><div><dt>本次练法</dt><dd>{p.practice}</dd></div><div><dt>下篇检查</dt><dd>{p.check}</dd></div></dl><details><summary>查看批阅证据 · {p.evidence.length} 条</summary><EvidenceList items={p.evidence} onOpen={onOpen}/></details></article>)}</div>:<p className="empty-state">暂无足以生成训练建议的已分类问题，可先查看已有批阅。</p>}
  </section>
  <section className="panel stats-section"><h2>具体失误模式</h2><p className="caption">从已分类问题中提取具体模式。只有批阅明确提到时才细分，否则保留较宽的类别；可展开查看原句、修改及训练方法。</p>{insights.patterns.length?insights.patterns.map(p=><PatternDetails key={p.id} pattern={p} onOpen={onOpen}/>):<p className="empty-state">尚无可归纳的失误模式。</p>}</section>
  <section className="panel stats-section"><h2>重写与新题验证</h2><p className="caption">同题重写与换题运用分别展示。未再次提及，只表示本次批阅未提及；正文出现相同表达，也仍需核对语境。</p>
   <h3 className="insight-subheading">同题重写</h3>{insights.rewrites.length?insights.rewrites.map(pair=><article className="insight-comparison" key={`${pair.before.reviewId}-${pair.after.reviewId}`}><h4>{questionYearLabel(pair.after.question)} · {pair.after.question.title}</h4><div className="insight-pair-actions"><button className="text-button" onClick={()=>onOpen(pair.before.writingId,pair.before.reviewId)}>查看前稿<ArrowUpRight size={13}/></button><button className="text-button" onClick={()=>onOpen(pair.after.writingId,pair.after.reviewId)}>查看重写稿<ArrowUpRight size={13}/></button></div><p>{pair.scoreDelta===null?'两稿没有可直接对照的有效单点评分。':`两稿原文估分变化：${pair.scoreDelta>0?'+':''}${Number(pair.scoreDelta.toFixed(2))} 分；仅为批阅记录差异。`}</p><dl className="insight-recipe"><div><dt>再次提到</dt><dd>{pair.repeated.join('；')||'暂无匹配模式'}</dd></div><div><dt>本次未提及</dt><dd>{pair.notMentioned.join('；')||'暂无匹配模式'}<small>不据此认定已经解决。</small></dd></div><div><dt>本次新提到</dt><dd>{pair.newlyMentioned.join('；')||'暂无匹配模式'}</dd></div></dl></article>):<p className="insight-empty">尚无前稿与重写稿均已批阅的关联记录。使用“重写一稿”产生的记录，会在两稿批阅齐全后进入这里。</p>}
   <h3 className="insight-subheading">换题后的观察</h3>{insights.reuse.length?insights.reuse.map((r,i)=><article className="insight-comparison" key={`${r.after.reviewId}-${i}`}><h4>{r.title}：新题出现过建议表达</h4><blockquote className="english">{r.phrase}</blockquote><p>{r.flagged?'新题批阅仍指出同类问题，需结合具体位置核对。':'新题批阅未再次指出同一模式；是否用得恰当仍需结合上下文核对。'}</p><p className="caption">仅匹配批阅后提交的新题所绑定的正文版本，不使用批阅提供的完整修改稿；不推断独立完成或已经掌握。</p><div className="insight-pair-actions"><button className="text-button" onClick={()=>onOpen(r.before.writingId,r.before.reviewId,r.before.noteId)}>原建议<ArrowUpRight size={13}/></button><button className="text-button" onClick={()=>onOpen(r.after.writingId,r.after.reviewId)}>核对新题 · {questionYearLabel(r.after.question)}<ArrowUpRight size={13}/></button></div></article>):<p className="insight-empty">尚未匹配到建议表达在后续新题正文中的复现。先参考下方跨题问题，选择下一道题验证。</p>}
   {insights.transfers.length>0&&<details className="insight-pattern"><summary><span>跨题仍出现的问题</span><small>{insights.transfers.length} 类</small></summary>{insights.transfers.map(p=><div key={p.id}><h4>{p.title} · {p.questionCount} 道题</h4><EvidenceList items={p.evidence} onOpen={onOpen}/></div>)}</details>}
  </section>
  <section className="panel stats-section"><h2>任务与论证的下一步</h2><p className="caption">使用批阅已指出的任务、论证、信息准确性与格式问题，不另行生成维度分。</p>{insights.tasks.length?insights.tasks.map(p=><PatternDetails key={p.id} pattern={p} onOpen={onOpen}/>):<p className="empty-state">已有问题中尚无可归入任务与论证的明确证据。</p>}</section>
  <section className="panel stats-section"><h2>值得保留的写法</h2><p className="caption">来自原文的得分优势、总体评价及你确认可保留的批注；完整修改稿和推荐积累表达不作为原文优势。</p>{insights.strengths.length?insights.strengths.map(s=><details className="insight-pattern" key={s.id}><summary><span>{s.title}</span><small>{s.writingCount>=2?`${s.writingCount} 稿有记录`:'单稿观察'}</small></summary><p>{s.use}</p><EvidenceList items={s.evidence} onOpen={onOpen}/></details>):<p className="empty-state">尚未提取到明确的正面评价或可保留批注。</p>}</section>
 </div>;
}
