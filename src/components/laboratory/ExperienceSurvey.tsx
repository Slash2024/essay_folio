import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { dateLabel } from '../../lib/client';
import { surveyQuestions, type SurveyAnswers, type SurveyResponse } from '../../lib/experience-survey';
import './experience-survey.css';

async function requestSurvey(answers?: SurveyAnswers, signal?: AbortSignal) {
  const request = await fetch('/api/experience-survey', answers ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(answers),
  } : { cache: 'no-store', signal });
  const result = await request.json() as { response: SurveyResponse | null; error?: string };
  if (!request.ok) throw new Error(result.error || '问卷服务暂不可用，请重试。');
  return result.response;
}

export default function ExperienceSurvey() {
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<SurveyResponse | null>();
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [step, setStep] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const total = surveyQuestions.length;
  const question = surveyQuestions[step];
  const currentAnswers = saved?.answers ?? answers;
  const complete = question?.groups.every(({ id }) => currentAnswers[id]?.length);
  useUnsavedChanges(!saved && Object.values(answers).some(choices => choices.length > 0), saving);

  useEffect(() => {
    const controller = new AbortController();
    requestSurvey(undefined, controller.signal).then(setSaved).catch(cause => {
      if (!controller.signal.aborted) setError((cause as Error).message);
    });
    return () => controller.abort();
  }, [attempt]);

  function move(next: number) {
    setError('');
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const result = await requestSurvey(answers);
      if (!result) throw new Error('没有收到保存确认，请重试。');
      setSaved(result);
      move(-1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel laboratory-survey" aria-labelledby="experience-survey-title">
    <div className="panel-heading">
      <h2 id="experience-survey-title"><ClipboardList/>产品体验问卷</h2>
      <span className="caption">7 道选择题 · 约 4–5 分钟</span>
    </div>
    {saved === undefined ? <>
      {error ? <>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="button outline" onClick={() => { setError(''); setAttempt(attempt + 1); }}>重新读取</button>
      </> : <p className="muted" role="status">正在读取答卷…</p>}
    </> : !question ? <>
      {saved ? <>
        <h3 ref={heading} tabIndex={-1} className="laboratory-survey-title"><CheckCircle2 size={20}/>答卷已保存</h3>
        <p className="muted">提交于 {dateLabel(saved.submittedAt)}，可在此查看所选答案。</p>
      </> : <>
        <p>请回想最近 14 天内的 3 次 Essay Folio 练习，少于 3 次就按实际次数回答。写了几句、只处理批阅，或中途停下，也算一次。</p>
        <p className="muted">完成后提交一份答卷。提交前可返回修改，提交后可随时在实验室查看。</p>
      </>}
      <button type="button" className="button primary" onClick={() => move(0)}>{saved ? '查看答卷' : '开始答题'}</button>
    </> : <>
      <p className="caption">第 {step + 1} / {total} 题 · {saved ? '已提交' : question.groups.some(group => group.multiple) ? '多选' : '单选'}</p>
      <h3 ref={heading} tabIndex={-1} className="laboratory-survey-title">{question.title}</h3>
      {question.hint && <p className="muted">{question.hint}</p>}
      {question.groups.map(({ id, label, options, multiple, limit, exclusiveFrom = Infinity }) => {
        const selected = currentAnswers[id] ?? [];
        return <fieldset key={id} className="laboratory-survey-group" disabled={saving || !!saved}>
          <legend className={label ? undefined : 'sr-only'}>{label ?? question.title}</legend>
          <div className={'laboratory-survey-options' + (step === 2 ? ' laboratory-survey-matrix' : '')}>
            {options.map((option, index) => {
              const checked = selected.includes(index);
              const atLimit = limit !== undefined && selected.filter(choice => choice < exclusiveFrom).length >= limit;
              return <label key={option} className={checked ? 'is-selected' : undefined}>
                <input type={multiple ? 'checkbox' : 'radio'} name={id} checked={checked}
                  disabled={!checked && index < exclusiveFrom && atLimit}
                  onChange={() => setAnswers(previous => {
                    const current = previous[id] ?? [];
                    if (!multiple || index >= exclusiveFrom) return { ...previous, [id]: checked && multiple ? [] : [index] };
                    const ordinary = current.filter(choice => choice < exclusiveFrom);
                    return { ...previous, [id]: checked ? ordinary.filter(choice => choice !== index) : [...ordinary, index] };
                  })}/>
                <span>{option}</span>
              </label>;
            })}
          </div>
        </fieldset>;
      })}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="laboratory-survey-actions">
        <button type="button" className="button outline" disabled={saving || (step === 0 && !saved)} onClick={() => move(step - 1)}>
          {step === 0 ? (saved ? '返回问卷首页' : '上一题') : '上一题'}
        </button>
        {step < total - 1
          ? <button type="button" className="button primary" disabled={!complete} onClick={() => move(step + 1)}>下一题</button>
          : saved
            ? <button type="button" className="button primary" onClick={() => move(-1)}>返回问卷首页</button>
            : <button type="button" className="button primary" disabled={!complete || saving} onClick={submit}>{saving ? '正在保存…' : '提交答卷'}</button>}
      </div>
    </>}
  </section>;
}
