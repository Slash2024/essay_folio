import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck, LoaderCircle } from 'lucide-react';
import { QUIZ_MODES, quizRangeLabel, QUIZ_REVIEW_REASONS, type QuizOverview, type QuizProgress, type QuizMode, type QuizRange, type QuizCueEditor, type QuizVerdict } from '../../lib/expression-quiz';
import { wordDiff } from '../../lib/revisions';
import { dateLabel } from '../../lib/client';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import FeatureFeedback from './FeatureFeedback';
import './expression-quiz.css';
async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/expression-quiz' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { cache: 'no-store', signal });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '抽背暂时不可用，请重试。'); return value;
}
const percent = (value: number | null) => value === null ? '—' : `${value}%`;
function DiffText({ before, after }: { before: string; after: string }) {
  return <div className="quiz-diff" aria-label="与首个参考表达的文字差异">{wordDiff(before, after).map((part, index) => part.type === 'remove' ? <del key={index}>{part.value}</del> : part.type === 'add' ? <ins key={index}>{part.value}</ins> : <span key={index}>{part.value}</span>)}</div>;
}
export default function ExpressionQuiz({ sessionId, onSessionChange }: { sessionId?: string; onSessionChange?: (id?: string) => void }) {
  const [overview, setOverview] = useState<QuizOverview>(), [progress, setProgress] = useState<QuizProgress>();
  const [tab, setTab] = useState<'setup' | 'history' | 'practice' | 'result'>('setup');
  const [mode, setMode] = useState<QuizMode>('meaning'), [range, setRange] = useState<QuizRange>({ main: '', sub: '' }), [count, setCount] = useState('10');
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState(''), [rehearsing, setRehearsing] = useState(false), [practiceAnswer, setPracticeAnswer] = useState('');
  const [reviewReason, setReviewReason] = useState<string>(QUIZ_REVIEW_REASONS[0]), [reviewVerdict, setReviewVerdict] = useState<QuizVerdict>('correct'), [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [retryOf, setRetryOf] = useState<string | null>(null);
  const pending = useRef({ key: '', id: '' }), pendingPractice = useRef({ key: '', id: '' }), lock = useRef(false), controller = useRef<AbortController>(), restored = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null), input = useRef<HTMLTextAreaElement>(null);
  useUnsavedChanges(!!answer || !!practiceAnswer || confirmed, busy);
  useEffect(() => { onSessionChange?.(progress?.session.id); }, [progress?.session.id, onSessionChange]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    request<QuizOverview>('', undefined, abort.signal).then(value => { if (!abort.signal.aborted) setOverview(value); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    if (!sessionId || restored.current) return;
    const abort = new AbortController();
    request<{ progress: QuizProgress }>('?session=' + encodeURIComponent(sessionId), undefined, abort.signal).then(({ progress: p }) => {
      if (abort.signal.aborted) return;
      restored.current = true; setProgress(p); setIndex(Math.max(0, p.questions.findIndex(q => !p.results.some(r => r.index === q.index)))); setTab(p.score.complete ? 'result' : 'practice');
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [sessionId, retry]);
  useEffect(() => { if (tab === 'practice') { heading.current?.focus(); if (!progress?.results.some(r => r.index === index)) input.current?.focus(); } }, [tab, index, progress?.session.id]);
  const question = progress?.questions[index], result = progress?.results.find(r => r.index === index), practice = progress?.practices.find(r => r.index === index);
  const selectedRange = overview?.ranges.find(r => r.main === range.main && r.sub === range.sub);
  const available = selectedRange?.counts[mode] ?? 0;
  const mainRanges = overview?.ranges.filter(r => r.main && !r.sub) ?? [];
  const subRanges = overview?.ranges.filter(r => r.main === range.main && r.sub) ?? [];
  async function act(body?: object, query = '', after?: (p: QuizProgress) => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); const abort = new AbortController(); controller.current = abort;
    try {
      const { progress: p } = await request<{ progress: QuizProgress }>(query, body, abort.signal);
      if (!abort.signal.aborted) { setProgress(p); restored.current = true; setAnswer(''); setPracticeAnswer(''); setConfirmed(false); after?.(p); }
    } catch (cause) { if (!abort.signal.aborted) setError((cause as Error).message); }
    finally { lock.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  function navigate(next: typeof tab) {
    if (!confirmUnsavedNavigation()) return;
    setAnswer(''); setPracticeAnswer(''); setConfirmed(false); setError(''); if (next === 'setup') { pending.current = { key: '', id: '' }; setProgress(undefined); setRehearsing(false); } setTab(next);
    if (next === 'history' || next === 'setup') setRetry(v => v + 1);
  }
  function begin() {
    const fields = { mode, scope: 'all', range, count: Number(count), signature: overview?.signature, retryOf }, key = JSON.stringify(fields);
    if (pending.current.key !== key) pending.current = { key, id: `lab-quiz-${crypto.randomUUID()}` };
    void act({ action: 'start', id: pending.current.id, ...fields }, '', () => { setIndex(0); setRehearsing(false); setTab('practice'); });
  }
  function open(id: string) {
    if (!confirmUnsavedNavigation()) return;
    void act(undefined, '?session=' + encodeURIComponent(id), p => { const next = p.questions.findIndex(q => !p.results.some(r => r.index === q.index)); setIndex(Math.max(0, next)); setTab(p.score.complete ? 'result' : 'practice'); setRehearsing(false); });
  }
  function fresh() { pending.current = { key: '', id: '' }; setRetryOf(null); navigate('setup'); }
  function retryWrong() {
    if (!progress) return;
    const wrong = progress.results.filter(r => !r.pending && (r.correction?.verdict ?? r.verdict) === 'incorrect').length;
    setRetryOf(progress.session.id); setMode(progress.session.mode); setRange(progress.session.range ?? { main: '', sub: '' }); setCount(String(Math.min(50, wrong))); pending.current = { key: '', id: '' }; navigate('setup');
  }
  function next() { if (!confirmUnsavedNavigation()) return; setAnswer(''); setPracticeAnswer(''); setConfirmed(false); setRehearsing(false); if (progress && index + 1 < progress.questions.length) setIndex(index + 1); else setTab('result'); }
  async function historyPage(offset: number) {
    if (lock.current) return; setError(''); setLoading(true);
    try { setOverview(await request<QuizOverview>('?offset=' + offset)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  const message = error && <p className="error quiz-error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => { if (progress) { if (confirmUnsavedNavigation()) void act(undefined, '?session=' + encodeURIComponent(progress.session.id)); } else setRetry(v => v + 1); }}>重新读取</button></p>;
  const score = progress?.score;
  return <section className="expression-quiz" aria-busy={busy || loading}>
    <div className="quiz-title"><h2><ClipboardCheck size={23}/>表达库抽背 <span className="lab-beta">BETA</span></h2><p className="muted">看中文，写英文，检验这次能否独立想起。</p></div>
    <div className="quiz-tabs" role="group" aria-label="抽背页面"><button className={tab !== 'history' ? 'active' : ''} disabled={busy} onClick={() => navigate(progress && !score?.complete ? 'practice' : 'setup')}>{progress && !score?.complete ? '继续本轮' : '开始抽背'}</button><button className={tab === 'history' ? 'active' : ''} disabled={busy} onClick={() => navigate('history')}>历史成绩</button>{progress && <button disabled={busy} onClick={() => navigate('result')}>本轮记录</button>}</div>
    {message}
    {tab === 'setup' && <div className="quiz-columns"><div>
      <form className="panel quiz-setup" onSubmit={e => { e.preventDefault(); begin(); }}>
        <h3>准备这一轮</h3>
        {retryOf && <p className="quiz-note">正在重练上一轮错题。使用当前表达库与提示重新出题；已停用、删除或缺少提示的表达不再出题。<button type="button" className="text-button" onClick={() => setRetryOf(null)}>取消错题筛选</button></p>}
        <fieldset disabled={busy || loading || !!sessionId && !restored.current}>
          <div className="quiz-setting"><label htmlFor="quiz-count">本轮抽查数量</label><div><div className="quiz-count"><input id="quiz-count" type="number" min="1" max="50" step="1" required value={count} onChange={e => setCount(e.target.value)}/><span>条</span>{[5, 10, 20].map(n => <button type="button" key={n} className={Number(count) === n ? 'selected' : ''} onClick={() => setCount(String(n))}>{n}条</button>)}</div><p className="caption">每轮1–50题，随机抽取，条目不重复。</p></div></div>
          <div className="quiz-setting"><span>抽查范围</span><div><div className="quiz-category-selects" role="group" aria-label="抽查范围">
            <div><label htmlFor="quiz-main">一级分类</label><select id="quiz-main" value={range.main} onChange={e => setRange({ main: e.target.value, sub: '' })}><option value="">全部类别</option>{mainRanges.map(r => <option key={r.main} value={r.main}>{r.main}（{r.counts[mode]}题）</option>)}{range.main && !mainRanges.some(r => r.main === range.main) && <option value={range.main}>{range.main}（已失效，请重选）</option>}</select></div>
            <div><label htmlFor="quiz-sub">二级分类</label><select id="quiz-sub" disabled={!range.main} value={range.sub} onChange={e => setRange(r => ({ ...r, sub: e.target.value }))}><option value="">{range.main ? '全部子类' : '请先选择一级分类'}</option>{subRanges.map(r => <option key={r.sub} value={r.sub}>{r.sub}（{r.counts[mode]}题）</option>)}{range.sub && !subRanges.some(r => r.sub === range.sub) && <option value={range.sub}>{range.sub}（已失效，请重选）</option>}</select></div>
          </div><p className="caption">例如：大作文 / 原因，小作文 / 邀请。未细分的词条按来源归入“通用词条”。</p></div></div>
          <div className="quiz-setting"><span>提示方式</span><div className="quiz-modes" role="group" aria-label="提示方式">{Object.entries(QUIZ_MODES).map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key as QuizMode)}><strong>{label}</strong><small>{key === 'meaning' ? '根据中文提示写出对应表达' : '根据写作情景调用合适表达'}</small></button>)}</div></div>
          <p className="quiz-note" role="status">{overview?.coverage && <>表达库已启用 <strong>{overview.coverage.enabled.sentence}</strong> 条句式、<strong>{overview.coverage.enabled.word}</strong> 条词条，共 <strong>{overview.coverage.enabled.all}</strong> 条。<br/>当前范围：{quizRangeLabel({ range, scope: 'all' })}；{QUIZ_MODES[mode]}已覆盖 {selectedRange?.covered[mode] ?? 0} / {selectedRange?.enabled ?? 0} 条。相同提示在所选范围内合并为一道题。</>}</p>
          {!loading && overview && !selectedRange && <p className="quiz-note" role="alert">原分类已变更，请重新选择一级与二级分类后开始。</p>}
          <p className="caption" role="status">{loading ? '正在读取可抽条目…' : `当前范围可抽 ${available} 题${retryOf ? '，错题筛选后的数量以开始时核对为准' : ` · 本轮抽查 ${count || 0} 题`}`}</p>
          {!loading && !available && <p className="quiz-note">这个范围暂无可抽题目。可切换范围，或在下方“调整抽背提示”补充中文提示。</p>}
          {!loading && Number(count) > available && !!available && <p className="quiz-note">当前最多可抽 {available} 题，请减少数量。</p>}
          <button className="button primary quiz-start" disabled={!overview || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > Math.min(50, available)}>{busy ? <LoaderCircle size={17} className="spin"/> : <>开始抽背 <ArrowRight size={17}/></>}</button>
        </fieldset>
      </form>
      <CueSettings onSaved={() => setRetry(v => v + 1)} disabled={busy}/>
    </div><aside className="quiz-side"><div className="panel"><h3>成绩怎样记录？</h3><ol><li>首次独立作答计入正确率。</li><li>想不起来，提交后看答案。</li><li>每题自动保存，中途可继续。</li></ol><p className="caption">句式中的可变位置用 ___ 表示，只检查固定骨架。提示相同的已收录表达可以互相替代。</p></div>{overview?.sessions[0] && <div className="panel"><h3>最近一轮</h3><p>{overview.sessions[0].score.answered}/{overview.sessions[0].score.total} 题 · 正确率 {percent(overview.sessions[0].score.accuracy)}</p><p className="caption">{overview.sessions[0].score.pending ? `${overview.sessions[0].score.pending}题待复核 · ` : ''}{overview.sessions[0].score.complete ? '已完成作答' : '进行中'}</p><button className="text-button" disabled={busy} onClick={() => open(overview.sessions[0].id)}>查看记录 →</button></div>}</aside></div>}
    {tab === 'history' && <div className="panel quiz-history"><h3>历史成绩</h3><p className="caption">正确率按首次作答计算，已应用明确标记的人工复核；待复核题不进入分母。不同提示方式分别标注，未完成轮次不作为完整成绩。</p>{loading ? <p role="status">正在读取成绩…</p> : !overview?.sessions.length ? <p className="muted">还没有抽背记录，开始一轮后会逐题保存。</p> : <>{overview.sessions.map(s => <button className="quiz-history-row" key={s.id} disabled={busy} onClick={() => open(s.id)}><span><strong>{QUIZ_MODES[s.mode]} · {quizRangeLabel(s)}</strong><small>{dateLabel(s.createdAt)} · {s.score.complete ? '已完成作答' : '进行中'}{s.score.pending ? ` · ${s.score.pending}题待复核` : ''}{s.score.corrected ? ` · ${s.score.corrected}题经人工复核` : ''}</small></span><span>{s.score.answered}/{s.score.total}题 · 答对{s.score.correct}题 <b>{percent(s.score.accuracy)}</b> →</span></button>)}<div className="quiz-pages"><button className="button outline small" disabled={busy || !overview.offset} onClick={() => void historyPage(Math.max(0, overview.offset - 10))}>上一页</button><span className="caption">共 {overview.totalSessions} 轮</span><button className="button outline small" disabled={busy || !overview.hasNext} onClick={() => void historyPage(overview.offset + 10)}>下一页</button></div></>}</div>}
    {tab === 'practice' && progress && question && <div className="quiz-columns"><div className="panel quiz-question">
      <div className="quiz-progress"><strong>第 {index + 1} / {progress.questions.length} 题</strong><progress value={progress.results.length} max={progress.questions.length} aria-label="本轮已答题数"/><span>{question.kind === 'word' ? '单词／短语' : '句式'} · {QUIZ_MODES[progress.session.mode]} · {quizRangeLabel(progress.session)}</span></div>
      <p className="quiz-prompt-label">{QUIZ_MODES[progress.session.mode]}</p><h3 ref={heading} tabIndex={-1}>{question.prompt}</h3>
      <p className="caption">{question.slots ? `用 ___ 表示 ${question.slots} 个可变位置，只默写固定骨架；本题不判定填入内容的语法。` : '写出对应英文表达；大小写、空格及一般标点差异不影响判定。'}</p>
      {!result ? <form onSubmit={e => { e.preventDefault(); void act({ action: 'answer', id: progress.session.id, index, answer, skipped: false }); }}><label className="quiz-answer-label" htmlFor="quiz-answer">你的英文作答</label><textarea ref={input} id="quiz-answer" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={3000} disabled={busy} autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="off" placeholder="先独立回忆，再输入英文…"/><div className="quiz-actions"><button className="button primary" disabled={busy || !answer.trim()}>{busy ? '正在判定并保存…' : '提交答案'}</button><button type="button" className="button outline" disabled={busy} onClick={() => void act({ action: 'answer', id: progress.session.id, index, answer: '', skipped: true })}>想不起来</button></div></form> : <>
        <p className="quiz-answer-label">你的首次作答</p><div className="quiz-submitted">{result.skipped ? '本次选择：想不起来' : result.answer}</div>
        <div className={`quiz-verdict ${(result.correction?.verdict ?? result.verdict) === 'correct' && !result.pending ? 'correct' : 'incorrect'}`} role="status">{result.pending ? <CircleAlert size={18}/> : (result.correction?.verdict ?? result.verdict) === 'correct' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}<strong>{result.pending ? '待人工复核，暂不计入正确率' : result.correction ? `人工复核：${result.correction.verdict === 'correct' ? '答对' : '未答对'}` : `自动判定：${result.verdict === 'correct' ? '答对' : '未答对'}`}</strong><p>{result.reason}</p>{result.correction && <p>原自动判定：{result.verdict === 'correct' ? '答对' : '未答对'} · 复核原因：{result.correction.reason}</p>}</div>
        <div className="quiz-reference"><strong>参考表达</strong>{result.references.map(ref => <div key={ref.key}><p lang="en">{ref.text}</p>{ref.answers.filter(a => a !== ref.text).length > 0 && <details><summary>可接受变体</summary>{ref.answers.filter(a => a !== ref.text).map(a => <p key={a} lang="en">{a}</p>)}</details>}</div>)}{!result.skipped && result.verdict === 'incorrect' && <><span className="caption">文字对照：删除部分为你的原输入，新增部分为首个参考表达。标点等格式差异仅用于展示。</span><DiffText before={result.answer} after={result.references[0].text}/></>}</div>
        {result.pending && <fieldset className="quiz-review" disabled={busy}><legend>核对这次判定</legend><p className="caption">由你核对语义、词形与用途；保留原作答和自动结论，人工复核单独存档，仅应用于本题。</p><label>复核结论<select value={reviewVerdict} onChange={e => { setReviewVerdict(e.target.value as QuizVerdict); setConfirmed(false); }}><option value="correct">应计为答对</option><option value="incorrect">保留为未答对</option></select></label><label>复核原因<select value={reviewReason} onChange={e => { setReviewReason(e.target.value); setConfirmed(false); }}>{QUIZ_REVIEW_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label className="quiz-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>已核对答案与题意，确认复核结论</label><button className="button outline small" disabled={!confirmed} onClick={() => void act({ action: 'correct', id: progress.session.id, index, verdict: reviewVerdict, reason: reviewReason, confirmed })}>保存复核结论</button></fieldset>}
        {rehearsing && !practice && <form className="quiz-rehearse" onSubmit={e => { e.preventDefault(); const fields = { answer: practiceAnswer }, key = JSON.stringify({ session: progress.session.id, index, ...fields }); if (pendingPractice.current.key !== key) pendingPractice.current = { key, id: `lab-quiz-practice-${crypto.randomUUID()}` }; void act({ action: 'practice', id: progress.session.id, index, ...fields, skipped: false, operationId: pendingPractice.current.id }); }}><label htmlFor="quiz-practice">再默写一次（不覆盖首次成绩）</label><textarea id="quiz-practice" value={practiceAnswer} maxLength={3000} disabled={busy} spellCheck={false} onChange={e => setPracticeAnswer(e.target.value)}/><button className="button outline small" disabled={busy || !practiceAnswer.trim()}>核对并保存重练</button></form>}
        {practice && <div className="quiz-note"><strong>本题重练：{practice.verdict === 'correct' ? '与已收录答案一致' : '仍有差异'}</strong><p lang="en">{practice.answer}</p><p className="caption">{practice.reason} 重练不计入首次正确率。</p></div>}
        <div className="quiz-actions"><button className="button primary" disabled={busy} onClick={next}>{index + 1 < progress.questions.length ? '下一题' : '查看本轮成绩'} <ArrowRight size={17}/></button>{!practice && <button className="button outline" disabled={busy} onClick={() => setRehearsing(true)}>重练本题</button>}{!result.pending && !result.correction && !result.skipped && <button className="text-button" disabled={busy} onClick={() => void act({ action: 'review', id: progress.session.id, index })}>对判定有异议</button>}</div>
        <p className="quiz-saved"><CheckCircle2 size={15}/>本题结果已保存 <span>重练用于巩固，不覆盖首次成绩。</span></p>
      </>}
    </div><aside className="panel quiz-score"><h3>本轮进度</h3><dl><div><dt>已答</dt><dd>{score!.answered} / {score!.total}</dd></div><div><dt>首次答对</dt><dd>{score!.correct} 题</dd></div><div><dt>当前正确率</dt><dd>{percent(score!.accuracy)}</dd></div><div><dt>未完成</dt><dd>{score!.total - score!.answered} 题</dd></div>{!!score!.pending && <div><dt>待复核</dt><dd>{score!.pending} 题</dd></div>}</dl><p className="caption">正确率分母为已判定的 {score!.graded} 题。{score!.corrected ? `${score!.corrected}题已应用人工复核。` : '只计算首次独立作答。'}</p></aside></div>}
    {tab === 'result' && progress && score && <div className="panel quiz-results"><h3>{score.complete ? '本轮抽背成绩' : '本轮记录 · 尚未完成'}</h3><div className="quiz-summary"><div><strong>{percent(score.accuracy)}</strong><span>首次作答正确率</span></div><p>{QUIZ_MODES[progress.session.mode]} · {quizRangeLabel(progress.session)} · 已答 {score.answered}/{score.total} 题 · 答对 {score.correct} 题 · 未答对 {score.incorrect} 题{score.skipped ? `（含${score.skipped}题想不起来）` : ''}</p></div><p className="caption">{score.pending ? `${score.pending}题待复核，暂不进入分母。` : ''}{score.corrected ? `${score.corrected}题已应用人工复核，原自动结果保留。` : ''}{score.complete ? '首次作答与成绩快照已存档。' : '进行中记录已保存，完成所有题目后生成整轮成绩快照。'} 不同题目和提示方式的难度不同，请结合明细比较。</p><div className="quiz-actions">{!score.complete && <button className="button primary" disabled={busy} onClick={() => { setIndex(progress.questions.findIndex(q => !progress.results.some(r => r.index === q.index))); setTab('practice'); }}>继续未完成题目</button>}<button className="button outline" disabled={busy || !score.incorrect} onClick={retryWrong}>重练本轮错题</button><button className="button outline" disabled={busy} onClick={fresh}>再开一轮</button></div><div className="quiz-result-list">{progress.questions.map(q => { const r = progress.results.find(r => r.index === q.index); return <button key={q.index} disabled={busy} onClick={() => { if (r || q.index === progress.questions.findIndex(item => !progress.results.some(r => r.index === item.index))) { setIndex(q.index); setTab('practice'); setRehearsing(false); } }}><span>{q.index + 1}. {q.prompt}</span><b>{!r ? '未作答' : r.pending ? '待复核' : (r.correction?.verdict ?? r.verdict) === 'correct' ? '答对' : r.skipped ? '想不起来' : '未答对'} →</b></button>; })}</div></div>}
    <FeatureFeedback key={progress?.session.id ?? 'setup'} feature="quiz" contextId={progress?.session.id} phase={!progress ? 'selection' : tab === 'result' ? 'result' : 'practice'} disabled={busy}/>
  </section>;
}
function CueSettings({ onSaved, disabled }: { onSaved: () => void; disabled: boolean }) {
  const [entries, setEntries] = useState<QuizCueEditor[]>(), [draft, setDraft] = useState<QuizCueEditor>(), [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  const pending = useRef({ key: '', id: '' });
  useUnsavedChanges(dirty, busy);
  async function load() {
    setBusy(true); setError(''); try { setEntries((await request<{ entries: QuizCueEditor[] }>('?cues=1')).entries); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function select(key: string) { if (!confirmUnsavedNavigation()) return; const e = entries?.find(e => e.key === key); setDraft(e); setExtra(e?.answers.join('\n') ?? ''); setDirty(false); setSaved(false); setError(''); }
  async function save() {
    if (!draft) return; setBusy(true); setError('');
    const fields = { key: draft.key, sourceSignature: draft.sourceSignature, baseRevision: draft.revision, meaning: draft.meaning, scenario: draft.scenario, answers: extra.split('\n').map(s => s.trim()).filter(Boolean) }, key = JSON.stringify(fields);
    if (pending.current.key !== key) pending.current = { key, id: `lab-quiz-cue-save-${crypto.randomUUID()}` };
    try { const data = await request<{ entries: QuizCueEditor[] }>('', { action: 'cue', operationId: pending.current.id, ...fields }); setEntries(data.entries); setDraft(data.entries.find(e => e.key === draft.key)); setDirty(false); setSaved(true); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="quiz-cue-settings" onToggle={e => { if (e.currentTarget.open && !entries && !busy) void load(); }}><summary>调整抽背提示 <span>补充缺失提示或可接受答案</span></summary><p className="caption">仅保存抽背设置，不修改表达库。来源更新后，自定义设置需重新核对；缺少某种提示的条目不参与该模式。</p>{error && <p className="error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => void load()}>重新读取</button></p>}{!entries ? <p role="status">正在读取表达…</p> : <><label>选择表达<select aria-label="调整提示的表达" disabled={busy || disabled} value={draft?.key ?? ''} onChange={e => select(e.target.value)}><option value="">请选择…</option>{entries.map(e => <option key={e.key} value={e.key}>{e.title}{!e.meaning || !e.scenario ? ' · 提示待补充' : ''}{e.stale ? ' · 来源有更新' : ''}</option>)}</select></label>{draft && <fieldset disabled={busy || disabled}><p className="quiz-cue-source" lang="en">{draft.text}</p>{draft.stale && <p className="quiz-note">原自定义提示对应的表达已变化，当前显示默认提示。请重新核对后保存。</p>}<label>中文释义<textarea aria-label="抽背中文释义" value={draft.meaning} maxLength={900} onChange={e => { setDraft({ ...draft, meaning: e.target.value }); setDirty(true); setSaved(false); }}/></label><label>情景描述<textarea aria-label="抽背情景描述" value={draft.scenario} maxLength={900} onChange={e => { setDraft({ ...draft, scenario: e.target.value }); setDirty(true); setSaved(false); }}/></label><label>额外可接受答案（选填，每行一项，最多12项）<textarea aria-label="额外可接受答案" value={extra} maxLength={22000} onChange={e => { setExtra(e.target.value); setDirty(true); setSaved(false); }}/></label><p className="caption">请只加入已核对、与提示相符的答案。库内原表达及词条已有变体会自动保留。中文提示不要包含英文答案。</p><button className="button outline small" type="button" disabled={!dirty && !draft.stale} onClick={() => void save()}>{busy ? '正在保存…' : '保存抽背提示'}</button>{saved && <p className="quiz-saved" role="status">抽背提示已保存。</p>}</fieldset>}</>}</details>;
}
