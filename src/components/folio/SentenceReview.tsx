import AnnotationOptimizer from './AnnotationOptimizer';
import AnnotationAppeal from './AnnotationAppeal';
import {alignmentInput} from '../../lib/alignment-input';
import {currentAlignment,alignmentParts} from '../../lib/annotation-alignment';
import CurationTour from './CurationTour';
import {CURATION_GUIDE_VERSION,type GuideStatus} from '../../lib/curation-guide';
import {curatedNotes,asCurated,KIND_LABELS,type CuratedNote} from '../../lib/review-curation';
import CurationEditor from './CurationEditor';
import CurationHistory from './CurationHistory';
import SentenceBinding from './SentenceBinding';
import SentenceChanges from './AnnotatedText';
import ReadingSentenceText,{CrossSentenceRevisions} from './ReadingSentenceText';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Bookmark,Copy,LocateFixed,Settings2} from 'lucide-react';
import type {Review} from '../../lib/folio';
import type {ReviewAnalysis} from '../../lib/review-analysis';
import {plain} from '../../lib/review-analysis';
import {wordDiff} from '../../lib/revisions';
import {EMPTY_STUDY_ENTRY,reviewNotes,type StudyEntry,type StudyStatus,type ReviewNote} from '../../lib/review-interactions';
import {READING_LABELS,readingRows,sentenceDisplays,locateReviewNotes,type ReadingRow,type ReadingLayout,type LocatedReviewNote} from '../../lib/sentence-reading';
import {api} from '../../lib/client';
import MarkdownView from './MarkdownView';
const STATUS:Record<StudyStatus,string>={unread:'未复习',revisit:'需要再看',mastered:'已掌握'};
function Source({value}:{value:string|null}){return value?<MarkdownView markdown={value}/>:<span className="not-given">not given</span>;}
function NoteCard({item,entry,busy,original,onSave,onLocate,editMode,onEdit,onCuration,baseNote,review,onChange,onSetup,rows,onBind}:{rows:ReadingRow[];onBind:(row:ReadingRow|null)=>Promise<boolean>;review:Review;onChange:(r:Review)=>void;onSetup?:()=>void;item:LocatedReviewNote;entry:StudyEntry;busy:boolean;original:string;onSave:(id:string,change:Partial<StudyEntry>)=>void;onLocate:()=>void;editMode:boolean;onEdit:()=>void;onCuration:(operation:string,extra:Record<string,unknown>)=>Promise<boolean>;baseNote?:ReviewNote}){
 const {note,range,source}=item;const [copyMessage,setCopyMessage]=useState('');
 const pair=useMemo(()=>alignmentInput(note,original),[note,original]);const accepted=pair?currentAlignment(review.alignments,note.id,pair):null;
 const diff=accepted?alignmentParts(accepted.segments):note.original&&note.replacement?wordDiff(note.original,plain(note.replacement)):null;const manual=!!note.origin;
 const location=note.scope==='global'||note.kind==='task'?'全文':!range?'未定位':source==='manual'?'手动关联':source==='paragraph'?'按段落关联':source==='shared'?'按共同表达关联':'按原句关联';
 return <article className={`sentence-note-card ${note.kind} ${note.hidden?'curation-hidden-note':''}`} data-note-id={note.id}>
 <header className="sentence-note-heading">
  <div>
   <span className={`suggestion-kind ${note.kind}`}>{KIND_LABELS[note.kind]}</span>
   <h5>{note.appealVersion?'原意见 · ':''}{note.title}</h5>
   {manual&&<span className="curation-provenance">{note.appealVersion?'已采纳申诉':note.origin==='personal'?'个人补充':'人工整理'}</span>}
   {note.hidden&&<span className="curation-provenance">暂不采纳</span>}
  </div>
  <button className={`bookmark-button ${entry.starred?'active':''}`} aria-label={`${entry.starred?'取消收藏':'收藏'}${note.title}`} aria-pressed={entry.starred} disabled={busy} onClick={()=>onSave(note.id,{starred:!entry.starred})}><Bookmark size={17} fill={entry.starred?'currentColor':'none'}/></button>
 </header>
 <div className="sentence-note-content">
  {note.shortNote&&<p className="curation-short-note">{note.shortNote}</p>}
  {note.kind==='correction'?<>
   <div className="source-label">修改说明 <small>{note.appealVersion?'申诉采纳版 · 可核对原始意见':manual?'人工整理；原始建议可在下方核对':'来自批阅原文'}</small></div>
   <Source value={note.explanation}/>
  </>:note.kind==='optimization'?<>
   <dl className="sentence-note-fields">
    <dt>关联位置</dt><dd><Source value={note.position}/></dd>
    <dt>可以补充 / 调整</dt><dd><Source value={note.replacement}/></dd>
    <dt>作用与迁移说明</dt><dd><Source value={note.explanation}/></dd>
   </dl>
   <p className="caption sentence-note-tip">优化建议单独展示，不自动插入或改写左侧正文。</p>
  </>:<><Source value={note.explanation}/>{note.replacement&&<><div className="source-label">可保留 / 补充的表达</div><Source value={note.replacement}/></>}</>}
  <div className="sentence-note-meta">
   {!!note.categories.length&&<div className="suggestion-categories">{note.categories.map(c=><span key={c}>{c}</span>)}<small>原始规则分类</small></div>}
   <span className="sentence-note-location">{location}</span>
  </div>
  {manual&&baseNote&&<details className="curation-source-proof"><summary>核对自动解析原始建议</summary>{baseNote.original&&<><div className="source-label">原句</div><Source value={baseNote.original}/></>}{baseNote.replacement&&<><div className="source-label">原始改法 / 补充</div><Source value={baseNote.replacement}/></>}<div className="source-label">原始说明</div><Source value={baseNote.explanation}/></details>}
 </div>
 {(note.kind==='correction'||range||note.replacement)&&<div className="sentence-note-utilities">
  {note.kind==='correction'&&<details className="sentence-note-proof">
   <summary>核对原句与修改句</summary>
   {diff?<div className="sentence-proof-diff english"><SentenceChanges parts={diff} mode={note.display==='sentence'?'sentence':note.display==='inline'?'inline':'auto'}/></div>:<><Source value={note.original}/><Source value={note.replacement}/></>}
  </details>}
  {(range||note.replacement)&&<div className="sentence-note-actions">
   {range&&<button className="text-button" onClick={onLocate}><LocateFixed size={13}/>定位原文</button>}
   {note.replacement&&<button className="text-button" onClick={()=>navigator.clipboard.writeText(plain(note.replacement!)).then(()=>setCopyMessage('建议已复制')).catch(()=>setCopyMessage('复制失败，请检查剪贴板权限'))}><Copy size={13}/>复制建议</button>}
  </div>}
  <p className="sentence-copy-message" role="status">{copyMessage}</p>
 </div>}
 {!editMode&&!note.hidden&&note.kind!=='task'&&note.scope!=='global'&&(!range||source==='manual')&&
  <SentenceBinding title={note.title} rows={rows} busy={busy}
   currentId={rows.find(row=>range?.start===row.start&&range?.end===row.end)?.id}
   onSave={onBind}/>}
 <footer className="sentence-note-toolbar">
  <div className="sentence-note-decisions">
   <AnnotationAppeal review={review} note={note} disabled={busy||editMode} onChange={onChange} onSetup={onSetup}/>
   {pair&&<AnnotationOptimizer key={JSON.stringify([review.id,note.id,pair.original,pair.revised,pair.display])} review={review} noteId={note.id} pair={pair} disabled={busy||editMode} onChange={onChange} onSetup={onSetup}/>}
  </div>
  <div className="study-status-control"><label>复习状态<select aria-label={`${note.title}的复习状态`} value={entry.status} disabled={busy} onChange={e=>onSave(note.id,{status:e.target.value as StudyStatus})}>{Object.entries(STATUS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div>
  {editMode&&<div className="curation-note-tools"><button className="text-button" disabled={busy} onClick={onEdit}>编辑这条批注</button><button className="text-button" disabled={busy} onClick={()=>onCuration('upsert',{note:{...asCurated(note,range,original),hidden:!note.hidden}})}>{note.hidden?'恢复展示':'暂不采纳'}</button>{manual&&baseNote&&<button className="text-button" disabled={busy} onClick={()=>onCuration('restoreNote',{noteId:note.id})}>恢复原始建议</button>}</div>}
 </footer>
 </article>;
}
export default function SentenceReview({review,analysis,original,onChange,focusNoteId,onConfigureAI}:{onConfigureAI?:()=>void;focusNoteId?:string;review:Review;analysis:ReviewAnalysis;original:string;onChange:(r:Review)=>void}){
 const parsed=useMemo(()=>readingRows(original,review.study?.layout),[original,review.study?.layout]);
 const baseNotes=useMemo(()=>reviewNotes(analysis),[analysis]);const notes=useMemo(()=>curatedNotes(analysis,review.curation),[analysis,review.curation]);const located=useMemo(()=>locateReviewNotes(original,notes,review.study),[notes,original,review.study]);
 const displays=useMemo(()=>sentenceDisplays(original,parsed.rows,located.filter(n=>!n.note.hidden),review.alignments),[original,parsed.rows,located,review.alignments]);
 const [selected,setSelected]=useState(''),[view,setView]=useState<'sentence'|'unlocated'|'global'|'hidden'>('sentence'),[kind,setKind]=useState('all'),[status,setStatus]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[groupEdit,setGroupEdit]=useState(false),[openingEnd,setOpeningEnd]=useState(''),[endingStart,setEndingStart]=useState('');
 const [editMode,setEditMode]=useState(false),[editing,setEditing]=useState<CuratedNote|null>(null),[showHistory,setShowHistory]=useState(false);
 const [guideOpen,setGuideOpen]=useState(false),[guideEntry,setGuideEntry]=useState(false),[guideStep,setGuideStep]=useState(0),[guideChecked,setGuideChecked]=useState(false),[guideLoading,setGuideLoading]=useState(false),[guideNotice,setGuideNotice]=useState('');
 const reader=useRef<HTMLElement>(null),detail=useRef<HTMLElement>(null);
 const entries=review.study?.entries||{};
 const accepts=(n:LocatedReviewNote)=>{const e=entries[n.note.id]||EMPTY_STUDY_ENTRY;const grammar=n.note.categories.some(c=>['主谓一致','谓语与句子结构','时态与语态','单复数与冠词','介词与固定搭配','拼写与标点'].includes(c));return (kind==='all'||kind==='correction'&&n.note.kind==='correction'||kind==='optimization'&&n.note.kind==='optimization'||kind==='grammar'&&n.note.kind==='correction'&&grammar||kind==='content'&&(n.note.kind==='task'||n.note.kind==='correction'&&(!grammar||n.note.categories.some(c=>['指代与衔接','词义与主题','论证与任务','字数与格式','其他问题'].includes(c)))))&&(status==='all'||status==='starred'&&e.starred||status===e.status);};
 const rowView=displays.find(d=>d.row.id===selected)||displays.find(d=>d.row.kind==='sentence'&&d.notes.some(n=>n.note.kind==='correction'))||displays.find(d=>d.row.kind==='sentence')||displays[0];
 const row=rowView?.row,prose=parsed.rows.filter(r=>r.kind==='sentence'),activeIndex=prose.findIndex(r=>r.id===row?.id);
 const hidden=located.filter(n=>n.note.hidden),unlocated=located.filter(n=>!n.note.hidden&&n.note.kind!=='task'&&n.note.scope!=='global'&&!n.range),global=located.filter(n=>!n.note.hidden&&(n.note.kind==='task'||n.note.scope==='global'));
 const shown=(view==='sentence'?rowView?.notes||[]:view==='unlocated'?unlocated:view==='hidden'?hidden:global).filter(accepts);
 const appliedFocus=useRef('');
 useEffect(()=>{
  const key=review.id+':'+focusNoteId;if(!focusNoteId||appliedFocus.current===key)return;appliedFocus.current=key;
  const item=located.find(n=>n.note.id===focusNoteId);if(!item){setMessage('这条收藏已从当前整理稿移除，可查看整理记录。');return;}
  setKind('all');setStatus('all');
  const matching=displays.find(d=>d.notes.some(n=>n.note.id===focusNoteId));
  if(item.note.hidden)setView('hidden');else if(item.note.kind==='task'||item.note.scope==='global')setView('global');else if(matching){setSelected(matching.row.id);setView('sentence');}else setView('unlocated');
  const timer=setTimeout(()=>{const card=[...detail.current?.querySelectorAll<HTMLElement>('[data-note-id]')||[]].find(e=>e.dataset.noteId===focusNoteId);if(card){card.classList.add('bookmark-target');card.tabIndex=-1;card.scrollIntoView({block:'center'});card.focus({preventScroll:true});}},100);
  return()=>clearTimeout(timer);
 },[focusNoteId,review.id,located,displays]);
 const reviewed=notes.filter(n=>(entries[n.id]?.status||'unread')!=='unread').length;
 function selectRow(id:string,scroll=false){setSelected(id);setView('sentence');setError('');if(detail.current)detail.current.scrollTop=0;if(scroll&&window.matchMedia('(max-width: 900px)').matches)requestAnimationFrame(()=>detail.current?.scrollIntoView({block:'start',behavior:'smooth'}));}
 function locateRow(id=row?.id){if(!id)return;const el=reader.current?.querySelector<HTMLElement>(`[data-sentence-id="${id}"]`);el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus({preventScroll:true});}
 function locateItem(item:LocatedReviewNote){const d=displays.find(d=>d.notes.some(n=>n.note.id===item.note.id));if(d){setSelected(d.row.id);setView('sentence');requestAnimationFrame(()=>locateRow(d.row.id));}}
 function openGuide(step=0){if(busy||guideLoading)return;setGuideStep(step);setGuideEntry(false);setGuideOpen(true);}
 async function toggleEditing(){if(busy||editing||guideLoading)return;if(editMode){setEditMode(false);return;}if(guideChecked){setEditMode(true);return;}setGuideLoading(true);setGuideNotice('');try{const d=await api('getCurationGuide');if(d.guide?.version===CURATION_GUIDE_VERSION&&d.guide.status!=='unseen'){setGuideChecked(true);setEditMode(true);}else{setGuideStep(0);setGuideEntry(true);setGuideOpen(true);}}catch{setGuideNotice('暂时未能读取引导进度，可先体验示例或跳过后继续整理。');setGuideStep(0);setGuideEntry(true);setGuideOpen(true);}finally{setGuideLoading(false);}}
 async function finishGuide(status:Exclude<GuideStatus,'unseen'>,remember:boolean){const enter=guideEntry;setGuideOpen(false);setGuideEntry(false);setGuideChecked(remember);if(enter)setEditMode(true);setGuideNotice(status==='completed'?'引导已完成，可随时点击“新手引导”重看。':'已关闭引导，可随时从“新手引导”重新打开。');try{await api('saveCurationGuide',{version:CURATION_GUIDE_VERSION,status:remember?status:'unseen'});}catch{setGuideNotice('引导进度暂未保存，你仍可继续整理；下次可能再次提示。');}}
 async function curate(operation:string,extra:Record<string,unknown>={}){if(busy)return false;setBusy(true);setError('');setMessage('');try{const d=await api('saveReviewCuration',{reviewId:review.id,baseRevision:review.curation?.revision||0,operation,...extra});onChange(d.review);setMessage(d.unchanged?'整理内容没有变化':'人工整理已保存，原始作文、批阅与分数保留');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 function startNote(){setError('');setEditing({id:`manual-${crypto.randomUUID()}`,kind:'personal',title:'个人笔记',original:row?.text||null,replacement:null,explanation:null,position:null,categories:[],scope:row?'range':'global',anchor:row?{start:row.start,end:row.end}:null,display:'notes',shortNote:'',emphasis:'none',hidden:false,origin:'personal'});}
 const previousVersion=review.curation?.history.at(-2)?.id||'initial';
 async function save(id:string,change:Partial<StudyEntry>){
  if(busy)return false;
  setBusy(true);setError('');setMessage('');
  try{
   const d=await api('saveReviewStudy',{reviewId:review.id,noteId:id,baseRevision:review.study?.revision||0,entry:{...(entries[id]||EMPTY_STUDY_ENTRY),...change}});
   onChange(d.review);
   setMessage(Object.hasOwn(change,'anchor')?change.anchor?'句子绑定已保存':'已取消句子绑定':'复习记录已保存到云端');
   return true;
  }catch(e){setError((e as Error).message);return false;}
  finally{setBusy(false);}
 }
 async function bindNote(item:LocatedReviewNote,target:ReadingRow|null){
  const ok=await save(item.note.id,{anchor:target?{start:target.start,end:target.end}:null});
  if(ok){
   setKind('all');setStatus('all');
   if(target){setSelected(target.id);setView('sentence');requestAnimationFrame(()=>locateRow(target.id));}
   else setView('unlocated');
  }
  return ok;
 }
 function editGroups(){setOpeningEnd(parsed.layout?String(parsed.layout.openingEnd):'');setEndingStart(parsed.layout?String(parsed.layout.endingStart):'');setGroupEdit(!groupEdit);setError('');}
 async function saveGroups(){setBusy(true);setError('');setMessage('');try{const layout:ReadingLayout={openingEnd:Number(openingEnd),endingStart:Number(endingStart)};const d=await api('saveReviewLayout',{reviewId:review.id,baseRevision:review.study?.revision||0,layout});onChange(d.review);setGroupEdit(false);setMessage('文章分组已保存，仅调整阅读展示');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="sentence-review">
 <div className="curation-toolbar"><div><strong>{editMode?'人工整理模式':'复习整理稿'}</strong><span>原始正文与评分锁定 · 整理 V{review.curation?.revision||0}</span></div><div><button className="button outline small" disabled={busy||!!editing||guideLoading} onClick={toggleEditing}>{guideLoading?'准备引导…':editMode?'结束整理':'整理批注'}</button><button className="text-button" disabled={busy||guideLoading} onClick={()=>openGuide(0)}>新手引导</button><button className="text-button" disabled={busy||!!editing} onClick={()=>setShowHistory(!showHistory)}>整理记录</button>{editMode&&<><button className="text-button" disabled={busy||!!editing||!review.curation?.revision} onClick={()=>curate('restoreVersion',{versionId:previousVersion})}>撤销上次整理</button><button className="text-button" disabled={busy||!!editing||!Object.keys(review.curation?.notes||{}).length} onClick={()=>curate('reset')}>恢复自动解析</button></>}</div></div>
 {guideNotice&&<p className="curation-guide-notice" role="status">{guideNotice}</p>}
 {guideOpen&&<CurationTour startStep={guideStep} enterAfter={guideEntry} onExit={finishGuide}/>}
 {editMode&&<p className="curation-guidance">点击句子后在右侧编辑建议。短批注显示在句旁；精确选择原文可加粗、加下划线或高亮。整理保留原始评分，问题统计按当前批注更新。</p>}
 {showHistory&&<CurationHistory review={review} busy={busy||!!editing} onRestore={id=>curate('restoreVersion',{versionId:id})}/>}
 <div className="study-toolbar sentence-toolbar"><label>建议类型<select aria-label="筛选批阅建议类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部建议</option><option value="correction">全部纠错</option><option value="grammar">语法与拼写</option><option value="content">表达、内容与任务</option><option value="optimization">个性化优化</option></select></label><label>复习筛选<select aria-label="筛选复习状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option><option value="unread">未复习</option><option value="revisit">需要再看</option><option value="mastered">已掌握</option><option value="starred">已收藏</option></select></label><div className="study-progress"><span>已复习 {reviewed} / {notes.length} 条批注</span><progress value={reviewed} max={Math.max(1,notes.length)} aria-label="批阅复习进度"/></div></div>
 <div className="sentence-reading-tools"><p>按原文顺序逐句阅读，点击句子查看右侧批注。筛选仅影响批注，文章保持完整。</p><div><button className="text-button" disabled={busy||!!editing} onClick={()=>{setView('hidden');setKind('all');setStatus('all');}}>暂不采纳 · {hidden.length}</button><button className={`text-button ${view==='unlocated'?'active':''}`} onClick={()=>{setView('unlocated');setKind('all');setStatus('all');}}>未定位建议 · {unlocated.length}</button><button className={`text-button ${view==='global'?'active':''}`} onClick={()=>{setView('global');setKind('all');setStatus('all');}}>全文核对 · {global.length}</button></div></div>
 {groupEdit&&<form className="reading-layout-editor" onSubmit={e=>{e.preventDefault();saveGroups();}}><h4>设置阅读分组</h4><p>选择开头的最后一句与结尾的第一句；两者之间归入中间。正文与批阅原文不变。</p><div><label>开头最后一句<select aria-label="开头最后一句" value={openingEnd} onChange={e=>setOpeningEnd(e.target.value)} required><option value="">请选择</option>{prose.map(r=><option key={r.id} value={r.end}>{String(r.number).padStart(2,'0')}. {r.text.slice(0,95)}</option>)}</select></label><label>结尾第一句<select aria-label="结尾第一句" value={endingStart} onChange={e=>setEndingStart(e.target.value)} required><option value="">请选择</option>{prose.map(r=><option key={r.id} value={r.start}>{String(r.number).padStart(2,'0')}. {r.text.slice(0,95)}</option>)}</select></label></div><div className="reading-layout-actions"><button type="button" className="button ghost small" disabled={busy} onClick={()=>setGroupEdit(false)}>取消</button><button className="button primary small" disabled={busy||!openingEnd||!endingStart}>保存分组</button></div></form>}
 <p className="sentence-view-feedback" role="status">{message}</p>{error&&<p className="error" role="alert">{error}</p>}
 <div className="annotation-layout sentence-layout"><section className="essay-reading-pane sentence-reading-pane" ref={reader} aria-label="文章逐句阅读"><div className="sentence-reader-title"><h4>文章逐句阅读 <span>{prose.length} 句</span></h4><div className="sentence-title-actions"><button className="text-button" disabled={!original} onClick={()=>navigator.clipboard.writeText(original).then(()=>setMessage('批阅对应原文已复制')).catch(()=>setMessage('复制失败，请检查剪贴板权限'))}><Copy size={12}/>复制原文</button><button className="text-button" disabled={!original||busy||prose.length<2} onClick={editGroups}><Settings2 size={13}/>调整分组</button></div></div><p className="sentence-group-origin">{parsed.needsGrouping?prose.length<2?'不足两句，先保留为句子清单。':'未识别到可靠的自然段边界，请先设置开头与结尾的分组。':review.study?.layout?'已按你设置的边界分组':'按首段、中间自然段、末段的位置分组，可手动调整。'}</p>
 {!original?<p className="study-empty">批阅对应正文为 not given，无法关联到当前稿件。</p>:(parsed.needsGrouping?['unassigned'] as const:['opening','body','ending'] as const).map(section=>{const items=displays.filter(d=>d.row.section===section);return <section className="reading-section" key={section} data-reading-section={section}><h5>{READING_LABELS[section]} <span>{items.filter(d=>d.row.kind==='sentence').length} 句</span></h5>{!items.length&&<p className="reading-empty-section">未单独分段，可调整分组。</p>}{items.map((d,i)=>{const selectedRow=view==='sentence'&&row?.id===d.row.id;const matched=d.notes.filter(accepts);const paragraphBreak=i>0&&items[i-1].row.paragraph!==d.row.paragraph;return <button key={d.row.id} className={`reading-sentence ${selectedRow?'selected':''} ${d.row.kind==='format'?'format-row':''} ${paragraphBreak?'paragraph-break':''}`} data-sentence-id={d.row.id} aria-label={`${d.row.kind==='format'?d.row.formatLabel:`第${d.row.number}句`}，${READING_LABELS[section]}，${matched.length}条批注`} aria-pressed={selectedRow} disabled={busy||!!editing} onClick={()=>selectRow(d.row.id,true)}><span className="sentence-number">{d.row.number===null?d.row.formatLabel:String(d.row.number).padStart(2,'0')}</span><ReadingSentenceText display={d}/>{d.notes.length>0&&<span className="sentence-note-count">{matched.length} 条批注{d.needsCheck&&<small>右侧核对</small>}</span>}</button>;})}<CrossSentenceRevisions items={items} displays={displays} located={located}/></section>;})}
 <div className="sentence-reading-legend"><span>黑色：保留</span><span className="sentence-delete-legend">灰色删除线：删去</span><span className="sentence-add-legend">红色：新增或替换</span></div><p className="essay-reading-footnote">跨句、重叠或无法可靠对应的改动保留原文，请在右侧核对。未关联批注不代表该句已确认正确。</p>
 </section><aside className="suggestion-pane sentence-detail-pane" ref={detail} aria-label="选中句子的批注"><div className="sentence-detail-header"><div><h4>{view==='sentence'?row?.kind==='sentence'?`第 ${String(row.number).padStart(2,'0')} 句`:row?.formatLabel||'逐句批注':view==='unlocated'?'未定位建议':view==='hidden'?'暂不采纳的建议':'全文任务核对'}</h4><span>{view==='sentence'&&row?.kind==='sentence'&&`${READING_LABELS[row.section]} · `}{shown.length} 条批注</span></div>{view==='sentence'&&<div className="sentence-navigation"><button className="icon-button" aria-label="上一句" disabled={busy||!!editing||activeIndex<=0} onClick={()=>selectRow(prose[activeIndex-1].id)}><ArrowLeft size={17}/></button><button className="icon-button" aria-label="下一句" disabled={busy||!!editing||activeIndex<0||activeIndex>=prose.length-1} onClick={()=>selectRow(prose[activeIndex+1].id)}><ArrowRight size={17}/></button></div>}</div>
 {view==='sentence'&&rowView?.needsCheck&&<p className="sentence-cross-note">此处含跨句、重叠或需核对的修改。说明和完整改法保留在下方，不自动拼接到各句中。</p>}
 {editMode&&!editing&&<button className="button outline small curation-add" disabled={busy} onClick={startNote}>添加个人笔记 / 补充句</button>}
 {editing&&<CurationEditor key={editing.id} initial={editing} original={original} rows={parsed.rows} busy={busy} error={error} onGuide={()=>openGuide(1)} onCancel={()=>setEditing(null)} onSave={async note=>{const ok=await curate('upsert',{note});if(ok)setEditing(null);return ok;}}/>}
 {!editing&&shown.map(item=><NoteCard key={item.note.id} rows={prose} onBind={target=>bindNote(item,target)} review={review} onChange={onChange} onSetup={onConfigureAI} item={item} entry={entries[item.note.id]||EMPTY_STUDY_ENTRY} busy={busy} original={original} onSave={save} onLocate={()=>locateItem(item)} editMode={editMode} onEdit={()=>{setError('');const draft=asCurated(item.note,item.range,original);
 if(Object.hasOwn(entries[item.note.id]||{},'anchor')){
  draft.anchor=item.range;draft.scope=item.range?'range':'unlocated';
 }
 setEditing(draft);}} onCuration={curate} baseNote={baseNotes.find(n=>n.id===item.note.id)}/>)}
 {!editing&&!shown.length&&<div className="study-empty">{view==='hidden'?'暂无暂不采纳的建议。':view==='unlocated'?'暂无未定位建议。':view==='global'?'全文批注：not given。':rowView?.notes.length?'这句话没有符合筛选条件的批注。':'这句话没有关联的批注；未提供批注不表示确认正确。'}</div>}
 {view!=='sentence'&&row&&<button className="text-button sentence-return" onClick={()=>setView('sentence')}>返回所选句子<ArrowRight size={13}/></button>}
 </aside></div>
 </div>;
}
