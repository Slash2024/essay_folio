import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, ClipboardList, NotebookPen, BookOpen, BookOpenCheck } from 'lucide-react';
import ShortReview from './ShortReview';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import type { LabRoute, LabQueueItem } from '../../lib/laboratory-navigation';
import './short-review.css';
const MaterialPack = lazy(() => import('./MaterialPack'));
const TransferReview = lazy(() => import('./TransferReview'));
const TemplateTraining = lazy(() => import('./TemplateTraining'));
const ExperienceSurvey = lazy(() => import('./ExperienceSurvey'));

export default function LaboratoryPanel({ onOpenRecord }: { onOpenRecord: (writingId: string, reviewId: string, noteId: string) => void }) {
  const [route, setRoute] = useState<LabRoute>({ view: 'home' });
  const [queue, setQueue] = useState<LabQueueItem[]>();
  const [queueError, setQueueError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (route.view !== 'home') return;
    const controller = new AbortController();
    setQueue(undefined); setQueueError('');
    fetch('/api/laboratory-home', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '待继续记录暂时无法读取。');
      if (!controller.signal.aborted) setQueue(value.items);
    }).catch(cause => { if (!controller.signal.aborted) setQueueError((cause as Error).message); });
    return () => controller.abort();
  }, [route.view, retry]);
  function enter(next: LabRoute) {
    if (!confirmUnsavedNavigation()) return;
    setRoute(next); window.scrollTo({ top: 0 });
  }
  const view = route.view;
  if (view !== 'home') return <>
    <nav className="lab-experiment-nav" aria-label="实验室栏目导航"><button className="button outline" onClick={() => enter({ view: 'home' })}><ArrowLeft size={17}/>返回实验室入口</button><span>{({ short: '短复习单', materials: '复习材料包', transfer: '换语境复测', template: '模板迁移训练', survey: '产品体验问卷' })[view]}</span></nav>
    {route.view === 'short' && <ShortReview key={JSON.stringify(route)} entry={route.entry} onOpenMaterials={id => enter({ view: 'materials', entry: { sourceType: 'session', sourceId: id } })}/>}
    {route.view === 'materials' && <Suspense fallback={<p>正在打开复习材料包…</p>}><MaterialPack key={JSON.stringify(route)} entry={route.entry} onOpenRecord={onOpenRecord} onOpenTransfer={entry => enter({ view: 'transfer', entry })}/></Suspense>}
    {route.view === 'transfer' && <Suspense fallback={<p>正在打开换语境复测…</p>}><TransferReview key={JSON.stringify(route)} entry={route.entry} sessionId={route.sessionId} onOpenMaterials={entry => enter({ view: 'materials', entry })}/></Suspense>}
    {route.view === 'template' && <Suspense fallback={<p>正在打开模板迁移训练…</p>}><TemplateTraining key={route.sessionId ?? 'new'} sessionId={route.sessionId}/></Suspense>}
    {view === 'survey' && <Suspense fallback={<p>正在读取问卷…</p>}><ExperienceSurvey/></Suspense>}
  </>;
  return <div className="lab-experiments">
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><NotebookPen size={20}/>短复习单 <span className="lab-beta">BETA</span></h2><span className="caption">1–3 句 · 约 5 分钟</span></div><p>从已有批阅里选几句话，独立修改后再对照，把这次复习做完。</p><button className="button primary" onClick={() => enter({ view: 'short' })}>进入短复习</button></section>
    <section className="panel lab-experiment" aria-labelledby="lab-continue-title"><div className="lab-short-header"><h2 id="lab-continue-title">待继续</h2><span className="caption">未完成 · 仍需再看</span></div>
      {queueError ? <p className="error" role="alert">{queueError}<button className="text-button" onClick={() => setRetry(value => value + 1)}>重试</button></p> : !queue ? <p className="muted" role="status">正在读取复习进度…</p> : queue.length ? <div className="lab-continue-list">{queue.map(item => <button className="lab-continue-item" key={item.key} onClick={() => enter(item.route)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>{item.status === 'unfinished' ? '继续 →' : '再练 →'}</b></button>)}</div> : <p className="muted">当前没有待继续的记录，可以从下方选择一次新的练习。</p>}
    </section>

    <section className="panel lab-experiment"><div className="lab-short-header"><h2><BookOpen size={20}/>复习材料包 <span className="lab-beta">BETA</span></h2><span className="caption">原句 · 批注 · 笔记 · 作答</span></div><p>围绕一个问题，把复习需要的材料整理在一起，保存后随时回看。</p><button className="button primary" onClick={() => enter({ view: 'materials' })}>进入材料包</button></section>
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><ArrowRightLeft size={20}/>换语境复测 <span className="lab-beta">BETA</span></h2><span className="caption">旧问题 · 另一道题</span></div><p>把学过的问题带到另一道题里，先独立修改，再查看参考和记录自评。</p><button className="button primary" onClick={() => enter({ view: 'transfer' })}>进入换语境复测</button></section>
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><BookOpenCheck size={20}/>模板迁移训练 <span className="lab-beta">BETA</span></h2><span className="caption">一条表达 · 三题适配</span></div><p>判断熟悉句式在不同题目里能否使用，写出关键表达，再逐项核对主题、指代、展开和任务。</p><button className="button primary" onClick={() => enter({ view: 'template' })}>进入模板迁移训练</button></section>
    <section className="panel lab-experiment"><h2><ClipboardList size={20}/>产品体验问卷</h2><p className="muted">填写或回看已提交的七道客观题，记录实际使用体验。</p><button className="button outline" onClick={() => enter({ view: 'survey' })}>打开体验问卷</button></section>
  </div>;
}
