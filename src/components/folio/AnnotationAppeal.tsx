import {useEffect,useRef,useState} from 'react';
import {MessageSquareWarning,X} from 'lucide-react';
import {APPEAL_CRITERIA,APPEAL_REASON_LIMIT,APPEAL_VERDICTS,type AppealCandidate,type AppealMaterials} from '../../lib/annotation-appeal';
import type {Review} from '../../lib/folio';
import type {ReviewNote} from '../../lib/review-interactions';
import {KIND_LABELS} from '../../lib/review-curation';
import {annotationApi,api} from '../../lib/client';
import './annotation-appeal.css';

interface Props {
  review:Review;
  note:ReviewNote;
  disabled:boolean;
  onChange:(review:Review)=>void;
  onSetup?:()=>void;
}
interface MaterialPreview {materials:AppealMaterials;fingerprint:string}
type Config={configured:boolean;enabled:boolean;model:string};

export default function AnnotationAppeal({review,note,disabled,onChange,onSetup}:Props) {
  const [open,setOpen]=useState(false);
  const [preview,setPreview]=useState<MaterialPreview|null>(null);
  const [config,setConfig]=useState<Config|null>(null);
  const [reason,setReason]=useState('');
  const [includeContext,setIncludeContext]=useState(false);
  const [includeTask,setIncludeTask]=useState(false);
  const [includeWordRule,setIncludeWordRule]=useState(false);
  const [rubricBand,setRubricBand]=useState('');
  const [candidate,setCandidate]=useState<AppealCandidate|null>(null);
  const [working,setWorking]=useState<'preview'|'save'|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [hasRequest,setHasRequest]=useState(false);
  const requestId=useRef('');
  const controller=useRef<AbortController|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const canAppeal=!note.hidden&&note.origin!=='personal'&&['correction','optimization','keep'].includes(note.kind);
  const materials=preview?.materials;
  const canSend=!!preview&&!!config?.configured&&config.enabled&&!!reason.trim();

  useEffect(()=>{
    if(!open)return;
    const el=dialog.current,abort=new AbortController();
    el?.showModal();
    Promise.all([
      annotationApi<MaterialPreview>('appealMaterials',{reviewId:review.id,noteId:note.id},abort.signal),
      annotationApi<{config:Config}>('config',{},abort.signal)
    ]).then(([data,status])=>{
      if(abort.signal.aborted)return;
      setPreview(data);
      setConfig(status.config);
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return ()=>{abort.abort();controller.current?.abort();el?.close();};
  },[open,review.id,note.id]);

  function clearRequest(){
    requestId.current='';
    setHasRequest(false);
    setCandidate(null);
    setError('');
  }
  function openAppeal(){
    setError('');
    setConfig(null);
    setPreview(null);
    setOpen(true);
  }
  function close(){
    if(working==='save')return;
    controller.current?.abort();
    setWorking(null);
    setOpen(false);
  }
  async function generate(fresh=false){
    if(!canSend||!preview||working)return;
    if(fresh||!requestId.current)requestId.current=crypto.randomUUID();
    setHasRequest(true);
    const abort=new AbortController();
    controller.current=abort;
    setWorking('preview');
    setError('');
    setCandidate(null);
    try{
      const data=await annotationApi<{candidate:AppealCandidate}>('previewAppeal',{
        reviewId:review.id,noteId:note.id,requestId:requestId.current,fingerprint:preview.fingerprint,
        reason,includeContext,includeTask,includeWordRule,rubricBand:rubricBand===''?null:Number(rubricBand)
      },abort.signal);
      if(!abort.signal.aborted)setCandidate(data.candidate);
    }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
    finally{if(!abort.signal.aborted)setWorking(null);}
  }
  async function save(operation:'acceptAppeal'|'undoAppeal'){
    if(working)return;
    setWorking('save');
    setError('');
    try{
      const data=await api<{review:Review}>('saveReviewCuration',{
        reviewId:review.id,noteId:note.id,baseRevision:review.curation?.revision||0,operation,
        ...(operation==='acceptAppeal'?{candidateId:candidate?.id}:{versionId:note.appealVersion})
      });
      clearRequest();
      setReason('');
      setOpen(false);
      setMessage(operation==='acceptAppeal'?'已采纳裁定，详情可在整理记录中查看。':'已恢复本条申诉前的批注。');
      onChange(data.review);
    }catch(e){setError((e as Error).message);}
    finally{setWorking(null);}
  }

  if(!canAppeal&&!note.appealVersion)return null;
  return <div className="annotation-appeal">
    <div className="annotation-optimizer-tools">
      {canAppeal&&<button type="button" className="text-button" disabled={disabled||!!working} onClick={openAppeal}>
        <MessageSquareWarning size={14}/>申诉批注
      </button>}
      {note.appealVersion&&<button type="button" className="text-button" disabled={disabled||!!working} onClick={()=>save('undoAppeal')}>撤销本条申诉</button>}
    </div>
    {!open&&error&&<p className="error" role="alert">{error}</p>}
    {message&&<p className="caption" role="status">{message}</p>}
    {open&&<dialog ref={dialog} className="modal modal-wide annotation-dialog appeal-dialog" aria-label="申诉批注" onCancel={e=>{e.preventDefault();close();}}>
      <div className="modal-heading"><h2>申诉批注</h2><button type="button" className="icon-button" aria-label="关闭申诉" disabled={working==='save'} onClick={close}><X/></button></div>
      <p className="muted">按考研英语送审准则复核当前意见。生成后可先核对裁定与改动，再决定是否采纳。</p>
      {!materials&&!error&&<p role="status" className="caption">正在读取本条复核材料…</p>}
      {config&&(!config.configured||!config.enabled)&&<div className="annotation-config-notice"><p>请先启用现有模型配置。</p>{onSetup&&<button type="button" className="button outline small" onClick={()=>{close();onSetup();}}>前往 API 设置</button>}</div>}
      {materials&&<>
        <div className="annotation-preview-grid appeal-materials">
          <section><h3>关联原文</h3>
            {materials.original&&<p className="english">{materials.original}</p>}
            {materials.sentence&&<p className="english">{materials.sentence}</p>}
            {!materials.original&&!materials.sentence&&<p className="caption">这条批注暂无可靠原文定位。可先关联原文，或在理由中说明可供核对的依据。</p>}
          </section>
          <section><h3>当前批注 · {KIND_LABELS[note.kind]}</h3>
            {materials.note.position&&<p>{materials.note.position}</p>}
            {materials.note.explanation&&<p>{materials.note.explanation}</p>}
            {materials.note.replacement&&<p className="english">{materials.note.replacement}</p>}
          </section>
        </div>
        <label className="appeal-reason">申诉理由<textarea value={reason} maxLength={APPEAL_REASON_LIMIT}
          placeholder="例如，我认为原句语法成立，建议改法只是更简洁。"
          disabled={!!working||!!candidate} onChange={e=>{setReason(e.target.value);clearRequest();}}/></label>
        <details className="annotation-history appeal-inputs">
          <summary>复核准则与可选材料</summary>
          <p className="caption">{APPEAL_CRITERIA[materials.type]}</p>
          {materials.context&&<label className="annotation-context"><input type="checkbox" checked={includeContext} disabled={!!working||!!candidate} onChange={e=>{setIncludeContext(e.target.checked);clearRequest();}}/>附带前后句</label>}
          {includeContext&&materials.context&&<p className="appeal-excerpt english">{[materials.context.previous,materials.context.next].filter(Boolean).join('\n')}</p>}
          {materials.task&&<label className="annotation-context"><input type="checkbox" checked={includeTask} disabled={!!working||!!candidate} onChange={e=>{setIncludeTask(e.target.checked);clearRequest();}}/>附带题目文字要求</label>}
          {includeTask&&materials.task&&<><p className="appeal-excerpt english">{materials.task}</p><p className="caption">涉及题图内容时，可把相关文字或数值写入申诉理由。</p></>}
          {materials.wordRule&&<label className="annotation-context"><input type="checkbox" checked={includeWordRule} disabled={!!working||!!candidate} onChange={e=>{setIncludeWordRule(e.target.checked);clearRequest();}}/>附带字数与扣分条款</label>}
          {includeWordRule&&materials.wordRule&&<p className="appeal-excerpt">{materials.wordRule}</p>}
          {!!materials.rubricBands.length&&<label className="annotation-context">附带评分档次原文
            <select value={rubricBand} disabled={!!working||!!candidate} onChange={e=>{setRubricBand(e.target.value);clearRequest();}}>
              <option value="">不附带</option>
              {materials.rubricBands.map((band,index)=><option key={band} value={index}>{band.split(/[：:]/,1)[0]}</option>)}
            </select>
          </label>}
          {rubricBand!==''&&materials.rubricBands[Number(rubricBand)]&&<p className="appeal-excerpt">{materials.rubricBands[Number(rubricBand)]}</p>}
        </details>
      </>}
      {candidate&&<section className="appeal-result" aria-label="模型裁定">
        <span className="annotation-badge">{APPEAL_VERDICTS[candidate.decision.verdict]} · {candidate.model}</span>
        <h3>{candidate.decision.summary}</h3>
        <p>{candidate.decision.response}</p>
        {!!candidate.decision.evidence.length&&<ul>{candidate.decision.evidence.map((quote,index)=><li key={index}><q>{quote}</q></li>)}</ul>}
        {!!candidate.decision.unverifiedEvidence&&<p className="annotation-config-notice">有 {candidate.decision.unverifiedEvidence} 段引文无法在已发送材料中核对，已略去。你可以查看裁定说明，补充材料或重新复核后再采纳。</p>}
        {candidate.decision.neededContext&&<p className="annotation-config-notice">需要补充 {candidate.decision.neededContext}</p>}
        {candidate.changes.map(change=><div className="appeal-change" key={change.field}>
          <h4>{change.field}</h4>
          <div className="annotation-preview-grid"><section><small>当前</small><p>{change.before}</p></section><section><small>拟采纳</small><p>{change.after}</p></section></div>
        </div>)}
        {candidate.changes.length>0&&note.kind==='correction'&&(candidate.decision.verdict==='withdraw'||candidate.decision.patch?.kind!=='correction')&&<p className="caption">明确关联这条批注的问题统计会随采纳结果更新。</p>}
        {candidate.decision.verdict==='withdraw'&&<p className="caption">采纳后可在「暂不采纳」中找到并恢复这条意见。</p>}
        {Date.now()>=candidate.expiresAt&&<p className="caption">预览已过期，请重新提交申诉。</p>}
        {candidate.decision.verdict==='revise'&&!candidate.changes.length&&<p className="caption">建议内容与当前批注相同。</p>}
      </section>}
      {error&&<p className="error" role="alert">{error}</p>}
      {working==='preview'&&<p className="caption" role="status">正在复核这一条批注…</p>}
      <div className="annotation-dialog-actions">
        <button type="button" className="button ghost small" disabled={working==='save'} onClick={()=>{if(candidate)clearRequest();close();}}>
          {working==='preview'?'取消等待':candidate?'保留当前批注':'关闭'}
        </button>
        {candidate?<button type="button" className="button outline small" disabled={!!working} onClick={clearRequest}>补充理由后重试</button>
          :<button type="button" className="button primary small" disabled={!!working||!canSend} onClick={()=>generate()}>
            {hasRequest?'查询上次裁定':'提交申诉（调用一次）'}
          </button>}
        {!candidate&&hasRequest&&error&&<button type="button" className="button outline small" disabled={!!working||!canSend} onClick={()=>generate(true)}>重新提交（再次调用）</button>}
        {candidate&&!!candidate.changes.length&&!candidate.decision.unverifiedEvidence&&<button type="button" className="button primary small" disabled={!!working||Date.now()>=candidate.expiresAt} onClick={()=>save('acceptAppeal')}>
          {working==='save'?'正在采纳…':candidate.decision.verdict==='withdraw'?'确认撤回这条意见':'采纳修改'}
        </button>}
      </div>
    </dialog>}
  </div>;
}
