import {useEffect,useRef,useState} from 'react';
import type {Question} from '../../lib/folio';
import {examName,questionYearLabel,typeName} from '../../lib/folio';
import type {AdviceView} from '../../lib/expression-advice';
import {dateLabel} from '../../lib/client';
import './expression-advice.css';

export async function adviceAPI<T=AdviceView>(action:string,data:object={},signal?:AbortSignal):Promise<T>{
 const r=await fetch('/api/expression-advice',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal});
 let value;try{value=await r.json();}catch{throw new Error('服务未返回有效结果，请稍后重试');}
 if(!r.ok)throw new Error(value.error||'读取失败，请稍后重试');return value;
}
export default function ExpressionAdvicePanel({question,onClose}:{question:Question;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),running=useRef(false);
 const [snapshot,setSnapshot]=useState<AdviceView|null>(null),[loading,setLoading]=useState(true),[phase,setPhase]=useState<'context'|'advice'|null>(null),[error,setError]=useState('');
 const [opened,setOpened]=useState<Set<string>>(()=>new Set()),[notice,setNotice]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,el=dialog.current!,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';alive.current=true;return()=>{alive.current=false;el.close();document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};},[]);
 useEffect(()=>{const abort=new AbortController();adviceAPI('read',{questionId:question.id},abort.signal).then(value=>{if(!abort.signal.aborted)setSnapshot(value);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[question.id]);
 async function read(){const value=await adviceAPI('read',{questionId:question.id});if(alive.current)setSnapshot(value);return value;}
 async function waitFor(value:AdviceView,target:'context'|'advice') {
  const started=Date.now();
  while(alive.current&&value.task?.status==='pending'&&value.task.phase===target) {
   if(Date.now()-started>5*60*1000)throw new Error('请求仍在处理中，请稍后重新读取结果。');
   await new Promise(resolve=>setTimeout(resolve,1400));if(!alive.current)return value;value=await read();
  }
  if(value.task?.status==='failed'&&value.task.phase===target)throw new Error(value.task.error||'生成未完成，请手动重试');
  return value;
 }
 async function generate(regenerate=false,refreshContext=false) {
  if(running.current)return;running.current=true;setError('');setNotice('');
  const requestId=crypto.randomUUID();
  try {
   setPhase('context');
   let value=await adviceAPI('prepare',{questionId:question.id,requestId,refresh:refreshContext});
   if(!alive.current)return;setSnapshot(value);value=await waitFor(value,'context');
   if(!alive.current)return;
   if(!value.context||value.contextStale)throw new Error('客观题面尚未准备完成，请重新读取或重试');
   setPhase('advice');value=await adviceAPI('generate',{questionId:question.id,requestId,regenerate});
   if(!alive.current)return;setSnapshot(value);value=await waitFor(value,'advice');
   if(alive.current){setSnapshot(value);setOpened(new Set());}
  }catch(e){if(alive.current){setError((e as Error).message);try{await read();}catch{}}}
  finally{running.current=false;if(alive.current)setPhase(null);}
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('示例已复制');}catch{setNotice('复制未成功，请选中示例文字复制。');}}
 const result=snapshot?.result,items=result?.items||[],busy=!!phase;
 function toggle(key:string){setOpened(old=>{const next=new Set(old);next.has(key)?next.delete(key):next.add(key);return next;});}
 return <dialog ref={dialog} className="expression-advice-dialog" aria-labelledby="advice-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <header className="advice-header"><div><p className="advice-eyebrow">考前表达调用</p><h2 id="advice-title">本题表达调用卡</h2><p>{questionYearLabel(question)} · {examName(question)} · {typeName(question.type)} · {question.title}</p></div><button className="advice-close" onClick={onClose} aria-label="关闭表达调用卡" autoFocus>×</button></header>
  <div className="advice-body" aria-busy={loading||busy}>
   <section className="advice-recall-intro"><span className="advice-intro-mark" aria-hidden="true">想起 · 适配 · 用出</span><h3>先想一想，这道题能调用哪些已有表达？</h3><p>先看中文线索，在心里回想英文，再展开核对。重点记住“什么时候用、换题怎么改”。</p></section>
   {error&&<div className="advice-error" role="alert"><span>{error}</span></div>}
   {notice&&<p className="advice-notice" role="status">{notice}</p>}
   {loading?<p className="advice-loading" role="status">正在读取已保存的调用卡…</p>:<>
    {!result&&<section className="advice-empty"><p>从你的表达库中，精选适合本题的10条表达。</p><small>句式与词条自由组合；点击生成后才准备题面。结果保存后可随时回看。</small><button className="button primary" disabled={busy} onClick={()=>void generate()}>生成本题调用卡</button>{snapshot?.task?.status==='pending'&&<button className="text-button" disabled={busy} onClick={()=>void read().catch(e=>setError(e.message))}>重新读取正在生成的结果</button>}</section>}
    {busy&&<div className="advice-generating" role="status"><span className="advice-pulse"/><div><strong>{phase==='context'?'正在准备客观题面':'正在选择10条表达并编写应用示例'}</strong><p>{phase==='context'?'优先复用已保存题面；缺失时读取公开描述，必要时独立整理。':'围绕本题的表达意图，检查适配位置、固定骨架与换题方法。'}</p></div></div>}
    {snapshot?.context&&<details className="advice-context"><summary>查看本次采用的客观题面<span>{snapshot.context.origin==='public-page'?'公开整理页':snapshot.context.origin==='directions'?'原始题干':'作文与批阅整理'}</span></summary><p className="advice-context-text">{snapshot.context.description}</p>{snapshot.context.sourceURL&&<a href={snapshot.context.sourceURL} target="_blank" rel="noreferrer">核对公开来源 ↗</a>}{snapshot.context.uncertainties.length>0&&<div className="advice-context-uncertain"><strong>未纳入推荐依据的待核对内容</strong>{snapshot.context.uncertainties.map((s,i)=><p key={i}>{s}</p>)}</div>}{question.images.length>0&&<details><summary>对照题图</summary>{question.images.map(src=><img key={src} src={src} loading="lazy" alt={`${question.title}原题图`}/>)}</details>}<button className="text-button" disabled={busy} onClick={()=>void generate(true,true)}>重新整理题面并更新调用卡</button></details>}
    {result&&<>
     {snapshot?.stale&&<p className="advice-stale">题面或表达库已有更新。当前保留旧卡，可点击下方重新生成。</p>}
     <section className="advice-angle"><small>本题调用路线 · 可选写作思路</small><p>{result.angle}</p></section>
     <div className="advice-list-heading"><h3>{items.length}条表达 · 先回想，再展开</h3><button className="text-button" onClick={()=>setOpened(opened.size===items.length?new Set():new Set(items.map(i=>i.entry.key)))}>{opened.size===items.length?'收起全部':'展开全部'}</button></div>
     {result.shortfall&&<p className="advice-shortfall">{result.shortfall}</p>}
     <div className="advice-items">{items.map((item,index)=>{const open=opened.has(item.entry.key);return <article className="advice-item" key={item.entry.key}>
      <div className="advice-item-top"><span className="advice-item-number">{String(index+1).padStart(2,'0')}</span><span>{item.stage}</span><small>{item.entry.kind==='sentence'?'句式':'词条'}</small></div>
      <h4>{item.cue}</h4><p className="advice-why">{item.why}</p>
      <button className="advice-reveal" aria-expanded={open} aria-controls={`advice-item-${index}`} onClick={()=>toggle(item.entry.key)}>{open?'收起英文与示例':'我想好了，展开核对'}<span aria-hidden="true">{open?'−':'＋'}</span></button>
      {open&&<div className="advice-answer" id={`advice-item-${index}`}><div className="advice-source-expression"><small>表达库原式</small><p lang="en">{item.entry.expression}</p></div><div className="advice-example"><div><small>本题应用示例</small><button className="text-button" onClick={()=>void copy(item.example)}>复制示例</button></div><p lang="en">{item.example}</p><p>{item.translation}</p></div><div className="advice-transfer"><strong>换题怎么改</strong><p>{item.adaptation}</p><strong>使用边界</strong><p>{item.avoid}</p></div><details className="advice-entry-detail"><summary>查看表达条目</summary><p>{item.entry.title} · {item.entry.category}</p>{item.entry.meaning&&<p>{item.entry.meaning}</p>}{item.entry.substitutions&&<p>可替换组：{item.entry.substitutions}</p>}{item.entry.forms.length>0&&<p lang="en">{item.entry.forms.join(' / ')}</p>}<small>生成时已有 {item.entry.used} 篇作文使用记录，仅供参考；展示的是当时条目快照。</small></details></div>}
     </article>;})}</div>
     <footer className="advice-footer"><p>生成于 {dateLabel(result.createdAt)} · {result.model}<br/>同一道题共用这张卡，重新写作不重复生成。</p><button className="button outline small" disabled={busy} onClick={()=>void generate(true)}>{busy?'正在生成…':'重新生成10条建议'}</button></footer>
    </>}
   </>}
  </div>
 </dialog>;
}
