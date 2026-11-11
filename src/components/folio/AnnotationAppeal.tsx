import {useEffect,useRef,useState} from 'react';
import {MessageSquareWarning,X} from 'lucide-react';
import {APPEAL_REASON_LIMIT,type AppealCandidate,type AppealMaterials} from '../../lib/annotation-appeal';
import type {Review} from '../../lib/folio';
import type {ReviewNote,TextAnchor} from '../../lib/review-interactions';
import {confirmUnsavedNavigation} from '../../lib/navigation';
import AppealWorkspace from './AppealWorkspace';
import AppealMaterialsOptions from './AppealMaterialsOptions';
import {KIND_LABELS} from '../../lib/review-curation';
import {annotationApi,api} from '../../lib/client';
import './annotation-appeal.css';

interface Props {
  review:Review;
  original:string;
  anchor:TextAnchor|null;
  note:ReviewNote;
  disabled:boolean;
  onChange:(review:Review)=>void;
  onSetup?:()=>void;
}
interface MaterialPreview {materials:AppealMaterials;fingerprint:string}
type Config={configured:boolean;enabled:boolean;model:string};

export default function AnnotationAppeal({review,note,disabled,onChange,onSetup,original,anchor}:Props) {
  const [open,setOpen]=useState(false);
  const [preview,setPreview]=useState<MaterialPreview|null>(null);
  const [config,setConfig]=useState<Config|null>(null);
  const [reason,setReason]=useState('');
  const [includeContext,setIncludeContext]=useState(false);
  const [includeTask,setIncludeTask]=useState(false);
  const [includeWordRule,setIncludeWordRule]=useState(false);
  const [rubricBand,setRubricBand]=useState('');
  const [candidate,setCandidate]=useState<AppealCandidate|null>(null);
  const [savingNote,setSavingNote]=useState(false);
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
    if(working==='save'||savingNote||!confirmUnsavedNavigation())return false;
    controller.current?.abort();
    setWorking(null);
    setOpen(false);
    return true;
  }
  function keepCurrent(){if(close())clearRequest();}
  function retry(){if(!working&&!savingNote&&confirmUnsavedNavigation())clearRequest();}
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
    if(working||savingNote)return;
    if(operation==='acceptAppeal'&&!confirmUnsavedNavigation())return;
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
    {open&&<dialog ref={dialog} className={`modal modal-wide annotation-dialog appeal-dialog ${candidate?'appeal-workspace-dialog':''}`} aria-label="申诉批注" onCancel={e=>{e.preventDefault();close();}}>
      <div className="modal-heading"><h2>申诉批注</h2><button type="button" className="icon-button" aria-label="关闭申诉" disabled={working==='save'||savingNote} onClick={close}><X/></button></div>
      {!candidate&&<p className="muted">按考研英语送审准则复核当前意见。生成后可先核对裁定与改动，再决定是否采纳。</p>}
      {!materials&&!error&&<p role="status" className="caption">正在读取本条复核材料…</p>}
      {config&&(!config.configured||!config.enabled)&&<div className="annotation-config-notice"><p>请先启用现有模型配置。</p>{onSetup&&<button type="button" className="button outline small" onClick={()=>{close();onSetup();}}>前往 API 设置</button>}</div>}
      {materials&&<details className="appeal-submitted-materials" open={candidate?undefined:true}><summary>{candidate?'查看申诉理由与复核材料':'申诉材料'}</summary>
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
        <AppealMaterialsOptions materials={materials} includeContext={includeContext} includeTask={includeTask}
          includeWordRule={includeWordRule} rubricBand={rubricBand} disabled={!!working||!!candidate}
          onContextChange={value=>{setIncludeContext(value);clearRequest();}}
          onTaskChange={value=>{setIncludeTask(value);clearRequest();}}
          onWordRuleChange={value=>{setIncludeWordRule(value);clearRequest();}}
          onRubricChange={value=>{setRubricBand(value);clearRequest();}}/>

      </details>}
      {candidate&&materials&&<AppealWorkspace
        review={review} note={note} candidate={candidate} materials={materials}
        original={original} anchor={anchor} busy={!!working} error={error}
        onChange={onChange} onBusyChange={setSavingNote} onKeep={keepCurrent}
        onRetry={retry} onAccept={()=>save('acceptAppeal')}
      />}
      {!candidate&&<>
        {error&&<p className="error" role="alert">{error}</p>}
        {working==='preview'&&<p className="caption" role="status">正在复核这一条批注…</p>}
        <div className="annotation-dialog-actions">
          <button type="button" className="button ghost small" disabled={working==='save'} onClick={close}>
            {working==='preview'?'取消等待':'关闭'}
          </button>
          <button type="button" className="button primary small" disabled={!!working||!canSend} onClick={()=>generate()}>
            {hasRequest?'查询上次裁定':'提交申诉（调用一次）'}
          </button>
          {hasRequest&&error&&<button type="button" className="button outline small" disabled={!!working||!canSend} onClick={()=>generate(true)}>重新提交（再次调用）</button>}
        </div>
      </>}
    </dialog>}
  </div>;
}
