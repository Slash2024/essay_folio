import {useEffect,useRef,useState} from 'react';
import type {Question} from '../../lib/folio';
import {examName,questionYearLabel,typeName} from '../../lib/folio';
import type {AdviceProgress,AdviceView} from '../../lib/expression-advice';
import {dateLabel} from '../../lib/client';
import './expression-advice.css';

import {adviceAPI,streamAdvice,AdviceConnectionError} from '../../lib/expression-advice-client';
export default function ExpressionAdvicePanel({question,onClose}:{question:Question;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),running=useRef(false);
 const [snapshot,setSnapshot]=useState<AdviceView|null>(null),[loading,setLoading]=useState(true),[phase,setPhase]=useState<'context'|'advice'|null>(null),[error,setError]=useState('');
 const [progress,setProgress]=useState<AdviceProgress|null>(null),[connection,setConnection]=useState<'live'|'recovering'>('live'),[now,setNow]=useState(Date.now()),[lastActivity,setLastActivity]=useState(Date.now());
 const started=useRef(Date.now()),progressBox=useRef<HTMLElement>(null);
 useEffect(()=>{if(phase)progressBox.current?.scrollIntoView({block:'nearest',behavior:'auto'});},[!!phase]);
 const [opened,setOpened]=useState<Set<string>>(()=>new Set()),[notice,setNotice]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,el=dialog.current!,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';alive.current=true;return()=>{alive.current=false;el.close();document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};},[]);
 useEffect(()=>{const abort=new AbortController();adviceAPI('read',{questionId:question.id},abort.signal).then(value=>{if(!abort.signal.aborted){setSnapshot(value);if(value.task?.status==='failed')setError(value.task.error||'上次生成未完成，请手动重试');}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[question.id]);
 async function read(taskId?:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const value=await adviceAPI('read',{questionId:question.id,...(taskId?{taskId}:{})},controller.signal);if(alive.current){setSnapshot(value);setLastActivity(Date.now());if(value.task?.progress)setProgress(value.task.progress);}return value;}finally{clearTimeout(timer);}
 }
 function receive(value:AdviceProgress){if(alive.current){setProgress(value);setConnection('live');setLastActivity(Date.now());}}
 useEffect(()=>{if(!phase)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[phase]);
 async function waitFor(value:AdviceView,target:'context'|'advice',taskId?:string,recovering=false) {
  const waitingSince=Date.now();let errors=0,expected=taskId||value.task?.id;
  if(alive.current)setPhase(target);
  while(alive.current&&value.task?.status==='pending'&&value.task.phase===target) {
   if(Date.now()-waitingSince>15*60*1000)throw new Error('尚未确认任务结果。请稍后重新读取；不会自动重复生成。');
   if(recovering&&alive.current)setConnection('recovering');
   await new Promise(resolve=>setTimeout(resolve,Math.min(8000,2000*2**Math.min(errors,2))));
   if(!alive.current)return value;
   try{value=await read(expected);errors=0;if(alive.current)setConnection('live');}
   catch(e){errors++;if(alive.current)setConnection('recovering');if(Date.now()-waitingSince>15*60*1000)throw new Error('暂时无法连接云端，请稍后重新读取结果。');}
  }
  if(value.task?.status==='failed'&&value.task.phase===target)throw new Error(value.task.error||'生成未完成，请手动重试');
  return value;
 }
 async function phaseRequest(action:'prepare'|'generate',data:object,target:'context'|'advice') {
  try {
   const value=await streamAdvice(action,data,receive,()=>{if(alive.current){setLastActivity(Date.now());setConnection('live');}});
   if(alive.current)setSnapshot(value);
   return waitFor(value,target,value.task?.id);
  }catch(error){
   if(!(error instanceof AdviceConnectionError))throw error;
   if(alive.current){setConnection('recovering');setNotice('连接暂时中断，正在查询已有任务，不会重复提交生成。');}
   let value:AdviceView|undefined;
   for(let attempt=0;attempt<5&&alive.current;attempt++){
    try{value=await read(error.taskId);break;}catch{await new Promise(resolve=>setTimeout(resolve,Math.min(8000,1000*2**attempt)));}
   }
   if(!value)throw new Error('暂时无法确认生成状态。请稍后重新读取，避免重复生成。');
   if(value.task?.phase===target&&value.task.status==='pending')return waitFor(value,target,value.task.id,true);
   if(value.task?.phase===target&&value.task.status==='failed')throw new Error(value.task.error||'生成未完成，请手动重试');
   if((target==='context'&&value.context&&!value.contextStale)||(target==='advice'&&value.result&&value.task?.phase==='advice'&&value.task.status==='ready'))return value;
   throw new Error('连接已中断，暂未找到本次生成结果。请重新读取状态后再决定是否重试。');
  }
 }
 async function generate(regenerate=false,refreshContext=false) {
  if(running.current)return;running.current=true;setError('');setNotice('');setProgress(null);setConnection('live');started.current=Date.now();setNow(Date.now());setLastActivity(Date.now());
  try {
   const requestId=crypto.randomUUID();setPhase('context');
   let value=await phaseRequest('prepare',{questionId:question.id,requestId,refresh:refreshContext},'context');
   if(!alive.current)return;
   if(!value.context||value.contextStale)throw new Error('客观题面尚未准备完成，请重新读取或重试');
   setPhase('advice');setProgress({stage:'candidates',message:'正在整理表达候选',startedAt:new Date(started.current).toISOString(),updatedAt:new Date().toISOString()});
   value=await phaseRequest('generate',{questionId:question.id,requestId,regenerate},'advice');
   if(alive.current){setSnapshot(value);setOpened(new Set());setNotice('调用卡已保存，可随时回看。');}
  }catch(e){if(alive.current){setError((e as Error).message);try{await read();}catch{}}}
  finally{running.current=false;if(alive.current)setPhase(null);}
 }
 // Reopening an active task observes its saved state only; no paid call starts.
 useEffect(()=>{
  const task=snapshot?.task;if(loading||running.current||task?.status!=='pending')return;
  running.current=true;started.current=Date.parse(task.createdAt);setNow(Date.now());setPhase(task.phase);
  void waitFor(snapshot!,task.phase,task.id).catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{running.current=false;if(alive.current)setPhase(null);});
 },[loading,snapshot?.task?.id]);
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
    {!result&&!busy&&<section className="advice-empty"><p>从你的表达库中，精选适合本题的10条表达。</p><small>句式与词条自由组合；点击生成后才准备题面。结果保存后可随时回看。</small><button className="button primary" disabled={busy} onClick={()=>void generate()}>生成本题调用卡</button>{snapshot?.task?.status==='pending'&&<button className="text-button" disabled={busy} onClick={()=>void read().catch(e=>setError(e.message))}>重新读取正在生成的结果</button>}</section>}
    {busy&&<section ref={progressBox} className="advice-generation-progress" aria-label="调用卡生成进度">
     <div className="advice-progress-heading"><strong>{connection==='recovering'?'正在恢复连接并查询结果':progress?.message||(phase==='context'?'正在准备客观题面':'正在整理表达候选')}</strong><span>已用时 {Math.floor(Math.max(0,now-started.current)/60000)}:{String(Math.floor(Math.max(0,now-started.current)/1000)%60).padStart(2,'0')}</span></div>
     <ol className="advice-progress-steps">{([['context','客观题面'],['candidates','表达候选'],['model','模型生成'],['validation','结果核对'],['saving','云端保存']] as const).map(([stage,label],index)=>{const order=['context','candidates','model','validation','saving','done'],current=order.indexOf(progress?.stage||(phase==='context'?'context':'candidates')),state=index<current?'done':index===current?'active':'waiting';return <li key={stage} data-state={state} aria-current={state==='active'?'step':undefined}><i aria-hidden="true">{state==='done'?'✓':index+1}</i><span>{label}</span></li>;})}</ol>
     <div className="advice-progress-detail" role="status">{progress?.stage==='model'?<p>{progress.receivedCharacters?`已接收 ${progress.receivedCharacters} 字符 · ${progress.receivedItems||0}/10 条完整表达待核对`:'模型正在组织答案，首次返回可能需要较长时间。'}</p>:<p>{progress?.stage==='context'?'仅整理客观事实，已保存的题面会直接复用。':progress?.candidateCount?`已读取 ${progress.candidateCount} 条启用表达。`:'正在等待云端阶段信息…'}</p>}<small>{connection==='recovering'?'连接暂时不稳定，正在查询原任务；不会自动重新付费生成。':`连接正常 · ${Math.max(0,Math.floor((now-lastActivity)/1000))} 秒前收到状态`} · 单次模型请求最多等待5分钟</small></div>
    </section>}
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
