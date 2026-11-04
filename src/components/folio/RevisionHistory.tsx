import {useMemo,useState} from 'react';
import {wordDiff,type WritingVersion} from '../../lib/revisions';
import {wordCount,type Review} from '../../lib/folio';
import {dateLabel} from '../../lib/client';
export default function RevisionHistory({versions,reviews}:{versions:WritingVersion[];reviews:Review[]}){
  const [selected,setSelected]=useState('');const sorted=useMemo(()=>[...versions].sort((a,b)=>a.version-b.version),[versions]);
  const current=sorted.find(v=>v.id===selected)||sorted[sorted.length-1],index=sorted.findIndex(v=>v.id===current?.id),prior=sorted[index-1];
  const diff=useMemo(()=>current&&prior?wordDiff(prior.text,current.text):[],[current,prior]);
  if(!current)return null;
  return <section className="panel history-panel"><details><summary>修改记录 <span className="caption">{sorted.length} 个可查版本 · 当前 V{sorted.at(-1)?.version}</span></summary>
    {sorted.some(v=>v.historyIncomplete)&&<p className="review-version-note">历史资料恢复：仅列出可核对的送审快照和现存正文，无法恢复的中间修改及时间为 not given。两者之间的差异不代表一次完整修改操作。</p>}
    <ol className="revision-list">{sorted.map((v,i)=><li key={v.id}><button className={v.id===current.id?'active':''} onClick={()=>setSelected(v.id)}><strong>V{v.version}</strong><span>{v.createdAt?dateLabel(v.createdAt):'not given'}</span><small>{i?`${wordCount(sorted[i-1].text)} → `:''}{wordCount(v.text)} words</small></button></li>)}</ol><label className="history-select">查看版本<select aria-label="选择正文历史版本" value={current.id} onChange={e=>setSelected(e.target.value)}>{[...sorted].reverse().map(v=><option key={v.id} value={v.id}>V{v.version} · {v.source==='submitted'?'首次提交':v.source==='edit'?'保存修改':v.source==='legacySnapshot'?'历史送审快照':v.source==='legacyCurrent'?'历史现存正文':'恢复的正文'} · {v.createdAt?dateLabel(v.createdAt):'not given'}</option>)}</select></label>
    <div className="history-meta"><span>{current.createdAt?dateLabel(current.createdAt):'not given'} · {wordCount(current.text)} words</span><span>{reviews.filter(r=>r.revisionId===current.id).map(r=>r.label).join('、')||'无关联批阅'}</span></div>
    {prior?<><h3>V{prior.version} → V{current.version} <small>{wordCount(prior.text)} → {wordCount(current.text)} words</small></h3><p className="caption">绿色：新增；红色删除线：移除。仅显示这一对已存版本的差异。</p><div className="revision-diff english">{diff.map((p,i)=>p.type==='add'?<ins key={i}>{p.value}</ins>:p.type==='remove'?<del key={i}>{p.value}</del>:<span key={i}>{p.value}</span>)}</div><div className="history-full"><details><summary>修改前全文 · V{prior.version}</summary><pre className="english">{prior.text}</pre></details><details><summary>修改后全文 · V{current.version}</summary><pre className="english">{current.text}</pre></details></div></>:<><p className="caption">{current.source==='submitted'?'首次提交的完整正文；后续每次保存修改都会另存版本。':'最早可核对的版本；此前修改记录为 not given。'}</p><pre className="history-baseline english">{current.text}</pre></>}
  </details></section>;
}
