import {useEffect,useState} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,LoaderCircle} from 'lucide-react';
import {api,dateLabel} from '../../lib/client';
import {examName,questionYearLabel,typeName,type Question} from '../../lib/folio';
import type {ExpressionUsageDetails as Details,ExpressionUsageOccurrence} from '../../lib/expression-usage';

function Context({item}:{item:ExpressionUsageOccurrence}){
  const parts=[];let last=0;
  for(const s of item.spans){parts.push(item.context.slice(last,s.start));parts.push(<mark key={s.start}>{item.context.slice(s.start,s.end)}</mark>);last=s.end;}
  parts.push(item.context.slice(last));
  return <p className="english expression-usage-context">{item.leading?'…':''}{parts}{item.trailing?'…':''}</p>;
}

export default function ExpressionUsageDetails({entryId,revision,questions,onOpen}:{entryId:string;revision:number;questions:Question[];onOpen:(id:string)=>void}){
  const [offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const [data,setData]=useState<Details|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(true);
  useEffect(()=>{
    let active=true;setPending(true);setError('');setData(null);
    api<{details:Details}>('expressionUsageDetails',{entryId,baseRevision:revision,offset}).then(r=>{if(active)setData(r.details);})
      .catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setPending(false);});
    return()=>{active=false;};
  },[entryId,revision,offset,retry]);
  return <section className="expression-usage-details" aria-label="表达使用明细" aria-busy={pending}>
    <h4>使用明细</h4>
    {pending&&<p className="muted" role="status"><LoaderCircle size={15} className="spin"/>正在读取命中正文…</p>}
    {error&&<p className="error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>重试</button></p>}
    {data&&<><p className="caption">当前共 {data.total} 次 · 涉及 {data.writingCount} 稿 · 每页 20 次</p>
      {data.items.map((item,i)=>{const q=questions.find(q=>q.id===item.questionId);return <article className="expression-usage-occurrence" key={`${item.writingId}-${offset+i}`}>
        <div className="expression-usage-occurrence-heading"><strong>{q?`${questionYearLabel(q)} · ${examName(q)} · ${typeName(q.type)} · ${q.title}`:'历史作文'}</strong>
          <button className="text-button" onClick={()=>onOpen(item.writingId)}>打开原记录<ArrowUpRight size={14}/></button></div>
        <p className="caption">{item.status==='reviewed'?'已批阅':'待批阅'} · 第 {item.revision} 版 · {dateLabel(item.updatedAt)} · {item.approximate?'近似匹配':'文字／词形匹配'}</p>
        <Context item={item}/><p className="caption">{item.reasons.join('、')}</p>
      </article>;})}
      {!data.items.length&&<p className="muted">当前没有使用记录。正文可能已修改或删除，请刷新统计。</p>}
      {(offset>0||data.hasNext)&&<div className="pagination"><button className="button ghost small" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-20))}><ChevronLeft size={14}/>上一页</button>
        <span>{Math.floor(offset/20)+1} / {Math.max(1,Math.ceil(data.total/20))}</span>
        <button className="button ghost small" disabled={!data.hasNext} onClick={()=>setOffset(n=>n+20)}>下一页<ChevronRight size={14}/></button></div>}
    </>}
  </section>;
}
