import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { dateLabel } from '../../lib/client';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import type { ShortReviewOverview, ShortReviewSource, ShortReviewProgress, SelfAssessment } from '../../lib/short-review';
import './short-review.css';

async function request<T>(query = '', data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/short-review${query}`, data ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  } : { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '短复习暂不可用，请重试。');
  return result;
}

export default function ShortReview({ onExit }: { onExit: () => void }) {
  const [overview, setOverview] = useState<ShortReviewOverview>();
  const [reviewId, setReviewId] = useState('');
  const [source, setSource] = useState<ShortReviewSource>();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<ShortReviewProgress>();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const startRequest = useRef({ key: '', id: '' });
  const heading = useRef<HTMLHeadingElement>(null);
  const item = progress?.session.items[index];
  const attempt = progress?.attempts.find(value => value.index === index);
  const result = progress?.results.find(value => value.index === index);
  useUnsavedChanges(!!answer.trim() && !attempt, busy);

  useEffect(() => {
    const controller = new AbortController();
    request<ShortReviewOverview>('', undefined, controller.signal).then(setOverview).catch(cause => {
      if (!controller.signal.aborted) setError((cause as Error).message);
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!reviewId) return;
    const controller = new AbortController();
    setSource(undefined); setSelected([]); setConfirmed(false); setLoadingSource(true); setError('');
    request<{ source: ShortReviewSource }>(`?review=${encodeURIComponent(reviewId)}`, undefined, controller.signal)
      .then(value => setSource(value.source)).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSource(false); });
    return () => controller.abort();
  }, [reviewId, reload]);

  function move(next: number) {
    setIndex(next); setAnswer(''); setError('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  function open(value: ShortReviewProgress) {
    setProgress(value);
    const pending = value.session.items.findIndex((_, index) => !value.results.some(result => result.index === index));
    move(pending < 0 ? value.session.items.length : pending);
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('');
    try { await operation(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  function start() {
    if (!source) return;
    const key = JSON.stringify([source.reviewId, source.revision, selected]);
    if (startRequest.current.key !== key) startRequest.current = { key, id: `lab-short-${crypto.randomUUID()}` };
    void run(async () => {
      const value = await request<{ progress: ShortReviewProgress }>('', { action: 'start', id: startRequest.current.id, reviewId, revision: source.revision, noteIds: selected, confirmed });
      open(value.progress);
    });
  }
  function reveal(unable: boolean) {
    void run(async () => {
      const value = await request<{ progress: ShortReviewProgress }>('', { action: 'answer', id: progress!.session.id, index, answer: unable ? '' : answer, unable });
      setProgress(value.progress); setAnswer('');
    });
  }
  function assess(assessment: SelfAssessment) {
    void run(async () => {
      const value = await request<{ progress: ShortReviewProgress }>('', { action: 'assess', id: progress!.session.id, index, assessment });
      open(value.progress);
    });
  }
  function back() {
    if (!confirmUnsavedNavigation()) return;
    onExit();
  }

  return <section className="panel lab-short-review" aria-labelledby="short-review-title" aria-busy={busy}>
    <div className="lab-short-header"><h2 id="short-review-title">短复习单 <span className="lab-beta">BETA</span></h2><button className="text-button" disabled={busy} onClick={back}><ArrowLeft size={15}/>返回实验室</button></div>
    {error && <p className="error" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => { setError(''); setReload(value => value + 1); }}>重新读取材料</button></p>}
    {!progress ? <>
      <p className="muted">选一篇已有批阅的作文，练习一至三个句子，约 5 分钟。先独立修改，再对照参考意见并自评。</p>
      <label className="lab-short-select">选择批阅<select aria-label="选择短复习批阅" value={reviewId} disabled={!overview || busy} onChange={event => setReviewId(event.target.value)}><option value="">请选择一份批阅</option>{overview?.sources.map(value => <option key={value.reviewId} value={value.reviewId}>{value.title} · {dateLabel(value.createdAt)}</option>)}</select></label>
      {!overview && !error && <p role="status">正在读取练习材料…</p>}
      {overview?.sources.length === 0 && <p className="muted">导入一份作文批阅后，就可以在这里选取材料。</p>}
      {loadingSource && <p role="status">正在核对原稿和批注…</p>}
      {source && !loadingSource && <>
        <p className="caption">选一至三条已经核对过的批注。本轮参考意见会在作答后展示。</p>
        {!source.items.length ? <p className="muted">这份批阅暂没有原句与参考改法均可核对的纠错条目，请选择其他批阅。</p> : <>
          <fieldset className="lab-short-picks" disabled={busy}><legend>选择本轮句子</legend>{source.items.map(value => <label key={value.noteId}><input type="checkbox" checked={selected.includes(value.noteId)} disabled={!selected.includes(value.noteId) && selected.length >= 3} onChange={event => setSelected(previous => event.target.checked ? [...previous, value.noteId] : previous.filter(id => id !== value.noteId))}/><span className="english">{value.original}</span></label>)}</fieldset>
          <label className="lab-short-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>选中的批注意见已经核对，适合用于这次复习</label>
          <button className="button primary" disabled={busy || !confirmed || selected.length === 0} onClick={start}>{busy ? '正在准备…' : `开始本轮${selected.length ? ` · ${selected.length} 句` : ''}`}</button>
        </>}
      </>}
      {!!overview?.sessions.length && <div className="lab-short-history"><h3>最近的短复习</h3>{overview.sessions.map(value => <button key={value.id} className="lab-short-history-row" disabled={busy} onClick={() => void run(async () => { const data = await request<{ progress: ShortReviewProgress }>(`?session=${encodeURIComponent(value.id)}`); open(data.progress); })}><span>{value.title}<small>{dateLabel(value.createdAt)}</small></span><span>打开 / 继续 →</span></button>)}</div>}
    </> : item ? <>
      <p className="caption">第 {index + 1} / {progress.session.items.length} 句 · {attempt ? '作答已保存' : '独立作答'}</p>
      <h3 ref={heading} tabIndex={-1}>{attempt ? '对照本次修改' : '试着修改这句话'}</h3>
      <p className="lab-short-original english">{item.original}</p>
      <details className="lab-short-context"><summary>查看题目与原段落</summary><p>{progress.session.title}</p><p className="english">{progress.session.directions}</p>{progress.session.images.map((image, index) => <img key={image} src={image} alt={`原题图 ${index + 1}`} loading="lazy"/>)}<p className="english">{item.context}</p></details>
      {!attempt ? <>
        <label className="lab-short-answer">我的修改<textarea className="english" aria-label="我的独立修改" value={answer} disabled={busy} maxLength={2400} spellCheck={false} onChange={event => setAnswer(event.target.value)} placeholder="先尝试写出自己的修改…"/></label>
        <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => reveal(true)}>暂时不会，查看参考</button><button className="button primary" disabled={busy || !answer.trim()} onClick={() => reveal(false)}>保存作答并查看参考</button></div>
      </> : <>
        <div className="lab-short-comparison"><div><h4>我的作答</h4><p className="english">{attempt.unable ? '本次选择了暂时不会' : attempt.answer}</p></div><div><h4>原批注的参考改法</h4><p className="english">{item.reference}</p></div></div>
        {item.explanation && <div className="lab-short-explanation"><h4>原批注说明</h4><p>{item.explanation}</p></div>}
        {!!item.personalNotes.length && <details className="lab-short-context"><summary>相关个人笔记</summary>{item.personalNotes.map((note, index) => <p key={index}>{note}</p>)}</details>}
        <p className="caption">自评时，请检查自己的修改是否解决原问题。不同于参考的合理改法也可以保留。</p>
        {result ? <><p className="lab-short-saved"><CheckCircle2 size={16}/>{result.assessment === 'understood' ? '自评已理解' : '仍需再看'} · 已保存</p><button className="button primary" onClick={() => move(progress.session.items.length)}>返回本轮结果</button></> : <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => assess('uncertain')}>仍需再看</button><button className="button primary" disabled={busy} onClick={() => assess('understood')}>自评已理解，继续</button></div>}
      </>}
    </> : <>
      <h3 ref={heading} tabIndex={-1}>本轮练习已完成</h3>
      <p>{progress.session.items.length} 句已对照，其中 {progress.results.filter(value => value.assessment === 'understood').length} 句自评已理解，{progress.results.filter(value => value.assessment === 'uncertain').length} 句仍需再看。</p>
      <p className="muted">这里记录本次作答和自评。再次独立作答，可以继续检查是否掌握。</p>
      <div className="lab-short-summary">{progress.session.items.map((value, index) => <button key={value.noteId} onClick={() => move(index)}><span className="english">{value.original}</span><small>{progress.results.find(item => item.index === index)?.assessment === 'understood' ? '自评已理解' : '仍需再看'} · 查看作答 →</small></button>)}</div>
      <button className="button outline" onClick={() => { setProgress(undefined); setReviewId(''); setSource(undefined); setSelected([]); setConfirmed(false); setReload(value => value + 1); }}><RotateCcw size={16}/>返回选材，开始新一轮</button>
    </>}
  </section>;
}
