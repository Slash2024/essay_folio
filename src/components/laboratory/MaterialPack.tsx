import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2 } from 'lucide-react';
import type { MaterialOverview, MaterialSource, MaterialPack as SavedPack } from '../../lib/laboratory';
import { dateLabel } from '../../lib/client';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import FeatureFeedback from './FeatureFeedback';
import './laboratory-materials.css';

async function request<T>(query = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/laboratory-materials${query}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '材料暂时无法读取或保存。');
  return result;
}
export default function MaterialPack({ onExit, initialSessionId, onOpenRecord }: {
  onExit: () => void; initialSessionId?: string;
  onOpenRecord: (writingId: string, reviewId: string, noteId: string) => void;
}) {
  const [overview, setOverview] = useState<MaterialOverview>();
  const [selection, setSelection] = useState(initialSessionId ? `session:${initialSessionId}` : '');
  const [source, setSource] = useState<MaterialSource>();
  const [focusId, setFocusId] = useState('');
  const [pack, setPack] = useState<SavedPack>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef({ key: '', id: '' });
  useUnsavedChanges(false, busy);
  useEffect(() => {
    const controller = new AbortController();
    request<MaterialOverview>('', undefined, controller.signal).then(setOverview).catch(cause => {
      if (!controller.signal.aborted) setError((cause as Error).message);
    });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!selection || pack) return;
    const controller = new AbortController();
    const [type, id] = selection.split(':');
    setSource(undefined); setFocusId(''); setLoading(true); setError('');
    request<{ source: MaterialSource }>(`?type=${type}&source=${encodeURIComponent(id)}`, undefined, controller.signal)
      .then(value => { setSource(value.source); setFocusId(value.source.items[0]?.noteId ?? ''); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selection, reload, pack]);
  const index = source?.items.findIndex(item => item.noteId === focusId) ?? -1;
  const item = pack?.item ?? source?.items[index];
  const attempt = pack ? pack.attempt : source?.attempts.find(item => item.index === index);
  const result = pack ? pack.result : source?.results.find(item => item.index === index);
  const title = pack?.title ?? source?.title ?? '';
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('');
    try { await operation(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  function save() {
    if (!source || !item) return;
    const key = JSON.stringify([source.signature, focusId]);
    if (pending.current.key !== key) pending.current = { key, id: `lab-pack-${crypto.randomUUID()}` };
    void run(async () => {
      const value = await request<{ pack: SavedPack }>('', { id: pending.current.id, sourceType: source.sourceType, sourceId: source.sourceId, signature: source.signature, noteId: focusId });
      setPack(value.pack); setReload(value => value + 1);
    });
  }
  function leave() { if (confirmUnsavedNavigation()) onExit(); }
  return <section className="panel lab-materials" aria-labelledby="lab-materials-title" aria-busy={busy}>
    <div className="lab-short-header"><h2 id="lab-materials-title"><BookOpen size={20}/>复习材料包 <span className="lab-beta">BETA</span></h2><button className="text-button" disabled={busy} onClick={leave}><ArrowLeft size={15}/>返回实验室</button></div>
    <p className="muted">围绕一个问题，把原句、背景、批注、相关笔记和已有作答放在一起。</p>
    {error && <p className="error" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => { setError(''); setReload(value => value + 1); }}>重新读取</button></p>}
    {!pack && <>
      <label className="lab-short-select">选择材料来源<select aria-label="材料包来源" value={selection} disabled={busy} onChange={event => setSelection(event.target.value)}><option value="">请选择一份短复习记录或作文批阅</option><optgroup label="短复习记录 · 含已有作答">{overview?.sessions.map(value => <option key={value.id} value={`session:${value.id}`}>{value.title} · {dateLabel(value.createdAt)}</option>)}</optgroup><optgroup label="作文批阅">{overview?.sources.map(value => <option key={value.reviewId} value={`review:${value.reviewId}`}>{value.title} · {dateLabel(value.createdAt)}</option>)}</optgroup></select></label>
      {!overview && !error && <p role="status">正在读取材料列表…</p>}
      {loading && <p role="status">正在整理关联材料…</p>}
      {source && !loading && (source.items.length ? <label className="lab-short-select">这次聚焦哪一句<select aria-label="材料包聚焦句子" value={focusId} disabled={busy} onChange={event => setFocusId(event.target.value)}>{source.items.map((value, index) => <option key={value.noteId} value={value.noteId}>{index + 1}. {value.original}</option>)}</select></label> : <p className="muted">这份材料暂没有可核对的纠错条目，请选择其他来源。</p>)}
    </>}
    {item && <article className="lab-material-content" key={`content-${pack?.id ?? `${selection}:${focusId}`}`}>
      <div className="lab-material-meta"><span>{title}</span>{pack && <span className="lab-material-saved" role="status"><CheckCircle2 size={15}/>已保存 · {dateLabel(pack.createdAt)}</span>}</div>
      <p className="caption">来源：{(pack?.sourceType ?? source?.sourceType) === 'session' ? '短复习记录中的材料与作答' : pack ? '保存时的作文批阅' : '当前作文批阅'}</p>
      <div className="lab-material-original"><h3>原句</h3><p className="english">{item.original}</p></div>
      <details className="lab-material-context" open><summary>段落背景</summary><p className="english">{item.context}</p></details>
      <details className="lab-material-context"><summary>题目要求与题图</summary><p className="english">{pack?.directions ?? source?.directions}</p>{(pack?.images ?? source?.images ?? []).map((image, index) => <img key={image} src={image} alt={`原题图 ${index + 1}`} loading="lazy"/>)}</details>
      <div className="lab-material-attempt"><h3>我的独立作答</h3>{attempt ? <><p className="english">{attempt.unable ? '本次选择了暂时不会' : attempt.answer}</p><p className="caption">{dateLabel(attempt.createdAt)} · {result ? result.assessment === 'understood' ? '自评已理解' : '仍需再看' : '尚未自评'}</p></> : <p className="muted">从短复习记录选材，可以把自己的作答一同整理进来。</p>}</div>
      <details className="lab-material-reference"><summary>展开批注与相关笔记</summary><div className="lab-material-pair"><div><h3>参考改法</h3><p className="english">{item.reference}</p><h3>批注说明</h3><p>{item.explanation || '这条批注没有附带说明。'}</p></div><div><h3>相关个人笔记</h3>{item.personalNotes.length ? item.personalNotes.map((note, index) => <p key={index}>{note}</p>) : <p className="muted">这句话暂没有关联的个人笔记。</p>}</div></div></details>
      <div className="lab-material-actions"><button className="text-button" disabled={busy} onClick={() => onOpenRecord(pack?.sourceWritingId ?? source!.writingId, pack?.reviewId ?? source!.reviewId, item.noteId)}>回到原批注<ArrowUpRight size={15}/></button>{pack ? <button className="button outline" disabled={busy} onClick={() => { setPack(undefined); setSource(undefined); setSelection(''); setFocusId(''); }}>返回选材</button> : <button className="button primary" disabled={busy} onClick={save}>{busy ? '正在保存…' : '保存材料包'}</button>}</div>
      {pack && <p className="caption">保存内容为当时的材料副本。可从来源重新整理，保留不同阶段的复习记录。</p>}
    </article>}
    {!pack && !!overview?.packs.length && <details className="lab-material-history"><summary>已保存的材料包 · {overview.packs.length} 份</summary>{overview.packs.map(value => <button className="lab-short-history-row" key={value.id} disabled={busy} onClick={() => void run(async () => { const value2 = await request<{ pack: SavedPack }>(`?pack=${encodeURIComponent(value.id)}`); setPack(value2.pack); })}><span>{value.title}<small>{dateLabel(value.createdAt)}</small></span><span>打开 →</span></button>)}</details>}
    <FeatureFeedback key={`feedback-${pack?.id ?? `${selection}-${focusId}`}`} feature="materials" contextId={pack?.id} phase={item ? 'reading' : 'selection'} disabled={busy}/>
  </section>;
}
