import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import type { Question } from '../../lib/folio';
import { questionCategories, questionYearLabel } from '../../lib/folio';
import { dateLabel } from '../../lib/client';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { TRAINING_MODES, TEMPLATE_DECISIONS, TEMPLATE_CHECKS, CHECK_VALUES, trainingMode, trainingSignals, type TrainingMode, type TemplateDecision, type TemplateChecks, type TemplateOverview, type TemplateProgress } from '../../lib/template-training';
import FeatureFeedback from './FeatureFeedback';
import './template-training.css';
async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/template-training' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '模板训练暂不可用，请重试。');
  return result;
}
function QuestionMaterial({ question }: { question: Question }) {
  return <div className="lab-template-question"><h4>{questionYearLabel(question)} · {question.title}</h4><p className="lab-template-pre">{question.directions}</p>{question.images.map((image, index) => <img key={image} src={image} alt={`${question.title}题面 ${index + 1}`} loading="lazy"/>)}</div>;
}
function suggestedQuestions(items: Question[]) {
  const selected: string[] = [], groups = new Set<string>();
  for (const q of items) { const category = questionCategories(q).join('|') || q.title; if (!groups.has(category)) { selected.push(q.id); groups.add(category); } if (selected.length === 3) return selected; }
  for (const q of items) { if (!selected.includes(q.id)) selected.push(q.id); if (selected.length === 3) break; }
  return selected;
}
export default function TemplateTraining({ sessionId }: { sessionId?: string }) {
  const [overview, setOverview] = useState<TemplateOverview>();
  const [expressionId, setExpressionId] = useState('');
  const [mode, setMode] = useState<TrainingMode>('picture');
  const [picks, setPicks] = useState<string[]>([]);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);
  const [progress, setProgress] = useState<TemplateProgress>();
  const [index, setIndex] = useState(0);
  const [task, setTask] = useState(''), [answer, setAnswer] = useState('');
  const [decision, setDecision] = useState<TemplateDecision | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [checks, setChecks] = useState<Partial<TemplateChecks>>({});
  const [validationId, setValidationId] = useState('');
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [reload, setReload] = useState(0);
  const restored = useRef(false), pending = useRef({ key: '', id: '' });
  const startedAt = useRef(Date.now()), answerRequest = useRef({ key: '', body: {} });
  const controller = useRef<AbortController>();
  const heading = useRef<HTMLHeadingElement>(null);
  const attempt = progress?.attempts.find(item => item.index === index);
  const result = progress?.results.find(item => item.index === index);
  const question = index === 3 ? progress?.validation : progress?.session.questions[index];
  const doneTraining = !!progress && [0, 1, 2].every(i => progress.results.some(r => r.index === i));
  const showSummary = !!progress && (index === 4 || (index === 3 && !progress.validation));
  const dirty = !!progress && !attempt && !!(task.trim() || answer.trim() || decision) || !!attempt && !result && Object.keys(checks).length > 0;
  useUnsavedChanges(dirty, busy);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(''); setSelectionConfirmed(false);
    request<TemplateOverview>('', undefined, abort.signal).then(value => { if (!abort.signal.aborted) setOverview(value); }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload]);
  useEffect(() => {
    if (!sessionId || restored.current) return;
    const abort = new AbortController();
    request<{ progress: TemplateProgress }>('?session=' + encodeURIComponent(sessionId), undefined, abort.signal).then(value => { if (!abort.signal.aborted) { restored.current = true; open(value.progress); } }).catch(cause => { if (!abort.signal.aborted) setError((cause as Error).message); });
    return () => abort.abort();
  }, [sessionId, reload]);
  useEffect(() => { heading.current?.focus(); }, [index, progress?.session.id, !!attempt]);
  function resetDraft() { setTask(''); setAnswer(''); setDecision(''); setConfirmed(false); setChecks({}); answerRequest.current = { key: '', body: {} }; startedAt.current = Date.now(); }
  function open(value: TemplateProgress) {
    setProgress(value); resetDraft(); setError('');
    const unfinished = [0, 1, 2].find(i => !value.results.some(r => r.index === i));
    setIndex(unfinished ?? (value.validation && !value.results.some(r => r.index === 3) ? 3 : 4));
    setValidationId(''); setValidationConfirmed(false);
  }
  async function action(body: object, next?: (value: TemplateProgress) => void) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try { const value = await request<{ progress: TemplateProgress }>('', body, abort.signal); if (!abort.signal.aborted) { setProgress(value.progress); next?.(value.progress); } }
    catch (cause) { if (!abort.signal.aborted) setError((cause as Error).message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function resume(id: string) {
    if (!confirmUnsavedNavigation()) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try { const value = await request<{ progress: TemplateProgress }>('?session=' + encodeURIComponent(id), undefined, abort.signal); if (!abort.signal.aborted) { restored.current = true; open(value.progress); } }
    catch (cause) { if (!abort.signal.aborted) setError((cause as Error).message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function chooseMode(value: TrainingMode) { setMode(value); setPicks([]); setSelectionConfirmed(false); }
  const pool = overview?.questions.filter(q => trainingMode(q) === mode) ?? [];
  const expression = overview?.expressions.find(e => e.id === expressionId);
  const validationPool = overview?.questions.filter(q => trainingMode(q) === progress?.session.mode && !progress?.session.questions.some(old => old.id === q.id)) ?? [];
  function start() {
    if (!overview) return;
    const fields = { signature: overview.signature, expressionId, mode, questionIds: picks, confirmed: selectionConfirmed };
    const key = JSON.stringify(fields); if (pending.current.key !== key) pending.current = { key, id: `lab-template-${crypto.randomUUID()}` };
    void action({ action: 'start', ...fields, id: pending.current.id }, open);
  }
  function saveAnswer(unable: boolean) {
    if (!progress) return;
    const fields = { action: 'answer', id: progress.session.id, index, decision, task, confirmed, answer: unable ? '' : answer, unable };
    const key = JSON.stringify(fields); if (answerRequest.current.key !== key) answerRequest.current = { key, body: { ...fields, elapsedSeconds: Math.min(604800, Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))) } };
    void action(answerRequest.current.body, () => { setTask(''); setAnswer(''); setDecision(''); setChecks({}); });
  }
  const feedback = <FeatureFeedback key={`${progress?.session.id ?? 'selection'}-${showSummary ? 'result' : attempt ? 'reading' : 'practice'}`} feature="template" contextId={progress?.session.id} phase={!progress ? 'selection' : showSummary ? 'result' : attempt ? 'reading' : 'practice'} disabled={busy}/>;
  return <section className="panel lab-short-review lab-template-training" aria-busy={busy || loading}>
    <div className="lab-short-header"><h2><BookOpenCheck size={20}/>模板迁移训练 <span className="lab-beta">BETA</span></h2><span className="caption">一条表达 · 三题适配 · 可选独立验证</span></div>
    <p className="muted">检验熟悉的表达何时能用、何时需要调整。每题只练一两句关键表达。</p>
    {error && <p className="error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => setReload(v => v + 1)}>重新读取</button></p>}
    {!progress ? <>
      {loading ? <p role="status">正在读取表达库与题库…</p> : overview && <fieldset className="lab-template-setup" disabled={busy || !!sessionId && !restored.current}>
        <label className="lab-short-select">选择熟悉的句式<select aria-label="训练句式" value={expressionId} onChange={e => { setExpressionId(e.target.value); setSelectionConfirmed(false); }}><option value="">请选择表达库中的句式</option>{overview.expressions.map(e => <option key={e.id} value={e.id}>{e.category} · {e.title}</option>)}</select></label>
        {!overview.expressions.length && <p className="muted">表达库尚无启用的句式，请先在表达库添加或启用一条句式。</p>}
        {expression && <div className="lab-short-original"><strong>{expression.title}</strong><p className="english lab-template-pre">{expression.template}</p>{expression.notes && <details><summary>填空说明</summary><p className="lab-template-pre">{expression.notes}</p></details>}</div>}
        <label className="lab-short-select">题目类型<select aria-label="训练题目类型" value={mode} onChange={e => chooseMode(e.target.value as TrainingMode)}>{Object.entries(TRAINING_MODES).map(([key, name]) => <option key={key} value={key} disabled={overview.questions.filter(q => trainingMode(q) === key).length < 3}>{name}{overview.questions.filter(q => trainingMode(q) === key).length < 3 ? '（题量不足三题）' : ''}</option>)}</select></label>
        <div className="lab-short-header"><h3>选三道题</h3><button className="text-button" onClick={() => { setPicks(suggestedQuestions(pool)); setSelectionConfirmed(false); }}>按不同标签选三题</button></div>
        <p className="caption">建议覆盖不同主题或任务；标签只帮助选题，题意以原题为准。材料类目前不足三题，暂不可选。</p>
        {[0, 1, 2].map(i => <label className="lab-short-select" key={i}>训练题 {i + 1}<select aria-label={`训练题 ${i + 1}`} value={picks[i] ?? ''} onChange={e => { setPicks(old => { const next = [...old]; next[i] = e.target.value; return next; }); setSelectionConfirmed(false); }}><option value="">请选择题目</option>{pool.map(q => <option key={q.id} value={q.id} disabled={picks.some((id, j) => j !== i && id === q.id)}>{questionYearLabel(q)} · {q.title}</option>)}</select></label>)}
        <label className="lab-short-confirm"><input type="checkbox" checked={selectionConfirmed} onChange={e => setSelectionConfirmed(e.target.checked)}/>将结合每题原始文字和题图核对题意，不把题目标题当作完整要求</label>
        <button className="button primary" onClick={start} disabled={!expression || picks.filter(Boolean).length !== 3 || new Set(picks).size !== 3 || !selectionConfirmed}>{busy ? '正在保存…' : '开始三题训练'}</button>
      </fieldset>}
      {!!overview?.sessions.length && <div className="lab-short-history"><h3>已保存的模板训练</h3>{overview.sessions.map(s => <button className="lab-short-history-row" key={s.id} disabled={busy} onClick={() => void resume(s.id)}><span>{s.title}</span><small>{dateLabel(s.createdAt)}</small></button>)}</div>}
    </> : showSummary ? <>
      <h3 ref={heading} tabIndex={-1}>本轮迁移记录</h3><p className="caption">下列结论来自你的逐项自检；规则提示只帮助核对，不代替切题性或语法判断。</p>
      <div className="lab-template-results">{[...progress.attempts].sort((a, b) => a.index - b.index).map(a => { const q = a.index === 3 ? progress.validation : progress.session.questions[a.index], r = progress.results.find(item => item.index === a.index); return <details key={a.index}><summary>{a.index === 3 ? '独立验证' : `训练 ${a.index + 1}`} · {q?.title} · {a.unable ? '暂时不会' : r && Object.values(r.checks).every(v => v === 'matched' || v === 'na') ? '自检已对应' : '仍需核对'}</summary><p>模板处理：{TEMPLATE_DECISIONS[a.decision]}{a.index === 3 ? ` · ${a.hintUsed ? '查看过模板提示' : '未查看模板提示'}` : ''}</p><p>本题任务：{a.task}</p><p className="english lab-template-pre">{a.answer || '暂时不会'}</p><p className="caption">本次打开至提交约 {a.elapsedSeconds} 秒（含停留时间，仅供参考）</p>{r && <ul>{TEMPLATE_CHECKS.map(check => <li key={check.id}>{check.title}：{CHECK_VALUES[r.checks[check.id]]}</li>)}</ul>}<ul>{trainingSignals(a, progress.attempts.filter(other => other.index < a.index)).map(text => <li key={text}>{text}</li>)}</ul></details>; })}</div>
      {doneTraining && !progress.validation && <div className="lab-template-validation"><h3>用第四道题独立验证（可选）</h3><p className="muted">开始后先隐藏模板，也不展示前三题回答。需要时可主动查看模板，记录会注明使用过提示。</p><label className="lab-short-select">验证题<select aria-label="独立验证题" value={validationId} disabled={busy} onChange={e => { setValidationId(e.target.value); setValidationConfirmed(false); }}><option value="">选择未参加本轮训练的题目</option>{validationPool.map(q => <option key={q.id} value={q.id}>{questionYearLabel(q)} · {q.title}</option>)}</select></label><label className="lab-short-confirm"><input type="checkbox" checked={validationConfirmed} disabled={busy} onChange={e => setValidationConfirmed(e.target.checked)}/>确认使用新题独立作答</label><button className="button primary" disabled={busy || !validationId || !validationConfirmed} onClick={() => void action({ action: 'validation', id: progress.session.id, questionId: validationId, confirmed: true }, value => { resetDraft(); setIndex(3); setProgress(value); })}>开始独立验证</button></div>}
      <button className="button outline" disabled={busy} onClick={() => { setProgress(undefined); resetDraft(); setExpressionId(''); setPicks([]); setSelectionConfirmed(false); setReload(v => v + 1); }}>再开一轮训练</button>
    </> : question && <>
      <div className="lab-short-header"><h3 ref={heading} tabIndex={-1}>{index === 3 ? '第四题 · 独立验证' : `训练 ${index + 1} / 3`} · {attempt ? '核对迁移结果' : '适配本题'}</h3><span className="caption">{TRAINING_MODES[progress.session.mode]}</span></div>
      <QuestionMaterial question={question}/>
      {index !== 3 || attempt || progress.hintUsed ? <div className="lab-template-expression"><h4>{progress.session.expression.title}{index === 3 && !attempt ? ' · 已使用提示' : ''}</h4><p className="english lab-template-pre">{progress.session.expression.template}</p>{progress.session.expression.notes && <details><summary>填空说明</summary><p className="lab-template-pre">{progress.session.expression.notes}</p></details>}</div> : <button className="button outline small" disabled={busy} onClick={() => void action({ action: 'hint', id: progress.session.id })}>查看模板（记录提示使用）</button>}
      {!attempt ? <fieldset className="lab-template-setup" disabled={busy}>
        <label className="lab-short-answer">本题要回应什么？<textarea aria-label="本题任务" maxLength={1200} placeholder="核对题面后，简要写出主题、对象或本段必须回应的任务。中文即可。" value={task} onChange={e => setTask(e.target.value)}/></label>
        <label className="lab-short-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>已核对文字要求与题图（如有），上述题意可作为本次检查依据</label>
        <fieldset className="lab-template-decisions"><legend>这条表达在本题中如何处理？</legend>{Object.entries(TEMPLATE_DECISIONS).map(([key, title]) => <label key={key}><input type="radio" name="template-decision" checked={decision === key} onChange={() => setDecision(key as TemplateDecision)}/>{title}</label>)}</fieldset>
        <label className="lab-short-answer">关键表达（1–2 句）<textarea aria-label="迁移关键表达" lang="en" maxLength={2400} placeholder={decision === 'skip' ? '不使用原模板，写出符合本题任务的替代表达。' : '保留适用的固定部分，补入本题内容、理由或具体行动。'} value={answer} onChange={e => setAnswer(e.target.value)}/></label>
        <div className="lab-short-actions"><button className="button outline" disabled={!task.trim() || !confirmed || !decision} onClick={() => saveAnswer(true)}>暂时不会，保存记录</button><button className="button primary" disabled={!task.trim() || !confirmed || !decision || !/[A-Za-z]/.test(answer)} onClick={() => saveAnswer(false)}>{busy ? '正在保存…' : '保存作答并逐项核对'}</button></div>
      </fieldset> : <>
        <div className="lab-short-comparison"><div><h4>你确认的本题任务</h4><p>{attempt.task}</p><p>模板处理：{TEMPLATE_DECISIONS[attempt.decision]}</p></div><div><h4>你的关键表达</h4><p className="english">{attempt.unable ? '暂时不会' : attempt.answer}</p></div></div>
        <div className="lab-template-signals"><h4>核对线索</h4><ul>{trainingSignals(attempt, progress.attempts.filter(a => a.index < index)).map(text => <li key={text}>{text}</li>)}</ul><p className="caption">规则只识别文本线索；未提示不代表切题或语言正确。</p></div>
        <div className="lab-template-checks">{TEMPLATE_CHECKS.map(check => <fieldset key={check.id} disabled={busy || !!result}><legend>{check.title}</legend><p>{check.prompt}</p><div>{Object.entries(CHECK_VALUES).filter(([key]) => !(key === 'na' && ['topic', 'task'].includes(check.id)) && !(attempt.unable && key === 'matched')).map(([key, label]) => <label key={key}><input type="radio" name={`check-${check.id}`} checked={(result?.checks ?? checks)[check.id] === key} onChange={() => setChecks(previous => ({ ...previous, [check.id]: key }))}/>{label}</label>)}</div></fieldset>)}</div>
        <div className="lab-short-actions"><button className="button primary" disabled={busy || !TEMPLATE_CHECKS.every(check => checks[check.id])} onClick={() => void action({ action: 'assess', id: progress.session.id, index, checks }, () => { resetDraft(); setIndex(index === 2 || index === 3 ? 4 : index + 1); })}>{busy ? '正在保存…' : index < 2 ? '保存自检，下一题' : '保存自检，查看本轮记录'}</button></div>
      </>}
    </>}
    {feedback}
  </section>;
}
