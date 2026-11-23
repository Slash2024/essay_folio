import {useState} from 'react';
import {MoreHorizontal,Pencil,Trash2,ChevronDown} from 'lucide-react';
import type {SentenceEntry,WordEntry} from '../../lib/expressions';
import type {ExpressionUsageCount} from '../../lib/expression-usage';
import {expressionKey,type RecitationCount} from '../../lib/expression-performance';
import type {Question} from '../../lib/folio';
import ExpressionUsageDetails from './ExpressionUsageDetails';
import ExpressionRecitationDetails from './ExpressionRecitationDetails';
type Entry=SentenceEntry|WordEntry;
export default function ExpressionEntryCard({entry,usage,recitation,usageReady,quizReady,usageBusy,quizBusy,disabled,expanded,revision,questions,onExpand,onEdit,onToggle,onRemove,onOpen,onOpenQuiz}:{
  entry:Entry;usage?:ExpressionUsageCount;recitation?:RecitationCount;usageReady:boolean;quizReady:boolean;usageBusy:boolean;quizBusy:boolean;disabled:boolean;expanded:boolean;revision:number;questions:Question[];
  onExpand:()=>void;onEdit:()=>void;onToggle:()=>void;onRemove:()=>Promise<void>;onOpen:(id:string)=>void;onOpenQuiz:(id:string)=>void;
}){
  const [tab,setTab]=useState<'writing'|'quiz'>(!usage?.occurrences?'quiz':'writing'),[confirm,setConfirm]=useState(false);
  const sentence='template'in entry,key=expressionKey(sentence?'sentence':'word',entry.id);
  const title=sentence?entry.title:entry.term,notes=sentence?entry.notes:entry.meaning;
  const closeMenu=(target:HTMLElement)=>target.closest('details')?.removeAttribute('open');
  return <article className={`expression-card expression-performance-card ${entry.enabled?'':'expression-disabled'}`} data-expression-id={entry.id}>
    <div className="expression-card-copy"><div className="expression-card-heading"><div><span className="caption">{sentence?entry.category:'单词／短语'}{!entry.enabled?' · 已停用':''}</span><h3 className={sentence?'':'english'}>{title}</h3></div>
      <details className="expression-entry-menu" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))e.currentTarget.open=false;}}><summary aria-label={`管理条目：${title}`}><MoreHorizontal size={20}/></summary><div className="expression-entry-menu-items">
        <button disabled={disabled} onClick={e=>{closeMenu(e.currentTarget);onEdit();}}><Pencil size={14}/>编辑条目</button>
        <button disabled={disabled} onClick={e=>{closeMenu(e.currentTarget);onToggle();}}>{entry.enabled?'停用条目':'启用条目'}</button>
        <button className="expression-remove" disabled={disabled} onClick={e=>{closeMenu(e.currentTarget);setConfirm(true);}}><Trash2 size={14}/>删除条目</button>
      </div></details></div>
      {sentence&&<p className="english expression-template">{entry.template}</p>}
      {(notes||!sentence&&entry.forms.length>0)&&<details className="expression-note-disclosure"><summary>{sentence?'表达说明':'释义与变体'}<ChevronDown size={13}/></summary>{notes&&<p className="expression-notes">{notes}</p>}{!sentence&&entry.forms.length>0&&<p className="caption">补充变体：{entry.forms.join(' / ')}</p>}</details>}
      {confirm&&<div className="expression-remove-confirm"><span>删除此条目？历史作文中的对应高亮会更新。</span><button className="button ghost small" disabled={disabled} onClick={()=>setConfirm(false)}>取消</button><button className="button danger small" disabled={disabled} onClick={async()=>{await onRemove();setConfirm(false);}}>删除此条目</button></div>}
    </div>
    <div className="expression-performance-band" aria-label={`${title}的表达表现`}>
      <div className="expression-metric"><span>写作使用</span>{!entry.enabled?<strong className="metric-unavailable">已停用</strong>:usageReady?<strong>{usage?.occurrences||0}<small> 次 · </small>{usage?.writings||0}<small> 稿</small></strong>:<strong className="metric-unavailable">{usageBusy?'加载中':'暂不可用'}</strong>}</div>
      <div className="expression-metric"><span>默写次数</span><strong className={!quizReady?'metric-unavailable':''}>{quizReady?<>{recitation?.attempts||0}<small> 次</small></>:quizBusy?'加载中':'暂不可用'}</strong></div>
      <div className="expression-metric"><span>准确率</span><strong className={quizReady&&recitation?.accuracy!==null&&recitation?.accuracy!==undefined?(recitation.accuracy<60?'metric-low':'metric-accuracy'):'metric-unavailable'}>{quizReady?(recitation?.accuracy==null?'—':`${recitation.accuracy}%`):quizBusy?'加载中':'—'}</strong>{quizReady&&recitation?.accuracy==null&&<small>{recitation?.pending?'待复核':recitation?.shared?'同题待归属':'尚未默写'}</small>}</div>
      <button className="text-button expression-detail-toggle" aria-expanded={expanded} onClick={onExpand}>{expanded?'收起明细':'查看明细'}<ChevronDown size={14}/></button>
    </div>
    {expanded&&<div className="expression-combined-details"><div className="expression-detail-tabs" role="group" aria-label="表达记录类型"><button className={tab==='writing'?'selected':''} onClick={()=>setTab('writing')}>写作记录</button><button className={tab==='quiz'?'selected':''} onClick={()=>setTab('quiz')}>默写记录</button></div>
      {tab==='writing'?entry.enabled?<ExpressionUsageDetails entryId={entry.id} revision={revision} questions={questions} onOpen={onOpen}/>:<p className="muted expression-no-records">条目已停用，未参与当前写作匹配统计。</p>:<ExpressionRecitationDetails entryKey={key} revision={revision} onOpen={onOpenQuiz}/>}
    </div>}
  </article>;
}
