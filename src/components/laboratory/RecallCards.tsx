import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { RECALL_SCOPES, RECALL_ASSESSMENTS, type RecallOverview, type RecallProgress, type RecallAssessment } from '../../lib/exam-recall';
import { dateLabel } from '../../lib/client';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import RecallExpressionView from './RecallExpressionView';
import type { QuizRange } from '../../lib/expression-quiz';
import FeatureFeedback from './FeatureFeedback';
import './exam-recall.css';
async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/recall-cards' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '情境唤回卡暂时不可用。'); return value;
}
export default function RecallCards({ sessionId, onOpenTemplate, onSessionChange }: { sessionId?: string; onOpenTemplate?: (expressionId: string) => void; onSessionChange?: (id?: string) => void }) {
  const [overview, setOverview] = useState<RecallOverview>(), [progress, setProgress] = useState<RecallProgress>();
  const [range, setRange] = useState<QuizRange>({ main: '', sub: '' }), [limit, setLimit] = useState(3);
  const [assessment, setAssessment] = useState<RecallAssessment | ''>(''), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const controller = useRef<AbortController>(), restored = useRef(false), pending = useRef({ key: '', id: '' }), heading = useRef<HTMLHeadingElement>(null);
  const index = progress ? progress.cards.findIndex(card => !progress.results.some(r => r.index === card.index)) : -1;
  const card = progress?.cards[index], reveal = progress?.reveals.find(r => r.index === index), hint = progress?.hints.find(h => h.index === index);
  useEffect(() => { onSessionChange?.(progress?.session.id); }, [progress?.session.id, onSessionChange]);
  useUnsavedChanges(!!assessment || confirmed, busy);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    request<RecallOverview>('', undefined, abort.signal).then(value => { if (!abort.signal.aborted) { setOverview(value); } }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload]);
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
  const selectedRange = overview?.ranges.find(r => r.main === range.main && r.sub === range.sub);
  const mainRanges = overview?.ranges.filter(r => r.main && !r.sub) ?? [];
  const subRanges = overview?.ranges.filter(r => r.main === range.main && r.sub) ?? [];
  function start() {
    const fields = { range, limit, signature: overview?.signature }; const key = JSON.stringify(fields); if (pending.current.key !== key) pending.current = { key, id: `lab-recall-${crypto.randomUUID()}` };
    void action({ action: 'start', id: pending.current.id, ...fields });
  }
  function setResult(value: RecallAssessment) { setAssessment(value); }
  return <section className="panel lab-short-review lab-recall-cards" aria-busy={busy || loading}>
    <div className="lab-short-header"><h2><Layers size={20}/>情境唤回卡 <span className="lab-beta">BETA</span></h2><span className="caption">先回忆 · 再提示 · 后核对</span></div>
    <p className="muted">只看中文任务，先默想或口述一条合适表达，再展开核对。无需录音或输入英文。</p>
    {!progress && errorMessage}
    {!progress ? <>
      {loading ? <p role="status">正在读取表达库情景提示…</p> : overview && <>
        <fieldset className="lab-recall-fields" disabled={busy || !!sessionId && !restored.current}>
          <p className="caption">直接使用表达库已有的中文情景提示，无需配置其他工具。先选范围，再开始一轮。</p>
          <label className="lab-short-select">一级分类<select aria-label="唤回一级分类" value={range.main} onChange={e => setRange({ main: e.target.value, sub: '' })}><option value="">全部类别</option>{mainRanges.map(r => <option key={r.main} value={r.main}>{r.main}（{r.count}条）</option>)}{range.main && !mainRanges.some(r => r.main === range.main) && <option value={range.main}>原分类已失效，请重选</option>}</select></label>
          <label className="lab-short-select">二级分类<select aria-label="唤回二级分类" disabled={!range.main} value={range.sub} onChange={e => setRange(r => ({ ...r, sub: e.target.value }))}><option value="">{range.main ? '全部子类' : '请先选择一级分类'}</option>{subRanges.map(r => <option key={r.sub} value={r.sub}>{r.sub}（{r.count}条）</option>)}{range.sub && !subRanges.some(r => r.sub === range.sub) && <option value={range.sub}>原分类已失效，请重选</option>}</select></label>
          <label className="lab-short-select">每轮卡数<select aria-label="每轮唤回卡数" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[1, 3, 5].map(n => <option key={n} value={n}>最多 {n} 张</option>)}</select></label>
          <p className="caption" role="status">当前范围有 {selectedRange?.count ?? 0} 条情景提示，本轮最多抽取 {Math.min(limit, selectedRange?.count ?? 0)} 张，同一表达不重复。</p>
          {!selectedRange?.count && <p className="muted">这个范围暂无可用提示。可切换分类，或在“表达库抽背”的“调整抽背提示”中补充情景描述。</p>}
          <div className="lab-short-actions"><button className="button primary" disabled={!selectedRange?.count} onClick={start}>{busy ? '正在开始…' : '开始情境唤回'}</button></div>
        </fieldset>
      </>}
      {!!overview?.sessions.length && <details className="lab-short-history lab-history"><summary>历史记录 · 情境唤回（{overview.sessions.length}）</summary>{overview.sessions.map(s => <button className="lab-short-history-row" key={s.id} disabled={busy} onClick={() => void action(undefined, '?session=' + encodeURIComponent(s.id))}><span>{s.count} 张任务卡</span><small>{dateLabel(s.createdAt)}</small></button>)}</details>}
    </> : index < 0 ? <>
      <h3 ref={heading} tabIndex={-1}>本轮唤回记录</h3><p className="caption">以下为本轮自报结果，结合提示与展开前记录；不等同于长期掌握。</p>
      <div className="lab-recall-counts">{Object.entries(RECALL_ASSESSMENTS).map(([key, label]) => <div key={key}><strong>{progress.results.filter(r => r.assessment === key).length}</strong><span>{label}</span></div>)}</div>
      <div className="lab-short-summary">{progress.cards.map(c => <div className="lab-recall-summary" key={c.index}><strong>{c.label}</strong><span>{RECALL_ASSESSMENTS[progress.results.find(r => r.index === c.index)!.assessment]}</span></div>)}</div>
      {!!sentences.length && onOpenTemplate && <details className="lab-next-tools"><summary>下一步：选一句做模板迁移</summary><p className="caption">带入所选句式，在不同题目里练习适配。</p>{sentences.map(expression => <button className="lab-short-history-row" key={expression.id} disabled={busy} onClick={() => onOpenTemplate(expression.id)}><span>{expression.title}</span><span>带入句式 →</span></button>)}</details>}
      <div className="lab-short-actions"><button className="button primary" disabled={busy} onClick={() => { setProgress(undefined); setAssessment(''); setConfirmed(false); pending.current = { key: '', id: '' }; setReload(v => v + 1); }}>再练一轮</button></div>
    </> : card && <>
      <div className="lab-short-header"><h3 ref={heading} tabIndex={-1}>第 {index + 1} / {progress.session.total} 张 · {card.label}</h3><span className="caption">{RECALL_SCOPES[card.scope]}</span></div>
      <div className="lab-recall-front"><p>{card.cue}</p><small>先用自己的方式回忆，再决定是否需要提示。</small></div>
      {!reveal ? <>
        {hint ? <p className="lab-recall-hint" role="status">参考表达开头提示：<span className="english">{hint.text}…</span></p> : <button className="text-button" disabled={busy} onClick={() => void action({ action: 'hint', id: progress.session.id, index })}>给一点开头提示（记录使用）</button>}
        <div className="lab-short-actions"><button className="button outline" disabled={busy} onClick={() => void action({ action: 'reveal', id: progress.session.id, index, recalled: false })}>暂未想起，展开核对</button><button className="button primary" disabled={busy} onClick={() => void action({ action: 'reveal', id: progress.session.id, index, recalled: true })}>{hint ? '提示后已回忆，展开核对' : '我已回忆，展开核对'}</button></div>
      </> : <>
        <div className="lab-recall-references"><RecallExpressionView binding={reveal.primary} role="本题参考表达"/>{reveal.backup && <RecallExpressionView binding={reveal.backup} role="备用参考表达"/>}</div>
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
