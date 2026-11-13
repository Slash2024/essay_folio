import { useEffect, useRef, useState } from 'react';
import { suggestCategories } from '../../lib/review-analysis';
import { dateLabel } from '../../lib/client';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import type { TransferOverview, TransferSource, TransferProgress } from '../../lib/transfer-review';
import FeatureFeedback from './FeatureFeedback';
import './short-review.css';

async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/transfer-review${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '复测暂时不可用，请重试。');
  return result;
}
const categories = (text: string) => suggestCategories(text).filter(value => value !== '其他问题' && value !== '不计入问题');
export default function TransferReview() {
  const [overview, setOverview] = useState<TransferOverview>();
  const [originKey, setOriginKey] = useState('');
  const [origin, setOrigin] = useState<TransferSource>();
  const [oldNoteId, setOldNoteId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [target, setTarget] = useState<TransferSource>();
  const [newNoteId, setNewNoteId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<TransferProgress>();
  const [answer, setAnswer] = useState('');
  const [hintUsed, setHintUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingOrigin, setLoadingOrigin] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const pending = useRef({ key: '', id: '' });
  useUnsavedChanges((!!answer.trim() || (hintUsed && !progress?.hintUsed)) && !progress?.attempt, busy);
  useEffect(() => {
    const controller = new AbortController();
    request<TransferOverview>('', undefined, controller.signal).then(setOverview).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!originKey || progress) return;
    const controller = new AbortController(), [type, id] = originKey.split(':');
    setOrigin(undefined); setOldNoteId(''); setTargetId(''); setTarget(undefined); setConfirmed(false); setLoadingOrigin(true); setError('');
    request<{ source: TransferSource }>(`?type=${type}&source=${encodeURIComponent(id)}`, undefined, controller.signal)
      .then(value => { setOrigin(value.source); setOldNoteId(value.source.items[0]?.noteId ?? ''); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingOrigin(false); });
    return () => controller.abort();
  }, [originKey, reload, progress]);
  useEffect(() => {
    if (!targetId || progress) return;
    const controller = new AbortController();
    setTarget(undefined); setNewNoteId(''); setConfirmed(false); setLoadingTarget(true); setError('');
    request<{ source: TransferSource }>(`?type=review&source=${encodeURIComponent(targetId)}`, undefined, controller.signal)
      .then(value => { setTarget(value.source); setNewNoteId(value.source.items[0]?.noteId ?? ''); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingTarget(false); });
    return () => controller.abort();
  }, [targetId, reload, progress]);
  const oldItem = origin?.items.find(item => item.noteId === oldNoteId);
  const newItem = target?.items.find(item => item.noteId === newNoteId);
  const oldCategories = categories(oldItem?.explanation ?? '');
  const targetItems = [...(target?.items ?? [])].sort((a, b) => Number(categories(b.explanation).some(value => oldCategories.includes(value))) - Number(categories(a.explanation).some(value => oldCategories.includes(value))));
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('');
    try { await operation(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  function open(value: TransferProgress) { setProgress(value); setAnswer(''); setHintUsed(value.attempt?.hintUsed ?? value.hintUsed); }
  function start() {
    if (!origin || !target) return;
    const body = { originType: origin.originType, originId: origin.originId, originSignature: origin.signature, originNoteId: oldNoteId, targetReviewId: target.reviewId, targetSignature: target.signature, targetNoteId: newNoteId, confirmed };
    const key = JSON.stringify(body);
    if (pending.current.key !== key) pending.current = { key, id: `lab-transfer-${crypto.randomUUID()}` };
    void run(async () => { const value = await request<{ progress: TransferProgress }>('', { ...body, action: 'start', id: pending.current.id }); open(value.progress); });
  }
  function markHint() {
    if (hintUsed || progress?.attempt) return;
    setHintUsed(true);
    void run(async () => { const value = await request<{ progress: TransferProgress }>('', { action: 'hint', id: progress!.session.id }); setProgress(value.progress); });
  }
  function reveal(unable: boolean) {
    void run(async () => { const value = await request<{ progress: TransferProgress }>('', { action: 'answer', id: progress!.session.id, answer: unable ? '' : answer, unable, hintUsed }); open(value.progress); });
  }
  function assess(assessment: 'understood' | 'uncertain') {
    void run(async () => { const value = await request<{ progress: TransferProgress }>('', { action: 'assess', id: progress!.session.id, assessment }); open(value.progress); });
  }
  return <section className="panel lab-short-review" aria-labelledby="transfer-title" aria-busy={busy}>
    <div className="lab-short-header"><h2 id="transfer-title">换语境复测 <span className="lab-beta">BETA</span></h2><span className="caption">旧问题 → 另一道题</span></div>
    {error && <p className="error" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => { setError(''); setReload(value => value + 1); }}>重新读取</button></p>}
    {!progress ? <>
      <p className="muted">选一个已学过的问题，再用另一道题里的已有纠错句检验。新句的参考意见将在作答后展示。</p>
      <label className="lab-short-select">旧问题来源<select aria-label="旧问题来源" value={originKey} disabled={busy} onChange={event => setOriginKey(event.target.value)}><option value="">选择材料包、短复习记录或批阅</option>{overview?.origins.map(value => <option key={`${value.type}:${value.id}`} value={`${value.type}:${value.id}`}>{value.type === 'pack' ? '材料包' : value.type === 'session' ? '短复习' : '批阅'} · {value.title} · {dateLabel(value.createdAt)}</option>)}</select></label>
      {(!overview || loadingOrigin) && !error && <p role="status">正在读取旧问题…</p>}
      {origin && !loadingOrigin && <>
        {origin.items.length ? <label className="lab-short-select">这次复测的旧句<select aria-label="复测旧句" value={oldNoteId} disabled={busy} onChange={event => { setOldNoteId(event.target.value); setConfirmed(false); }}>{origin.items.map(item => <option key={item.noteId} value={item.noteId}>{item.original}</option>)}</select></label> : <p className="muted">这个来源暂无可用于复测的纠错句，请更换来源。</p>}
        {oldItem && <><p className="caption">旧问题类别线索：{oldCategories.join('、') || '请结合原批注核对'}</p>
          <label className="lab-short-select">另一道题的批阅<select aria-label="另一道题的批阅" value={targetId} disabled={busy} onChange={event => setTargetId(event.target.value)}><option value="">请选择不同题目的批阅</option>{overview?.targets.filter(value => value.questionId !== origin.questionId).map(value => <option key={value.reviewId} value={value.reviewId}>{value.title} · {dateLabel(value.createdAt)}</option>)}</select></label>
          {overview && !overview.targets.some(value => value.questionId !== origin.questionId) && <p className="muted">有另一道题的批阅后，就可以组成换语境复测。</p>}
        </>}
      </>}
      {loadingTarget && <p role="status">正在读取另一题的句子…</p>}
      {target && !loadingTarget && <>
        {!target.items.length ? <p className="muted">这份批阅暂没有可核对的纠错句，请选择其他题目。</p> : <>
          <label className="lab-short-select">换语境的新句<select aria-label="换语境新句" value={newNoteId} disabled={busy} onChange={event => { setNewNoteId(event.target.value); setConfirmed(false); }}>{targetItems.map(item => <option key={item.noteId} value={item.noteId}>{categories(item.explanation).some(value => oldCategories.includes(value)) ? '同类线索 · ' : ''}{item.original}</option>)}</select></label>
          <p className="caption">类别相近的条目会排在前面。请确认两条批注确实适合检验同一个问题。</p>
          <label className="lab-short-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>已核对两条批注，适合检验同一问题</label>
          <button className="button primary" disabled={busy || !confirmed || !oldItem || !newItem} onClick={start}>开始换语境复测</button>
        </>}
      </>}
      {!!overview?.sessions.length && <div className="lab-short-history"><h3>最近的换语境复测</h3>{overview.sessions.map(value => <button className="lab-short-history-row" key={value.id} disabled={busy} onClick={() => void run(async () => { const data = await request<{ progress: TransferProgress }>(`?session=${encodeURIComponent(value.id)}`); open(data.progress); })}><span>换语境复测 · {dateLabel(value.createdAt)}</span><span>打开 / 继续 →</span></button>)}</div>}
    </> : <>
      <p className="caption">{progress.session.target.title}</p>
      <h3>{progress.result ? '本次复测已记录' : progress.attempt ? '对照换语境后的修改' : '在新语境里独立修改'}</h3>
      <p className="lab-short-original english">{progress.session.target.item.original}</p>
      <details className="lab-short-context"><summary>新题要求与段落背景</summary><p className="english">{progress.session.target.directions}</p>{progress.session.target.images.map((image, index) => <img key={image} src={image} alt={`原题图 ${index + 1}`} loading="lazy"/>)}<p className="english">{progress.session.target.item.context}</p></details>
      <details className="lab-short-context" onToggle={event => { if (event.currentTarget.open && !progress.attempt) markHint(); }}><summary>回顾旧问题的提示</summary><p>{progress.session.origin.title}</p><p className="english">{progress.session.origin.item.original}</p><p className="english">{progress.session.origin.item.reference}</p><p>{progress.session.origin.item.explanation}</p></details>
      {!progress.attempt ? <><label className="lab-short-answer">我的修改<textarea aria-label="换语境独立修改" className="english" maxLength={2400} spellCheck={false} value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)}/></label><div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => reveal(true)}>暂时不会，查看参考</button><button className="button primary" disabled={busy || !answer.trim()} onClick={() => reveal(false)}>保存作答并查看参考</button></div></> : <>
        <div className="lab-short-comparison"><div><h4>我的作答</h4><p className="english">{progress.attempt.unable ? '本次选择了暂时不会' : progress.attempt.answer}</p></div><div><h4>新句的参考改法</h4><p className="english">{progress.session.target.item.reference}</p></div></div>
        <div className="lab-short-explanation"><h4>新句批注说明</h4><p>{progress.session.target.item.explanation}</p></div>
        <p className="caption">{progress.attempt.hintUsed ? '作答前看过旧问题提示' : '作答前未打开旧问题提示'} · 作答已保存。不同于参考的合理改法也可以保留。</p>
        {progress.result ? <><p className="lab-short-saved">{progress.result.assessment === 'understood' ? '自评能在新语境中处理' : '换语境后仍需再看'} · 已保存</p><p className="muted">本次记录用于回看迁移练习的表现。</p><button className="button outline" onClick={() => { setProgress(undefined); setOriginKey(''); setOrigin(undefined); setTargetId(''); setTarget(undefined); setReload(value => value + 1); }}>返回选材，再测一题</button></> : <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => assess('uncertain')}>换语境后仍需再看</button><button className="button primary" disabled={busy} onClick={() => assess('understood')}>自评能在新语境中处理</button></div>}
      </>}
    </>}
    <FeatureFeedback key={`transfer-feedback-${progress?.session.id ?? 'selection'}`} feature="transfer" contextId={progress?.session.id} phase={!progress ? 'selection' : progress.result ? 'result' : 'practice'} disabled={busy}/>
  </section>;
}
