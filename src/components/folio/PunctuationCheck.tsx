import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import { applyPunctuationSuggestions, type PunctuationCheck as Check } from '../../lib/punctuation-check';

const visible = (value: string) => value
  ? value.replaceAll(' ', '[空格]').replaceAll('\u00a0', '[不换行空格]').replaceAll('\u3000', '[全角空格]').replaceAll('\t', '[Tab]')
  : '（空）';

const transcriptionReminder = '请对照手写原稿，只修正打字录入有误的地方。手稿本身的拼写或语法错误请保留，供后续批阅。';

interface CheckActions {
  busy: boolean;
  error: string;
  confirmLabel: string;
  onConfirm: (text: string) => void;
  onBack: () => void;
}

function excerpt(source: string, start: number, end: number) {
  const left = source.slice(Math.max(0, start - 55), start);
  const right = source.slice(end, end + 55);
  return {
    left: left.slice(Math.max(left.lastIndexOf('\n'), left.lastIndexOf('\r')) + 1).trimStart(),
    right: right.split(/[\r\n]/, 1)[0].trimEnd(),
  };
}

export default function PunctuationCheck({check, busy, error, confirmLabel, onConfirm, onBack, transcription = false}: CheckActions & {
  check: Check;
  transcription?: boolean;
}) {
  const [limit, setLimit] = useState(100);
  const [selected, setSelected] = useState(() => new Set(transcription ? [] : check.suggestions.map(s => s.id)));
  const preview = useMemo(() => applyPunctuationSuggestions(check, selected), [check, selected]);

  function toggle(id: string, checked: boolean) {
    setSelected(old => {
      const next = new Set(old);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return <div className="punctuation-check">
    {transcription
      ? <p className="punctuation-intro"><strong>{transcriptionReminder}</strong></p>
      : <p className="punctuation-intro">只检查中文标点与空格。不会纠正拼写、语法、大小写，也不增删标点或替换标点类型。换行和行首缩进保留。</p>}
    <div className="punctuation-summary">
      <strong>{check.suggestions.length ? `${check.suggestions.length} 处修改建议` : transcription
        ? (check.warnings.length ? '有疑似问题，请人工核对' : '未发现明显的录入问题')
        : '未发现可自动处理的标点或空格问题'}</strong>
      <span aria-live="polite">已选 {selected.size} / {check.suggestions.length} 处</span>
    </div>
    {!!check.suggestions.length && <>
      {!transcription && <div className="punctuation-selection">
        <span>建议用 [空格]、[全角空格]、[不换行空格]、[Tab] 显示不可见空白；（空）表示删除为空。</span>
        <div>
          <button className="text-button" disabled={busy} onClick={() => setSelected(new Set(check.suggestions.map(s => s.id)))}>全选建议</button>
          <button className="text-button" disabled={busy} onClick={() => setSelected(new Set())}>取消全选</button>
        </div>
      </div>}
      <ul className="punctuation-suggestions">
        {check.suggestions.slice(0, limit).map((s, i) => {
          const context = transcription ? excerpt(check.source, s.start, s.end) : null;
          return <li key={s.id}><label>
            <input type="checkbox" aria-label={transcription ? `应用第${i + 1}处录入修改` : `应用第${i + 1}处修改`}
              checked={selected.has(s.id)} disabled={busy} onChange={e => toggle(s.id, e.target.checked)}/>
            <span>
              <small>第 {s.line} 行 · 第 {s.column} 列</small>
              {context && <span className="transcription-context english">{context.left}<mark>{s.before || '│'}</mark>{context.right}</span>}
              <span className="punctuation-change">
                <code>{transcription ? s.before.trim() || '（插入）' : visible(s.before)}</code><ArrowRight size={14}/>
                <code>{transcription ? s.after.trim() || '（删除）' : visible(s.after)}</code>
              </span>
              <span className="punctuation-reason">{s.reasons.join('；')}</span>
            </span>
          </label></li>;
        })}
      </ul>
      {check.suggestions.length > limit && <button className="text-button" onClick={() => setLimit(limit + 100)}>
        显示更多建议（已显示 {limit} / {check.suggestions.length}；未展开建议也按勾选状态应用）
      </button>}
    </>}
    {!!check.warnings.length && <details className="punctuation-warnings" open>
      <summary>{check.warnings.length} 处需要人工核对</summary>
      <ul>{check.warnings.slice(0, limit).map((w, i) => <li key={`${w.start}-${i}`}>第 {w.line} 行：{w.message}</li>)}</ul>
      {check.warnings.length > limit && <button className="text-button" onClick={() => setLimit(limit + 100)}>显示更多人工核对提示</button>}
      <p>{transcription ? '确认存在录入错误时，可以返回编辑手动修正。' : '这些提示不会增加或删除任何标点；可返回编辑后重新检查。'}</p>
    </details>}
    <div className="punctuation-preview-grid">
      <section><h3>{transcription ? '第一轮确认后的正文' : '检查前原文'}</h3><pre className="english" data-punctuation-original>{check.source}</pre></section>
      <section><h3>应用所选建议后的预览</h3><pre className="english" data-punctuation-preview aria-live="polite">{preview}</pre></section>
    </div>
    <p className="caption punctuation-consent">{transcription
      ? '录入建议默认全部不勾选。可以保留第一轮确认后的正文并提交。'
      : '确认前不会应用修改。取消勾选的建议不会应用；正文以此处预览为准。'}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button className="button ghost" disabled={busy} onClick={onBack}>返回编辑</button>
      <button className="button primary" disabled={busy} onClick={() => onConfirm(preview)}>
        {busy ? <LoaderCircle size={17} className="spin"/> : <CheckCircle2 size={17}/>} {confirmLabel}
      </button>
    </div>
  </div>;
}

export function TranscriptionCheck({source, ...actions}: CheckActions & {source: string}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../lib/transcription-worker.ts', import.meta.url), {type: 'module'});
    } catch {
      setFailed(true);
      return;
    }
    const fail = () => { worker.terminate(); setFailed(true); };
    worker.onmessage = ({data}: MessageEvent<Check>) => {
      clearTimeout(timeout);
      worker.terminate();
      setCheck(data);
    };
    worker.onerror = event => {
      event.preventDefault();
      clearTimeout(timeout);
      fail();
    };
    const timeout = setTimeout(fail, 15000);
    worker.postMessage(source);
    return () => { clearTimeout(timeout); worker.terminate(); };
  }, [source, attempt]);

  if (check) return <PunctuationCheck check={check} transcription {...actions}/>;

  return <div className="punctuation-check">
    <p className="punctuation-intro"><strong>{transcriptionReminder}</strong></p>
    {failed
      ? <>
        <p className="error" role="alert">自动核对暂不可用。你可以重试，或对照下方正文手动核对后提交。</p>
        <div className="punctuation-preview-grid">
          <section><h3>第一轮确认后的正文</h3><pre className="english">{source}</pre></section>
        </div>
        {actions.error && <p className="error" role="alert">{actions.error}</p>}
      </>
      : <p className="muted" role="status">正在检查英文拼写和常见录入问题…</p>}
    <div className="modal-actions">
      <button className="button ghost" disabled={actions.busy} onClick={actions.onBack}>返回编辑</button>
      {failed && <>
        <button className="button outline" disabled={actions.busy} onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>重试</button>
        <button className="button primary" disabled={actions.busy} onClick={() => actions.onConfirm(source)}>已手动核对，提交并提醒</button>
      </>}
    </div>
  </div>;
}
