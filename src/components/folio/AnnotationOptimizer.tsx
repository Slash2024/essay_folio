import {useEffect,useRef,useState} from 'react';
import {Sparkles,X} from 'lucide-react';
import type {Review} from '../../lib/folio';
import {annotationApi,dateLabel} from '../../lib/client';
import {alignmentParts,currentAlignment,validateSegments,type AlignmentPair,type AlignmentCandidate} from '../../lib/annotation-alignment';
import {wordDiff} from '../../lib/revisions';
import SentenceChanges from './AnnotatedText';
export default function AnnotationOptimizer({review,noteId,pair,disabled,onChange,onSetup}:{review:Review;noteId:string;pair:AlignmentPair;disabled:boolean;onChange:(r:Review)=>void;onSetup?:()=>void}){
 const [open,setOpen]=useState(false),[config,setConfig]=useState<{configured:boolean;enabled:boolean;model:string}|null>(null),[candidate,setCandidate]=useState<AlignmentCandidate|null>(null),[context,setContext]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),requestId=useRef(''),controller=useRef<AbortController|null>(null),generation=useRef(0);
 const active=currentAlignment(review.alignments,noteId,pair),entry=review.alignments?.entries[noteId];
 const before=active?alignmentParts(active.segments):wordDiff(pair.original,pair.revised);
 useEffect(()=>{if(!open)return;const el=dialog.current;el?.showModal();el?.querySelector<HTMLElement>('button')?.focus();let live=true;annotationApi('config').then(d=>{if(live)setConfig(d.config);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;controller.current?.abort();el?.close();};},[open]);
 useEffect(()=>()=>{controller.current?.abort();generation.current++;},[]);
 function close(){controller.current?.abort();generation.current++;setBusy(false);setOpen(false);}
 async function generate(fresh=false){
  if(busy)return;if(fresh||!requestId.current)requestId.current=crypto.randomUUID();const turn=++generation.current;const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setMessage('');
  try{const d=await annotationApi('generate',{reviewId:review.id,noteId,requestId:requestId.current,includeContext:context},abort.signal);if(turn!==generation.current)return;
   if(d.candidate.original!==pair.original||d.candidate.revised!==pair.revised||d.candidate.display!==pair.display)throw new Error('原句或改稿已变化，请重新打开本条批注');validateSegments(d.candidate,pair);setCandidate(d.candidate);setMessage(d.cached?'已读取上次生成结果，本次未重复调用模型。':'文字校验通过；尚未应用到当前标注。');
  }catch(e){if(turn===generation.current)setError(abort.signal.aborted?'已取消等待；生成结果不会自动采纳。':(e as Error).message);}finally{if(turn===generation.current)setBusy(false);}
 }
 async function save(operation:'accept'|'undo'|'rules'){
  setBusy(true);setError('');try{const d=await annotationApi(operation,{reviewId:review.id,noteId,baseRevision:review.alignments?.revision||0,...(operation==='accept'?{candidateId:candidate?.id}:{})});onChange(d.review);setCandidate(null);requestId.current='';setMessage(operation==='accept'?'已采纳 LLM 分组，正文与原始批阅保留。':operation==='undo'?'已撤销上次展示调整。':'已恢复规则展示。');if(operation==='accept')setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="annotation-optimizer"><div className="annotation-optimizer-tools"><button className="text-button" disabled={disabled||busy} onClick={()=>{setError('');setOpen(true);}}><Sparkles size={14}/>LLM 优化标注</button>{entry?.undo.length?<button className="text-button" disabled={disabled||busy} onClick={()=>save('undo')}>撤销上次调整</button>:null}{entry?.current&&<button className="text-button" disabled={disabled||busy} onClick={()=>save('rules')}>恢复规则展示</button>}</div>
 {active&&<p className="annotation-badge">已采纳 LLM 分组 · {active.model} · {dateLabel(active.createdAt)}</p>}{entry?.current&&!active&&<p className="caption">原句、改稿或显示设置已更新，旧分组已失效，当前使用规则展示。</p>}
 {!open&&<>{error&&<p className="error" role="alert">{error}</p>}<p className="annotation-feedback" role="status">{message}</p></>}
 {open&&<dialog ref={dialog} className="modal modal-wide annotation-dialog" onCancel={e=>{e.preventDefault();close();}}><div className="modal-heading"><h2>优化这一条删改标注</h2><button className="icon-button" aria-label="关闭标注优化" onClick={close}><X/></button></div><p className="muted">发送本条原句、既定修改句和修改说明。仅重新划分对照片段；生成不会自动覆盖当前展示。</p>
 {config&&!config.configured||config&&!config.enabled?<div className="annotation-config-notice"><p>标注 API 尚未配置或启用。</p>{onSetup&&<button className="button outline small" onClick={()=>{close();onSetup();}}>前往 API 设置</button>}</div>:null}
 <label className="annotation-context"><input type="checkbox" checked={context} disabled={busy||!!candidate} onChange={e=>{setContext(e.target.checked);requestId.current='';}}/>附带前后句上下文，辅助理解指代和衔接</label>
 <div className="annotation-preview-grid"><section><h3>当前展示</h3><div className="sentence-proof-diff english"><SentenceChanges parts={before} mode={pair.display==='sentence'?'sentence':pair.display==='inline'?'inline':'auto'}/></div></section><section><h3>LLM 建议展示</h3>{candidate?<div className="sentence-proof-diff english" data-alignment-preview><SentenceChanges parts={alignmentParts(candidate.segments)}/></div>:<p className="study-empty">{busy?'正在生成候选分组…':'尚未生成。点击下方按钮后才调用 API。'}</p>}</section></div>
 {candidate&&<p className="caption">模型：{candidate.model} · 原句与修改句的逐字符一致性校验已通过。</p>}{error&&<p className="error" role="alert">{error}</p>}<p className="annotation-feedback" role="status">{message}</p>
 <div className="annotation-dialog-actions"><button className="button ghost small" onClick={()=>{setCandidate(null);if(!busy)requestId.current='';close();}}>{busy?'取消等待':'不采纳，关闭'}</button>{!candidate?<button className="button primary small" disabled={busy||!config?.configured||!config.enabled} onClick={()=>generate()}>{busy?'正在生成…':requestId.current?'查询上次结果 / 重试':'生成建议（调用一次）'}</button>:<button className="button primary small" disabled={busy} onClick={()=>save('accept')}>采纳这次分组</button>}{(candidate||error)&&<button className="button outline small" disabled={busy||!config?.configured||!config.enabled} onClick={()=>generate(true)}>重新生成（再次调用）</button>}</div>
 {entry?.events.length?<details className="annotation-history"><summary>本条采纳与撤销记录</summary>{[...entry.events].reverse().map((e,i)=><p key={i}>{dateLabel(e.at)} · {e.operation==='accept'?'采纳分组':e.operation==='undo'?'撤销上次调整':'恢复规则展示'}{e.target&&entry.versions.find(v=>v.id===e.target)?` · ${entry.versions.find(v=>v.id===e.target)!.model}`:''}</p>)}</details>:null}
 </dialog>}
 </div>;
}
