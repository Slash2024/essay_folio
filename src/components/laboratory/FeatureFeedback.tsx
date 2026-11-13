import { useRef, useState } from 'react';
import { FEEDBACK_EASE, FEEDBACK_VALUE, FEEDBACK_FACTORS, type FeedbackFeature, type FeatureFeedback } from '../../lib/laboratory';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import './laboratory-materials.css';

export default function FeatureFeedback({ feature, contextId = null, phase, disabled = false }: {
  feature: FeedbackFeature; contextId?: string | null; phase: FeatureFeedback['phase']; disabled?: boolean;
}) {
  const [ease, setEase] = useState('');
  const [value, setValue] = useState('');
  const [factors, setFactors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef({ key: '', id: '' });
  useUnsavedChanges(false, busy);
  async function submit() {
    const payload = { feature, contextId, phase, ease, value, factors };
    const key = JSON.stringify(payload);
    if (pending.current.key !== key) pending.current = { key, id: `lab-feedback-${crypto.randomUUID()}` };
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/laboratory-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: pending.current.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '反馈暂时无法保存，请重试。');
      setSaved(true);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <details className="lab-feedback">
    <summary>反馈这次体验 <span>约 15 秒 · 选填</span></summary>
    {saved ? <p className="lab-feedback-saved" role="status">反馈已保存，感谢你记录这次体验。</p> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy || disabled}><legend>这次用起来如何？</legend><div className="lab-feedback-options">{FEEDBACK_EASE.map(item => <label key={item.id} className={ease === item.id ? 'selected' : ''}><input type="radio" name={`ease-${feature}`} value={item.id} checked={ease === item.id} onChange={() => setEase(item.id)}/>{item.label}</label>)}</div></fieldset>
      <fieldset disabled={busy || disabled}><legend>对这次复习有帮助吗？</legend><div className="lab-feedback-options">{FEEDBACK_VALUE.map(item => <label key={item.id} className={value === item.id ? 'selected' : ''}><input type="radio" name={`value-${feature}`} value={item.id} checked={value === item.id} onChange={() => setValue(item.id)}/>{item.label}</label>)}</div></fieldset>
      <fieldset disabled={busy || disabled}><legend>主要感受 <span>可跳过，最多选两项</span></legend><div className="lab-feedback-options">{FEEDBACK_FACTORS[feature].map(item => <label key={item.id} className={factors.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={factors.includes(item.id)} disabled={!factors.includes(item.id) && factors.length >= 2} onChange={event => setFactors(previous => event.target.checked ? [...previous, item.id] : previous.filter(value => value !== item.id))}/>{item.label}</label>)}</div></fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button outline small" disabled={!ease || !value || busy || disabled}>{busy ? '正在保存…' : '提交反馈'}</button>
    </form>}
  </details>;
}
