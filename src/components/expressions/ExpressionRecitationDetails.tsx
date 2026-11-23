import {useEffect,useState} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight} from 'lucide-react';
import {dateLabel} from '../../lib/client';
import {performanceRequest} from '../../lib/expression-performance-client';
import type {RecitationDetails} from '../../lib/expression-performance';
export default function ExpressionRecitationDetails({entryKey,revision,onOpen}:{entryKey:string;revision:number;onOpen:(id:string)=>void}){
  const [offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const [data,setData]=useState<RecitationDetails|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();setPending(true);setData(null);setError('');
    performanceRequest<{details:RecitationDetails}>(revision,entryKey,offset,controller.signal)
      .then(r=>{if(!controller.signal.aborted)setData(r.details);})
      .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setPending(false);});
    return()=>controller.abort();
  },[entryKey,revision,offset,retry]);
  return <section className="expression-recitation-details" aria-label="默写记录" aria-busy={pending}>
    {pending&&<p className="muted" role="status">正在读取默写记录…</p>}
    {error&&<p className="error" role="alert">{error} <button className="text-button" onClick={()=>setRetry(n=>n+1)}>重试</button></p>}
    {data&&<>
      <p className="caption">答对 {data.count.correct} / {data.count.correct+data.count.incorrect} · 待复核 {data.count.pending} · 补充重练 {data.count.practices} 次</p>
      {!!data.count.shared&&<p className="expression-shared-note">另有 {data.count.shared} 次同题多表达作答，无法明确归属本条，暂不计入本条次数和准确率。</p>}
      {!data.total&&<p className="muted expression-no-records">尚无已提交的默写记录。仅被抽到、尚未作答的题目不计入次数。</p>}
      {data.items.map(item=><article className="expression-recitation-row" key={`${item.sessionId}-${item.index}`}>
        <div className="expression-recitation-row-heading"><span>{dateLabel(item.createdAt)} · {item.mode==='meaning'?'中文释义':'情景描述'}</span><b className={`recitation-${item.verdict}`}>{item.practiceOnly?'补充重练 · ':''}{item.verdict==='pending'?'待复核':item.verdict==='shared'?'同题待归属':item.verdict==='correct'?'答对':item.skipped?'想不起来':'答错'}{item.corrected?' · 已复核':''}</b></div>
        <details className="expression-answer-detail"><summary>查看题目与作答</summary><p>{item.prompt}</p><p className="english">{item.skipped?'本次选择“想不起来”':item.answer}</p><p className="caption">{item.reason}</p>{item.practice&&<p className="caption">补充重练：{item.practice.skipped?'想不起来':item.practice.verdict==='correct'?'答对':'答错'}（不改变首次作答成绩）</p>}</details>
        <button className="text-button" onClick={()=>onOpen(item.sessionId)}>前往本轮默写记录<ArrowUpRight size={13}/></button>
      </article>)}
      {(offset>0||data.hasNext)&&<div className="pagination"><button className="button ghost small" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-10))}><ChevronLeft size={14}/>上一页</button><span>{Math.floor(offset/10)+1} / {Math.max(1,Math.ceil(data.total/10))}</span><button className="button ghost small" disabled={!data.hasNext} onClick={()=>setOffset(n=>n+10)}>下一页<ChevronRight size={14}/></button></div>}
      <p className="caption expression-stat-rule">按当前条目内容汇总首次提交作答；准确率采用复核后结果，待复核不计入分母。新轮次的错题重练按新作答计入。</p>
    </>}
  </section>;
}
