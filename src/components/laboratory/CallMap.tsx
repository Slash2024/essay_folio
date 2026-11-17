import { useEffect, useRef, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { CALL_TASKS, CALL_SCOPES, suggestedExpressions, type CallMapOverview, type CallMapView, type CallTaskId, type CallScope } from '../../lib/exam-recall';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import CallExpressionView from './CallExpressionView';
import FeatureFeedback from './FeatureFeedback';
import './exam-recall.css';
type BindingDraft = { key: string; applies: string; variables: string; example: string };
type Draft = { taskId: CallTaskId; baseRevision: number; scope: CallScope; cue: string; primary: BindingDraft; backup: BindingDraft };
async function request(signal?: AbortSignal, body?: object): Promise<CallMapOverview> {
  const response = await fetch('/api/call-map', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '调用地图暂时不可用。'); return value;
}
export default function CallMap({ taskId, onOpenRecall, onOpenTemplate }: { taskId?: CallTaskId; onOpenRecall: (taskId?: CallTaskId) => void; onOpenTemplate?: (expressionId: string) => void }) {
  const [overview, setOverview] = useState<CallMapOverview>(), [draft, setDraft] = useState<Draft>();
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [saved, setSaved] = useState(''), [reload, setReload] = useState(0);
  const baseline = useRef(''), initialized = useRef(false), operation = useRef({ key: '', id: '' });
  const controller = useRef<AbortController>(), heading = useRef<HTMLHeadingElement>(null);
  useUnsavedChanges(!!draft && JSON.stringify(draft) !== baseline.current, busy);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setConfirmed(false);
    request(abort.signal).then(value => { if (!abort.signal.aborted) { setOverview(value); if (taskId && !initialized.current) { initialized.current = true; edit(taskId, value); } } }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload, taskId]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [draft?.taskId]);
  function edit(id: CallTaskId, source = overview) {
    if (!source || !confirmUnsavedNavigation()) return;
    const task = CALL_TASKS.find(t => t.id === id)!, map = source.maps.find(m => m.taskId === id);
    const binding = (value: CallMapView['primary']): BindingDraft => value ? { key: value.expression.key, applies: value.applies, variables: value.variables, example: value.example } : { key: '', applies: task.applies, variables: task.variables, example: '' };
    const value: Draft = { taskId: id, baseRevision: map?.revision ?? 0, scope: map?.scope ?? task.scope, cue: map?.cue ?? task.cue, primary: binding(map?.primary ?? null), backup: binding(map?.backup ?? null) };
    baseline.current = JSON.stringify(value); setDraft(value); setConfirmed(false); setError(''); setSaved('');
  }
  function change(fields: Partial<Draft>) { setDraft(previous => previous ? { ...previous, ...fields } : previous); setConfirmed(false); }
  function changeBinding(role: 'primary' | 'backup', fields: Partial<BindingDraft>) { if (draft) change({ [role]: { ...draft[role], ...fields } }); }
  async function save() {
    if (!draft || !overview) return;
    const fields = { ...draft, primary: draft.primary.key ? draft.primary : null, backup: draft.backup.key ? draft.backup : null, signature: overview.signature, confirmed };
    const key = JSON.stringify(fields); if (operation.current.key !== key) operation.current = { key, id: `lab-map-save-${crypto.randomUUID()}` };
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setBusy(true); setError('');
    try { const value = await request(abort.signal, { ...fields, operationId: operation.current.id }); if (!abort.signal.aborted) { setOverview(value); setDraft(undefined); baseline.current = ''; setConfirmed(false); setSaved(`${CALL_TASKS.find(t => t.id === draft.taskId)!.label}的调用配置已保存。`); } }
    catch (cause) { if (!abort.signal.aborted) setError((cause as Error).message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const errorMessage = error && <p className="error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => setReload(v => v + 1)}>重新读取</button></p>;
  const orderedTasks = [...CALL_TASKS].sort((a, b) => Number(!!overview?.maps.find(m => m.taskId === b.id)?.primary) - Number(!!overview?.maps.find(m => m.taskId === a.id)?.primary));
  const usable = overview?.maps.filter(m => m.current).length ?? 0;
  const task = draft && CALL_TASKS.find(t => t.id === draft.taskId);
  return <section className="panel lab-short-review lab-call-map" aria-busy={busy || loading}>
    <div className="lab-short-header"><h2><MapIcon size={20}/>考场调用地图 <span className="lab-beta">BETA</span></h2><span className="caption">按写作任务 · 首选与备用</span></div>
    <p className="muted">为熟悉的表达建立任务入口。每项保留一条首选、可选一条备用；核对后即可用于情境唤回。</p>
    {!draft && errorMessage}
    {saved && <p className="lab-short-saved" role="status">{saved}</p>}
    {loading && !overview ? <p role="status">正在读取调用地图与表达库…</p> : overview && <>
      {!draft && <>
      <div className="lab-call-toolbar"><span className="caption">已确认可用 {usable} / {CALL_TASKS.length} 项</span><button className="button outline small" disabled={busy || !usable} onClick={() => onOpenRecall()}>用已确认任务练唤回</button></div>
      <div className="lab-call-map-grid">{orderedTasks.map(t => { const map = overview.maps.find(m => m.taskId === t.id); return <article className="lab-call-task" key={t.id}><div className="lab-short-header"><h3>{t.label}</h3><span className="caption">{map?.primary ? CALL_SCOPES[map.scope] : '尚未配置'}</span></div>{map?.primary ? <>
        {!map.current && <p className="error">表达库内容已变化或停用。请重新核对并保存，才能用于新的唤回卡。</p>}
        <p className="lab-call-cue">{map.cue}</p><CallExpressionView binding={map.primary} role="首选"/>{map.backup && <CallExpressionView binding={map.backup} role="备用"/>}
      </> : <p className="muted">从表达库选出你熟悉、适合这项任务的表达。</p>}
      <div className="lab-short-actions">{map?.current && map.primary?.expression.kind === 'sentence' && onOpenTemplate && <button className="text-button" disabled={busy} onClick={() => onOpenTemplate(map.primary!.expression.id)}>用首选句式练迁移</button>}<button className="button outline small" disabled={busy} onClick={() => edit(t.id)}>配置{t.label}</button>{map?.current && <button className="text-button" disabled={busy} onClick={() => onOpenRecall(t.id)}>练这个任务</button>}</div>
      </article>; })}</div>
      </>}
      {draft && task && <section className="lab-call-editor" aria-labelledby="call-map-editor-heading"><button className="text-button lab-map-back" disabled={busy} onClick={() => { if (confirmUnsavedNavigation()) { setDraft(undefined); baseline.current = ''; setConfirmed(false); } }}>← 返回调用地图</button><h3 id="call-map-editor-heading" ref={heading} tabIndex={-1}>配置：{task.label}</h3><p className="caption">候选仅按现有分类与标题筛选，请核对用途后确认。原表达库保持独立。</p>
        <fieldset disabled={busy} className="lab-call-fields">
          <label className="lab-short-select">适用范围<select aria-label="调用配置适用范围" value={draft.scope} onChange={e => change({ scope: e.target.value as CallScope })}>{Object.entries(CALL_SCOPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="lab-short-answer">中文唤回情境<textarea aria-label="中文唤回情境" maxLength={600} value={draft.cue} onChange={e => change({ cue: e.target.value })}/></label><p className="caption">只描述要完成的任务，不填英文答案。保留默认情境时，每轮会换用同一任务的不同中文表述。</p>
          {(['primary', 'backup'] as const).map(role => { const title = role === 'primary' ? '首选' : '备用', binding = draft[role], expression = overview.expressions.find(e => e.key === binding.key), suggestions = suggestedExpressions(draft.taskId, overview.expressions); return <fieldset key={role} className="lab-call-binding"><legend>{title}表达{role === 'backup' ? '（可选）' : ''}</legend>
            {!!suggestions.length && <div className="lab-call-suggestions"><span>分类候选：</span>{suggestions.filter(e => e.key !== draft[role === 'primary' ? 'backup' : 'primary'].key).map(e => <button key={e.key} className="text-button" onClick={() => changeBinding(role, { key: e.key })}>{e.title}</button>)}</div>}
            <label className="lab-short-select">{title}表达<select aria-label={`${title}表达`} value={binding.key} onChange={e => changeBinding(role, { key: e.target.value })}><option value="">{role === 'primary' ? '未设置（保存后停用此任务）' : '不设备用'}</option>{binding.key && !expression && <option value={binding.key} disabled>原表达已停用或删除，请重新选择</option>}{overview.expressions.map(e => <option key={e.key} value={e.key} disabled={e.key === draft[role === 'primary' ? 'backup' : 'primary'].key}>{e.kind === 'sentence' ? '句式' : '词语'} · {e.category} · {e.title}</option>)}</select></label>
            {expression && <><p className="english lab-call-preview">{expression.text}</p><label className="lab-short-answer">{title}适用条件<textarea aria-label={`${title}适用条件`} maxLength={1200} value={binding.applies} onChange={e => changeBinding(role, { applies: e.target.value })}/></label><label className="lab-short-answer">{title}需替换或核对的内容<textarea aria-label={`${title}替换内容`} maxLength={1200} value={binding.variables} onChange={e => changeBinding(role, { variables: e.target.value })}/></label><details><summary>补充熟悉的例句（可选）</summary><label className="lab-short-answer">{title}例句<textarea aria-label={`${title}例句`} lang="en" maxLength={2400} value={binding.example} onChange={e => changeBinding(role, { example: e.target.value })}/></label></details></>}
          </fieldset>; })}
          <label className="lab-short-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{draft.primary.key ? '已核对表达、适用条件与中文情境，确认用于本任务' : '确认停用此任务的调用配置（历史练习保留）'}</label>
          {errorMessage}
          <div className="lab-short-actions"><button className="button outline" onClick={() => { if (confirmUnsavedNavigation()) { setDraft(undefined); baseline.current = ''; setConfirmed(false); } }}>取消编辑</button><button className="button primary" disabled={!confirmed || !draft.primary.key && !!draft.backup.key || !!draft.primary.key && !overview.expressions.some(e => e.key === draft.primary.key) || !!draft.backup.key && !overview.expressions.some(e => e.key === draft.backup.key)} onClick={() => void save()}>{busy ? '正在保存…' : '保存调用配置'}</button></div>
        </fieldset>
      </section>}
      <p className="caption lab-call-legend">表达中的浅色标记表示空位或需补全的部分，其余为库中原文。没有标记的词语仍需按语境检查搭配。</p>
    </>}
    <FeatureFeedback feature="callmap" phase="reading" disabled={busy}/>
  </section>;
}
