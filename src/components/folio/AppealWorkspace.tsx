import {useMemo,useState,type ReactNode} from 'react';
import {PenLine,RotateCcw} from 'lucide-react';
import type {Review} from '../../lib/folio';
import type {ReviewNote,TextAnchor} from '../../lib/review-interactions';
import type {AppealCandidate,AppealMaterials} from '../../lib/annotation-appeal';
import {APPEAL_VERDICTS} from '../../lib/annotation-appeal';
import {KIND_LABELS,newPersonalNote,type CuratedNote} from '../../lib/review-curation';
import {readingRows} from '../../lib/sentence-reading';
import {api} from '../../lib/client';
import {formatAppealText} from '../../lib/appeal-format';
import CurationEditor from './CurationEditor';
import CurationTour from './CurationTour';
import MarkdownView from './MarkdownView';

interface Props {
 review:Review;
 note:ReviewNote;
 candidate:AppealCandidate;
 materials:AppealMaterials;
 original:string;
 anchor:TextAnchor|null;
 busy:boolean;
 error:string;
 onChange:(review:Review)=>void;
 onBusyChange:(busy:boolean)=>void;
 onKeep:()=>void;
 onRetry:()=>void;
 onAccept:()=>void;
}
function ComparisonRow({label,before,after,english=false,notice}:{label:string;before:string|null;after:string|null;english?:boolean;notice?:ReactNode}){
 const content=(value:string|null,format=false)=>value?<div className={english?'english':undefined}><MarkdownView markdown={format?formatAppealText(value):value}/></div>:<p className="caption">未提供</p>;
 return <section className="appeal-comparison-row" aria-label={label}>
  <h4>{label}</h4>
  <div className="appeal-comparison-cells">
   <div aria-label={`当前批注 · ${label}`}>{content(before)}</div>
   <div aria-label={`复核建议 · ${label}`}>{notice||content(after,!english)}</div>
  </div>
 </section>;
}
export default function AppealWorkspace({review,note,candidate,materials,original,anchor,busy,error,onChange,onBusyChange,onKeep,onRetry,onAccept}:Props){
 const rows=useMemo(()=>readingRows(original,review.study?.layout).rows,[original,review.study?.layout]);
 const sentence=rows.find(row=>anchor&&row.start<=anchor.start&&row.end>=anchor.end);
 const [draft,setDraft]=useState<CuratedNote|null>(()=>newPersonalNote(original,sentence?{start:sentence.start,end:sentence.end}:anchor));
 const [editorVersion,setEditorVersion]=useState(0),[saving,setSaving]=useState(false),[noteError,setNoteError]=useState(''),[saved,setSaved]=useState(false),[guideOpen,setGuideOpen]=useState(false);
 const decision=candidate.decision;
 const revised=decision.verdict==='revise'&&decision.patch?decision.patch:note;
 const expired=Date.now()>=candidate.expiresAt;
 const canAccept=!!candidate.changes.length&&!decision.unverifiedEvidence&&!expired;
 const source=materials.original||materials.sentence;
 const unavailable=decision.verdict==='withdraw'?'采纳后撤回这条意见，不再作为有效批注。':decision.verdict==='insufficient'?'证据不足，尚未形成可采纳的新批注。':null;
 async function saveNote(next:CuratedNote){
  if(busy||saving)return false;
  setSaving(true);onBusyChange(true);setNoteError('');
  try{
   const data=await api<{review:Review}>('saveReviewCuration',{
    reviewId:review.id,baseRevision:review.curation?.revision||0,operation:'upsert',note:next
   });
   const stored=data.review.curation?.notes[next.id];
   if(!stored)throw new Error('未能确认笔记保存结果，请保留当前内容后重试。');
   onChange(data.review);
   setDraft(stored);setEditorVersion(version=>version+1);setSaved(true);
   return true;
  }catch(error){setNoteError((error as Error).message);return false;}
  finally{setSaving(false);onBusyChange(false);}
 }
 return <div className="appeal-workspace">
  <section className="appeal-workspace-column appeal-comparison-column" aria-label="意见对照">
   <header><h3>意见对照</h3>{sentence?.number&&<span>第 {String(sentence.number).padStart(2,'0')} 句</span>}</header>
   <div className="appeal-comparison-body" tabIndex={0} aria-label="共同原文与批注对照">
    <section className="appeal-shared-source" aria-label="关联原文">
     <div className="appeal-source-heading"><h4>关联原文</h4>{note.position&&<div><span>关联位置：</span><MarkdownView markdown={note.position}/></div>}</div>
     {source?<blockquote className="english">{source}</blockquote>:<p className="caption">这条批注暂无可靠原文定位。</p>}
     {materials.original&&materials.sentence&&<details className="appeal-workspace-details"><summary>查看完整关联句子</summary><p className="english">{materials.sentence}</p></details>}
    </section>
    <section className="appeal-verdict-summary" aria-label="复核结论">
     <div className="appeal-verdict-heading"><h4>复核结论</h4><span className={`appeal-verdict-badge ${decision.verdict}`}>{APPEAL_VERDICTS[decision.verdict]}</span><span className="appeal-model">{candidate.model} · 本次复核</span></div>
     <div className="appeal-verdict-section"><h5>结论要点</h5><MarkdownView markdown={formatAppealText(decision.summary)}/></div>
     <div className="appeal-verdict-section"><h5>回应申诉</h5><MarkdownView markdown={formatAppealText(decision.response)}/></div>
    </section>
    <div className="appeal-comparison-table">
     <div className="appeal-comparison-headings">
      <section aria-label="当前批注"><h3>当前批注</h3><span className={`suggestion-kind ${note.kind}`}>{KIND_LABELS[note.kind]}</span></section>
      <section aria-label="复核建议"><h3>{decision.verdict==='revise'?'拟采纳批注':'复核建议'}</h3><span className={`suggestion-kind ${unavailable?'':revised.kind}`}>{decision.verdict==='withdraw'?'暂不采纳':decision.verdict==='insufficient'?'待补充材料':KIND_LABELS[revised.kind]}</span></section>
     </div>
     <ComparisonRow label="修改说明" before={note.explanation} after={revised.explanation} notice={unavailable?<p className="caption">{unavailable}</p>:undefined}/>
     <ComparisonRow label="建议表达" before={note.replacement} after={revised.replacement} english notice={unavailable?<p className="caption">{decision.verdict==='withdraw'?'撤回后不再应用此建议表达。':'尚无新的建议表达。'}</p>:undefined}/>
    </div>
    <div className="appeal-comparison-resources">
     <div><details className="appeal-workspace-details"><summary>查看原始批阅内容</summary><MarkdownView markdown={review.markdown}/></details></div>
     <div>
      {!!decision.evidence.length&&<details className="appeal-workspace-details"><summary>查看模型引用依据</summary><ul>{decision.evidence.map((quote,index)=><li key={index}><q>{quote}</q></li>)}</ul></details>}
      {!!candidate.changes.length&&<details className="appeal-workspace-details"><summary>查看逐项改动</summary>{candidate.changes.map(change=><section key={change.field}><h4>{change.field}</h4><small>当前</small><p>{change.before}</p><small>拟采纳</small><p>{change.after}</p></section>)}</details>}
     </div>
    </div>
    {decision.neededContext&&<p className="annotation-config-notice">需要补充 {decision.neededContext}</p>}
    {candidate.changes.length>0&&note.kind==='correction'&&(decision.verdict==='withdraw'||decision.patch?.kind!=='correction')&&<p className="caption">明确关联这条批注的问题统计会随采纳结果更新。</p>}
    {decision.verdict==='withdraw'&&<p className="caption">采纳后可在「暂不采纳」中找到并恢复这条意见。</p>}
    {decision.verdict==='revise'&&!candidate.changes.length&&<p className="caption">建议内容与当前批注相同。</p>}
   </div>
   <div className="appeal-decision-notices" aria-live="polite">
    {!!decision.unverifiedEvidence&&<p className="annotation-config-notice">有 {decision.unverifiedEvidence} 段引文无法在已发送材料中核对，已略去。请补充材料或重新复核后再采纳。</p>}
    {expired&&<p className="caption">预览已过期，请重新提交申诉。</p>}
    {error&&<p className="error" role="alert">{error}</p>}
   </div>
   <footer className="appeal-pane-actions" aria-label="申诉操作">
    <button type="button" className="button ghost appeal-retry" disabled={busy||saving} onClick={onRetry}><RotateCcw size={16}/>补充理由后重试</button>
    <div className="appeal-decision-actions">
     <button type="button" className="button outline" disabled={busy||saving} onClick={onKeep}>保留当前批注</button>
     {!!candidate.changes.length&&<button type="button" className="button primary" disabled={busy||saving||!canAccept} onClick={onAccept}>{decision.verdict==='withdraw'?'确认撤回这条意见':'采纳修改'}</button>}
    </div>
   </footer>
  </section>
  <section className="appeal-workspace-column appeal-note-column" aria-label="个人笔记">
   <header><h3><PenLine size={18}/>个人笔记</h3><span>{sentence?.number?`关联第 ${String(sentence.number).padStart(2,'0')} 句`:anchor?'关联原文范围':'可手动选择所属范围'}</span></header>
   {saved&&<p className="appeal-note-feedback" role="status">已保存到原有个人笔记，可在原文批注中继续编辑和复习。</p>}
   <div className="appeal-note-body">
    {draft?<CurationEditor embedded key={editorVersion} initial={draft} original={original} rows={rows} busy={busy||saving} error={noteError}
     onGuide={()=>setGuideOpen(true)} onCancel={()=>{setDraft(null);setNoteError('');}} onSave={saveNote}/>
    :<div className="appeal-note-empty"><p>记录这次复核中值得记住的表达或方法。</p><button type="button" className="button outline small" disabled={busy||saving} onClick={()=>{setDraft(newPersonalNote(original,sentence?{start:sentence.start,end:sentence.end}:anchor));setSaved(false);}}>添加个人笔记</button></div>}
   </div>
   {guideOpen&&<CurationTour startStep={1} enterAfter={false} onExit={()=>setGuideOpen(false)}/>}
  </section>
 </div>;
}
