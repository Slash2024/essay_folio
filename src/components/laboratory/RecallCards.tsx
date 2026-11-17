import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { CALL_SCOPES, RECALL_ASSESSMENTS, type CallTaskId, type RecallOverview, type RecallProgress, type RecallAssessment } from '../../lib/exam-recall';
import { dateLabel } from '../../lib/client';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import CallExpressionView from './CallExpressionView';
import FeatureFeedback from './FeatureFeedback';
import './exam-recall.css';
async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/recall-cards' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '情境唤回卡暂时不可用。'); return value;
}
export default function RecallCards({ sessionId, taskId, onOpenMap, onOpenTemplate, onSessionChange }: { sessionId?: string; taskId?: CallTaskId; onOpenMap: (taskId?: CallTaskId) => void; onOpenTemplate?: (expressionId: string) => void; onSessionChange?: (id?: string) => void }) {
  const [overview, setOverview] = useState<RecallOverview>(), [progress, setProgress] = useState<RecallProgress>();
  const [scope, setScope] = useState('all'), [limit, setLimit] = useState(3), [selected, setSelected] = useState<CallTaskId[]>([]);
  const [assessment, setAssessment] = useState<RecallAssessment | ''>(''), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const controller = useRef<AbortController>(), restored = useRef(false), initialized = useRef(false), pending = useRef({ key: '', id: '' }), heading = useRef<HTMLHeadingElement>(null);
  const index = progress ? progress.cards.findIndex(card => !progress.results.some(r => r.index === card.index)) : -1;
  const card = progress?.cards[index], reveal = progress?.reveals.find(r => r.index === index), hint = progress?.hints.find(h => h.index === index);
  useEffect(() => { onSessionChange?.(progress?.session.id); }, [progress?.session.id, onSessionChange]);
  useUnsavedChanges(!!assessment || confirmed, busy);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    request<RecallOverview>('', undefined, abort.signal).then(value => { if (!abort.signal.aborted) { setOverview(value); if (!initialized.current) { initialized.current = true; setSelected(value.maps.filter(m => !taskId || m.taskId === taskId).map(m => m.taskId)); } } }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload, taskId]);
  useEffect(() => {
    if (!sessionId || restored.current) return;
    const abort = new AbortController(); request<{ progress: RecallProgress }>('?session=' + encodeURIComponent(sessionId), undefined, abort.signal).then(value => { if (!abort.signal.aborted) { restored.current = true; setProgress(value.progress); } }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); });
    return () => abort.abort();
  }, [sessionId, reload]);
  useEffect(() => { heading.current?.focus(); }, [progress?.session.id, index, !!reveal]);
  async function action(body?: object, query = '') {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setBusy(true); setError('');
    try { const value = await request<{ progress: RecallProgress }>(query, body, abort.signal); if (!abort.signal.aborted) { restored.current = true; setProgress(value.progress); if (!body || (body as { action?: string }).action === 'assess') { setAssessment(''); setConfirmed(false); } } }
    catch (cause) { if (!abort.signal.aborted) setError((cause as Error).message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const errorMessage = error && <p className="error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => setReload(v => v + 1)}>重新读取</button></p>;
  const sentences = [...new Map(progress?.reveals.flatMap(r => [r.primary, ...(r.backup ? [r.backup] : [])]).filter(b => b.expression.kind === 'sentence').map(b => [b.expression.id, b.expression]) ?? []).values()];
  const pool = overview?.maps.filter(map => scope === 'all' || map.scope === scope || map.scope === 'both') ?? [];
  function start() {
    const maps = pool.filter(map => selected.includes(map.taskId)).map(({ taskId, revision }) => ({ taskId, revision }));
    const fields = { maps, limit }; const key = JSON.stringify(fields); if (pending.current.key !== key) pending.current = { key, id: `lab-recall-${crypto.randomUUID()}` };
    void action({ action: 'start', id: pending.current.id, ...fields });
  }
  function setResult(value: RecallAssessment) { setAssessment(value); }
  return <section className="panel lab-short-review lab-recall-cards" aria-busy={busy || loading}>
    <div className="lab-short-header"><h2><Layers size={20}/>情境唤回卡 <span className="lab-beta">BETA</span></h2><span className="caption">先回忆 · 再提示 · 后核对</span></div>
    <p className="muted">只看中文任务，先默想或口述一条合适表达，再展开核对。无需录音或输入英文。</p>
    {!progress && errorMessage}
    {!progress ? <>
      {loading ? <p role="status">正在读取已确认的任务…</p> : overview && <>
        {!!overview.staleCount && <p className="muted">有 {overview.staleCount} 项配置的表达已更新或停用，请在调用地图重新核对后使用。</p>}
        {!overview.maps.length ? <div className="lab-recall-empty"><h3>先为一个任务确认表达</h3><p>在调用地图中选好首选表达并核对用途，就能开始唤回。</p><button className="button primary" disabled={busy} onClick={() => onOpenMap('reason')}>配置调用地图</button></div> : <fieldset className="lab-call-fields" disabled={busy || !!sessionId && !restored.current}>
          <label className="lab-short-select">练习范围<select aria-label="唤回练习范围" value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部已确认任务</option><option value="large">大作文</option><option value="small">小作文</option></select></label>
          <fieldset className="lab-short-picks"><legend>本轮任务</legend>{pool.map(map => <label key={map.taskId}><input type="checkbox" checked={selected.includes(map.taskId)} onChange={e => setSelected(old => e.target.checked ? [...old, map.taskId] : old.filter(id => id !== map.taskId))}/><span>{map.label}<small className="caption"> · {CALL_SCOPES[map.scope]}</small></span></label>)}</fieldset>
          {!pool.length && <p className="muted">这个范围尚无已确认任务，请切换范围或在地图中配置。</p>}
          <label className="lab-short-select">每轮卡数<select aria-label="每轮唤回卡数" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[1, 3, 5].map(n => <option key={n} value={n}>最多 {n} 张</option>)}</select></label><p className="caption">每个任务本轮只出现一次，按已选任务数量出卡。</p>
          <div className="lab-short-actions"><button className="button outline" onClick={() => onOpenMap()}>查看调用地图</button><button className="button primary" disabled={!pool.some(map => selected.includes(map.taskId))} onClick={start}>{busy ? '正在开始…' : '开始情境唤回'}</button></div>
        </fieldset>}
      </>}
      {!!overview?.sessions.length && <details className="lab-short-history lab-history"><summary>历史记录 · 情境唤回（{overview.sessions.length}）</summary>{overview.sessions.map(s => <button className="lab-short-history-row" key={s.id} disabled={busy} onClick={() => void action(undefined, '?session=' + encodeURIComponent(s.id))}><span>{s.count} 张任务卡</span><small>{dateLabel(s.createdAt)}</small></button>)}</details>}
    </> : index < 0 ? <>
      <h3 ref={heading} tabIndex={-1}>本轮唤回记录</h3><p className="caption">以下为本轮自报结果，结合提示与展开前记录；不等同于长期掌握。</p>
      <div className="lab-recall-counts">{Object.entries(RECALL_ASSESSMENTS).map(([key, label]) => <div key={key}><strong>{progress.results.filter(r => r.assessment === key).length}</strong><span>{label}</span></div>)}</div>
      <div className="lab-short-summary">{progress.cards.map(c => <div className="lab-recall-summary" key={c.index}><strong>{c.label}</strong><span>{RECALL_ASSESSMENTS[progress.results.find(r => r.index === c.index)!.assessment]}</span></div>)}</div>
      {!!sentences.length && onOpenTemplate && <details className="lab-next-tools"><summary>下一步：选一句做模板迁移</summary><p className="caption">带入所选句式，在不同题目里练习适配。</p>{sentences.map(expression => <button className="lab-short-history-row" key={expression.id} disabled={busy} onClick={() => onOpenTemplate(expression.id)}><span>{expression.title}</span><span>带入句式 →</span></button>)}</details>}
      <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => onOpenMap()}>回看调用地图</button><button className="button primary" disabled={busy} onClick={() => { setProgress(undefined); setAssessment(''); setConfirmed(false); pending.current = { key: '', id: '' }; setReload(v => v + 1); }}>再练一轮</button></div>
    </> : card && <>
      <div className="lab-short-header"><h3 ref={heading} tabIndex={-1}>第 {index + 1} / {progress.session.total} 张 · {card.label}</h3><span className="caption">{CALL_SCOPES[card.scope]}</span></div>
      <div className="lab-recall-front"><p>{card.cue}</p><small>先用自己的方式回忆，再决定是否需要提示。</small></div>
      {!reveal ? <>
        {hint ? <p className="lab-recall-hint" role="status">首选表达开头提示：<span className="english">{hint.text}…</span></p> : <button className="text-button" disabled={busy} onClick={() => void action({ action: 'hint', id: progress.session.id, index })}>给一点开头提示（记录使用）</button>}
        <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => void action({ action: 'reveal', id: progress.session.id, index, recalled: false })}>暂未想起，展开核对</button><button className="button primary" disabled={busy} onClick={() => void action({ action: 'reveal', id: progress.session.id, index, recalled: true })}>{hint ? '提示后已回忆，展开核对' : '我已回忆，展开核对'}</button></div>
      </> : <>
        <div className="lab-call-map-grid"><CallExpressionView binding={reveal.primary} role="已确认的首选"/>{reveal.backup && <CallExpressionView binding={reveal.backup} role="已确认的备用"/>}</div>
        <p className="caption">请核对固定部分、替换内容与适用条件；其他正确且适用的表达也可保留，不要求逐字复现某一种答案。</p>
        <fieldset className="lab-recall-assess" disabled={busy}><legend>本次回忆结果</legend>
          {(Object.entries(RECALL_ASSESSMENTS) as [RecallAssessment, string][]).map(([key, label]) => <label key={key}><input type="radio" name="recall-assessment" checked={assessment === key} disabled={key === 'independent' && (!!hint || !reveal.recalled) || key === 'prompted' && (!hint || !reveal.recalled)} onChange={() => setResult(key)}/>{label}</label>)}
          <p className="caption">{hint ? '本轮查看过开头提示，不能标记为独立想起。' : !reveal.recalled ? '展开前记录为暂未想起，看到答案后的熟悉感不计为独立想起。' : '展开前想起后，仍需核对是否正确、适用。'}</p>
          <label className="lab-short-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>已核对表达与适用条件，确认本次自报结果</label>
          <div className="lab-short-actions"><button className="button primary" disabled={!assessment || !confirmed} onClick={() => void action({ action: 'assess', id: progress.session.id, index, assessment, confirmed })}>{busy ? '正在保存…' : index + 1 < progress.session.total ? '保存结果，下一张' : '保存结果，完成本轮'}</button></div>
        </fieldset>
      </>}
    </>}
    {progress && errorMessage}
    <FeatureFeedback key={`${progress?.session.id ?? 'selection'}-${index < 0 ? 'result' : reveal ? 'reading' : 'practice'}`} feature="recall" contextId={progress?.session.id} phase={!progress ? 'selection' : index < 0 ? 'result' : reveal ? 'reading' : 'practice'} disabled={busy}/>
  </section>;
}
