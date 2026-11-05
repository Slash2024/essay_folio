import {useMemo,useState} from 'react';
import type {Review,Writing,Question} from '../../lib/folio';
import {wordCount} from '../../lib/folio';
import type {WritingVersion} from '../../lib/revisions';
import {withScoreMaximum,applyOverrides,parseReview,SECTION_NAMES,ISSUE_CATEGORIES,type ReviewIssue,type IssueCategory} from '../../lib/review-analysis';
import {api} from '../../lib/client';
import MarkdownView from './MarkdownView';
function Content({value}:{value:string|null|undefined}){return value?<MarkdownView markdown={value}/>:<span className="not-given">not given</span>;}
function IssueEditor({issue,review,onChange}:{issue:ReviewIssue;review:Review;onChange:(r:Review)=>void}){
 const [editing,setEditing]=useState(false),[values,setValues]=useState<IssueCategory[]>(issue.categories),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <article className="issue-card"><Content value={issue.evidence}/><div className="issue-tags">{issue.categories.length?issue.categories.map(c=><span key={c} className="issue-tag">{c}</span>):<span className="caption">待分类</span>}<small>{issue.manual?'手动分类':'规则建议'}</small><button className="text-button" onClick={()=>{setValues(issue.categories);setEditing(!editing);setError('');}}>调整分类</button></div>{editing&&<form className="category-editor" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await api('saveIssueCategories',{reviewId:review.id,issueId:issue.id,categories:values,baseUpdatedAt:review.analysisUpdatedAt||''});onChange(r.review);setEditing(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><div>{ISSUE_CATEGORIES.map(c=><label key={c}><input type="checkbox" checked={values.includes(c)} onChange={e=>setValues(e.target.checked?(c==='不计入问题'?[c]:[...values.filter(x=>x!=='不计入问题'),c]):values.filter(x=>x!==c))}/>{c}</label>)}</div><p className="caption">可多选，空选表示待分类；“不计入问题”将排除这一条。</p>{error&&<p className="error" role="alert">{error}</p>}<button className="button primary small" disabled={busy}>保存分类</button></form>}</article>;
}
export default function ReviewSections({question,review,writing,versions,onChange}:{question?:Question;review:Review;writing:Writing|null;versions:WritingVersion[];onChange:(r:Review)=>void}){
 const a=useMemo(()=>withScoreMaximum(review.analysis||applyOverrides(parseReview(review.markdown),review.issueOverrides),question||writing?.questionSnapshot),[review,question,writing?.questionSnapshot]);const bound=versions.find(v=>v.id===review.revisionId);const prefix=`review-${review.id}`;
 return <div className="structured-review"><div className="analysis-score"><div><span>原始作文估分</span><strong>{a.score.point??'not given'} <small>/ {a.score.max??'not given'}</small></strong></div><div><span>合理区间</span><b>{a.score.low!==null?`${a.score.low}–${a.score.high}`:'not given'}</b></div><div><span>预估档次</span><Content value={a.score.band}/></div><div><span>批阅对应正文</span><b>{bound?`V${bound.version}`:'not given'}</b><small>系统计数 {bound?wordCount(bound.text):'not given'} words</small></div></div>
 {review.binding==='legacySnapshot'&&<p className="review-version-note">历史特例：此批阅已关联到核对后的送审快照 V{bound?.version??'not given'}。当前显示的正文是后来修改的 V{writing?.revision||1}，两者均保留，可在“修改记录”查看差异。正文现已锁定。</p>}
 <div className="analysis-info"><span>批阅工具：not given</span><span>模型：not given</span><span>规则解析 v{a.parserVersion} · {a.sections.filter(Boolean).length}/8 部分</span></div>
 <nav className="analysis-nav" aria-label="批阅章节">{SECTION_NAMES.map((n,i)=><a key={n} href={`#${prefix}-${i}`}>{i+1}. {n}</a>)}</nav>
 {SECTION_NAMES.map((name,i)=><section id={`${prefix}-${i}`} key={name} className="analysis-section"><h3><span>{i+1}</span>{name}</h3>
 {i===0?<dl className="analysis-fields">{Object.entries(a.task).map(([label,value])=><div key={label}><dt>{label}</dt><dd><Content value={value}/></dd></div>)}</dl>
 :i===2?(a.corrections.length?a.corrections.map((c,j)=><article className="correction-card" key={j}><span className="caption">句子 {j+1}</span><div className="correction-pair"><div><h4>原句</h4><Content value={c.original}/></div><div><h4>修改为</h4><Content value={c.revision}/></div></div><h4>说明</h4><Content value={c.explanation}/></article>):<Content value={a.sections[i]}/>)
 :i===3?(a.optimizations.length?a.optimizations.map((o,j)=><article className="optimization-card" key={j}><h4>位置 {j+1}</h4><Content value={o.position}/><h4>可以补充 / 调整</h4><Content value={o.addition}/><h4>作用</h4><Content value={o.effect}/></article>):<Content value={a.sections[i]}/>)
 :i===4?<><p className="caption">统计依据：{a.issueSource==='remembered'?'本节重点问题':a.issueSource==='corrections'?'本节缺失，回退到逐句批改':'not given'}。每一类按篇去重，个性化优化不计入问题。</p>{a.issues.length?a.issues.map(issue=><IssueEditor key={review.id+issue.id} issue={issue} review={review} onChange={onChange}/>):<Content value={a.sections[i]}/>}</>
 :i===5?<><p className="caption">批阅标注字数：{a.revisedReportedWords||'not given'} · 提取稿系统计数：{a.revisedEssay?wordCount(a.revisedEssay):'not given'} words。此处为修改稿，评分卡针对原始作文。</p><Content value={a.sections[i]}/></>
 :i===6?(a.expressions.length?<div className="expression-analysis-list">{a.expressions.map((e,j)=><article key={j}><Content value={e.expression}/><small>可用于</small><Content value={e.usage}/></article>)}</div>:<Content value={a.sections[i]}/>)
 :i===7?<><Content value={a.score.evidence}/><dl className="analysis-fields"><div><dt>得分优势</dt><dd><Content value={a.score.advantages}/></dd></div><div><dt>主要扣分点</dt><dd><Content value={a.score.deductions}/></dd></div></dl>{!a.sections[i]&&<span className="not-given">not given</span>}</>
 :<Content value={a.sections[i]}/>}
 </section>)}<p className="caption">解析仅整理原文，未接入 AI；如格式无法识别，可切换“Markdown 阅读”或“Markdown 原文”核对。</p></div>;
}
