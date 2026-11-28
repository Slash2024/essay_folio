import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, PenLine, Trash2, X} from 'lucide-react';
import {examName, questionCategories, questionYearLabel, typeName, wordCount, type Question, type Writing} from '../../lib/folio';
import {dateLabel} from '../../lib/client';
import type {PracticeRecordSummary} from '../../lib/practice-records';
import '../../styles/practice-records.css';

const statuses = {draft: '草稿', submitted: '待批阅', reviewed: '已批阅'};
type OpenRecord = (id: string, reviewId?: string, noteId?: string) => void;

function TemplateErrors({writing, summary, onClose, onOpen}: {
  writing: Writing; summary: PracticeRecordSummary; onClose: () => void; onOpen: OpenRecord;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="modal modal-wide record-template-dialog" aria-labelledby="record-template-title"
    onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if (event.target === event.currentTarget) onClose();}}>
    <div className="modal-heading"><h2 id="record-template-title">模板相关错误</h2><button className="icon-button" aria-label="关闭模板错误" onClick={onClose}><X/></button></div>
    <p className="caption">沿用批阅统计的模板句筛选口径，仅列实际错误。</p>
    {summary.templateErrors?.map(item => <article className="record-template-item" key={item.id}>
      <header><strong>{item.labels.join(' · ')}</strong><button className="text-button" onClick={() => {onClose(); onOpen(writing.id, item.reviewId, item.noteId);}}>查看原批阅<ArrowUpRight size={14}/></button></header>
      <div><section><h3>原文</h3><p className="english">{item.original}</p></section><section><h3>修改建议</h3><p className="english">{item.replacement || '原批阅未提供独立修改句'}</p></section></div>
      <p className="record-template-explanation">{item.explanation || '请查看原批阅中的具体说明。'}</p>
    </article>)}
    {summary.templateUnlocated > 0 && <p className="caption">另有批注原文位置待核对，未计入上述数量。</p>}
  </dialog>;
}

export default function PracticeRecordsPanel({items, summaries, questions, busy, loading, offset, total, onOffset, onOpen, onDelete}: {
  items: Writing[]; summaries: Record<string, PracticeRecordSummary>; questions: Question[];
  busy: boolean; loading: boolean; offset: number; total: number; onOffset: (offset: number) => void;
  onOpen: OpenRecord; onDelete: (writing: Writing) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const target = items.find(item => item.id === selected);
  return <>
    <section className="panel practice-records-panel" aria-label="作文练习记录" aria-busy={loading}>
      <div className="practice-records-scroll"><div className="practice-records-table">
        <div className="practice-records-head"><span>题目与稿件</span><span className="record-word-cell">词数</span><span>状态</span><span>已复习</span><span>模板相关错误</span><span className="record-date-cell">更新时间</span><span>操作</span></div>
        {!items.length ? <div className="empty-state"><PenLine size={33}/><p>{loading ? '正在读取记录…' : '从第一稿开始积累'}</p><span>保存的草稿、提交的作文和批阅都会在这里出现。</span></div> : items.map(writing => {
          const question = questions.find(q => q.id === writing.questionId) || writing.questionSnapshot;
          const title = question ? `${questionYearLabel(question)} · ${examName(question)} · ${typeName(question.type)} · ${question.title}` : '题目信息待核对';
          const category = question ? questionCategories(question).join(' / ') : '';
          const summary = summaries[writing.id];
          const progress = summary?.progress;
          const errors = summary?.templateErrors;
          return <div className="practice-records-row" key={writing.id} data-record-id={writing.id}>
            <button className="practice-record-title" disabled={busy} onClick={() => onOpen(writing.id)} title={title}>
              <span className="practice-record-category" title={category || '未分类'}><span>{category || '未分类'}</span></span><strong>{title}</strong>
            </button>
            <span className="record-word-cell">{wordCount(writing.text)}</span>
            <span><b className={`status status-${writing.status}`}>{statuses[writing.status]}</b></span>
            <div className="record-progress-cell">{progress && progress.total > 0 ? <progress value={progress.reviewed} max={progress.total} aria-label="已复习批注比例" aria-valuetext={`${progress.percent}%`} /> : <span className="caption">{writing.status === 'draft' ? '未提交' : !summary?.reviewId ? '待批阅' : progress?.total === 0 ? '无可复习批注' : '—'}</span>}</div>
            <span className="record-template-cell">{errors && errors.length ? <button className="record-template-count" disabled={busy || loading} onClick={() => setSelected(writing.id)} aria-label={`查看${title}的${errors.length}条模板相关错误`}>{errors.length} 条<ChevronRight size={14}/></button> : errors && !summary.templateUnlocated ? <span className="record-template-zero">0 条</span> : <span className="caption" title={summary?.reviewId ? '缺少可核对的资料或存在待定位批注，暂不显示零错误' : undefined}>{summary?.reviewId ? '待核对' : '—'}</span>}</span>
            <span className="record-date-cell">{dateLabel(writing.updatedAt)}</span>
            <div className="record-actions"><button className="icon-button record-open" aria-label="打开这条练习记录" disabled={busy} onClick={() => onOpen(writing.id)}><ArrowUpRight size={17}/></button><button className="record-delete" aria-label="删除这条练习记录" disabled={busy || loading} onClick={() => onDelete(writing)}><Trash2 size={15}/><span>删除</span></button></div>
          </div>;
        })}
      </div></div>
      <div className="pagination"><button className="button ghost small" disabled={offset === 0 || loading} onClick={() => onOffset(Math.max(0, offset - 30))}><ChevronLeft size={16}/>上一页</button><span>{Math.floor(offset / 30) + 1} / {Math.max(1, Math.ceil(total / 30))}</span><button className="button ghost small" disabled={offset + 30 >= total || loading} onClick={() => onOffset(offset + 30)}>下一页<ChevronRight size={16}/></button></div>
    </section>
    <p className="caption practice-records-note">已复习包含“需要再看”和“已掌握”的批注，不代表全部掌握。</p>
    {target && summaries[target.id] && <TemplateErrors key={target.id} writing={target} summary={summaries[target.id]} onClose={() => setSelected(null)} onOpen={onOpen}/>}
  </>;
}
