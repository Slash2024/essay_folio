import {useState} from 'react';
import {api} from '../../lib/client';
import {questionYearLabel,type Question} from '../../lib/folio';
import {CLASSIFICATION_CATEGORIES,type AnalyticsIssue} from '../../lib/analytics';
import {CLASSIFICATION_BATCH_SIZE,type ClassificationCandidate} from '../../lib/issue-classification';
import {plain} from '../../lib/review-analysis';

export interface PendingIssue {
 reviewId:string;writingId:string;issue:AnalyticsIssue;question:Question;
}
const itemKey=(reviewId:string,issueId:string)=>JSON.stringify([reviewId,issueId]);

export default function IssueClassification({items,onOpen,onSaved}:{items:PendingIssue[];onOpen:(id:string,reviewId?:string,noteId?:string)=>void;onSaved:()=>Promise<void>}){
 const [selected,setSelected]=useState<string[]>([]);
 const [candidates,setCandidates]=useState<ClassificationCandidate[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const byKey=new Map(items.map(item=>[itemKey(item.reviewId,item.issue.id),item]));
 const active=candidates.filter(c=>byKey.has(itemKey(c.reviewId,c.issueId)));
 async function generate(){
  setBusy(true);setError('');
  try{
   const targets=selected.flatMap(key=>{
    const item=byKey.get(key);
    return item?[{reviewId:item.reviewId,issueId:item.issue.id}]:[];
   });
   const result=await api<{candidates:ClassificationCandidate[]}>('classifyIssues',{items:targets});
   setCandidates(result.candidates);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 async function accept(){
  setBusy(true);setError('');
  try{
   await api('acceptIssueClassification',{items:active.filter(c=>c.categories.length)});
   setCandidates([]);setSelected([]);
   await onSaved();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 if(!items.length)return null;
 return <section className="panel stats-section">
  <h2>待分类重点问题 <small>· {items.length} 条</small></h2>
  {active.length?<div className="insight-evidence-list">{active.map(candidate=>{
   const key=itemKey(candidate.reviewId,candidate.issueId),item=byKey.get(key)!;
   return <article key={key}>
    <button className="text-button" onClick={()=>onOpen(item.writingId,item.reviewId,item.issue.noteId)}>{questionYearLabel(item.question)} · {item.question.title}</button>
    <p>{plain(item.issue.evidence)}</p><p><strong>模型依据</strong>　{candidate.reason}</p>
    <fieldset className="analytics-labels" disabled={busy}><legend>采纳类别（空选保留待分类）</legend>
     {CLASSIFICATION_CATEGORIES.map(category=><label key={category}><input type="checkbox" checked={candidate.categories.includes(category)} onChange={e=>{
      const categories=e.target.checked?[...candidate.categories,category]:candidate.categories.filter(c=>c!==category);
      setCandidates(values=>values.map(value=>value===candidate?{...value,categories}:value));
     }}/>{category}</label>)}
    </fieldset>
   </article>;
  })}<div className="insight-pair-actions">
   <button className="button primary small" disabled={busy||!active.some(c=>c.categories.length)} onClick={accept}>{busy?'正在保存…':'采纳所选类别'}</button>
   <button className="text-button" disabled={busy} onClick={()=>{setCandidates([]);setError('');}}>返回待分类列表</button>
  </div></div>:<>
   <p className="caption">每批最多 {CLASSIFICATION_BATCH_SIZE} 条。点击分类后才使用已配置的模型。</p>
   <details className="insight-pattern" open><summary><span>选择问题</span><small>{selected.length} / {CLASSIFICATION_BATCH_SIZE}</small></summary>
    <div className="insight-evidence-list">{items.map(({reviewId,issue,question,writingId})=>{
     const key=itemKey(reviewId,issue.id),checked=selected.includes(key);
     return <article key={key}>
      <label><input type="checkbox" checked={checked} disabled={busy||(!checked&&selected.length>=CLASSIFICATION_BATCH_SIZE)}
       onChange={e=>setSelected(values=>e.target.checked?[...values,key]:values.filter(value=>value!==key))}/> {plain(issue.evidence)}</label>
      <p><button className="text-button" onClick={()=>onOpen(writingId,reviewId,issue.noteId)}>{questionYearLabel(question)} · {question.title}</button></p>
     </article>;
    })}</div>
   </details>
   <button className="button primary small" disabled={busy||!selected.some(key=>byKey.has(key))} onClick={generate}>{busy?'正在分类…':'使用 LLM 分类'}</button>
  </>}
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
