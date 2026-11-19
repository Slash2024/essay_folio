import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowRightLeft, ClipboardList, NotebookPen, BookOpen, BookOpenCheck, Map as MapIcon, Layers, ChevronDown, CircleHelp, ClipboardCheck } from 'lucide-react';
import ShortReview from './ShortReview';
import { guideForView } from '../../lib/laboratory-help';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import { LAB_GROUPS, LAB_TOOLS, laboratoryGroup } from '../../lib/laboratory-catalog';
import type { LabRoute, LabQueueItem } from '../../lib/laboratory-navigation';
import './short-review.css';
import './laboratory-hub.css';
const MaterialPack = lazy(() => import('./MaterialPack'));
const TransferReview = lazy(() => import('./TransferReview'));
const CallMap = lazy(() => import('./CallMap'));
const RecallCards = lazy(() => import('./RecallCards'));
const TemplateTraining = lazy(() => import('./TemplateTraining'));
const ExpressionQuiz = lazy(() => import('./ExpressionQuiz'));
const ExperienceSurvey = lazy(() => import('./ExperienceSurvey'));
const TOOL_ICONS = { short: NotebookPen, materials: BookOpen, transfer: ArrowRightLeft, callmap: MapIcon, recall: Layers, template: BookOpenCheck, quiz: ClipboardCheck };
export default function LaboratoryPanel({ onOpenRecord, initialView }: { initialView?: LabRoute['view']; onOpenRecord: (writingId: string, reviewId: string, noteId: string) => void }) {
  const [route, setRoute] = useState<LabRoute>({ view: initialView ?? 'home' });
  const [trail, setTrail] = useState<LabRoute[]>([]);
  const [queue, setQueue] = useState<LabQueueItem[]>(), [queueError, setQueueError] = useState('');
  const [retry, setRetry] = useState(0), [expanded, setExpanded] = useState(false);
  const activeRecord = useRef<string>();
  useEffect(() => {
    if (route.view !== 'home') return;
    const controller = new AbortController(); setQueue(undefined); setQueueError('');
    fetch('/api/laboratory-home', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error || '待继续记录暂时无法读取。');
      if (!controller.signal.aborted) setQueue(value.items);
    }).catch(cause => { if (!controller.signal.aborted) setQueueError((cause as Error).message); });
    return () => controller.abort();
  }, [route.view, retry]);
  function currentRoute(): LabRoute {
    const id = activeRecord.current;
    if (route.view === 'callmap') return { view: 'callmap' };
    if (!id) return route;
    if (route.view === 'short') return { view: 'short', entry: { sessionId: id } };
    if (route.view === 'materials') return { view: 'materials', entry: { packId: id } };
    if (route.view === 'quiz' || route.view === 'recall' || route.view === 'template' || route.view === 'transfer') return { view: route.view, sessionId: id };
    return route;
  }
  function enter(next: LabRoute, origin = currentRoute()) {
    if (!confirmUnsavedNavigation()) return;
    setTrail(previous => next.view === 'home' ? [] : [...previous, origin].slice(-12));
    activeRecord.current = undefined; setExpanded(false); setRoute(next); window.scrollTo({ top: 0 });
  }
  function previous() {
    if (!trail.length || !confirmUnsavedNavigation()) return;
    const next = trail.at(-1)!; setTrail(old => old.slice(0, -1)); activeRecord.current = undefined; setRoute(next); window.scrollTo({ top: 0 });
  }
  const markRecord = (id?: string) => { activeRecord.current = id; };
  const view = route.view, group = laboratoryGroup(view), guide = guideForView(view);
  const title = view === 'survey' ? '产品体验问卷' : view === 'home' ? '实验室' : LAB_TOOLS[view].title;
  if (view !== 'home') return <div className="lab-workspace">
    <nav className="lab-experiment-nav" aria-label="实验室栏目导航">
      <div className="lab-nav-top"><button className="button outline small" onClick={() => enter({ view: 'home' })}><ArrowLeft size={16}/>返回实验室入口</button>{trail.at(-1)?.view && trail.at(-1)!.view !== 'home' && <button className="text-button lab-nav-previous" onClick={previous}>返回上一步</button>}<span className="lab-nav-context">{group?.label ?? title}</span>{guide && <a className="lab-help-entry" href={guide.href} target="_blank" rel="noopener noreferrer" aria-label={`查看${guide.title}使用说明（新标签页）`}><CircleHelp size={15}/>使用说明</a>}</div>
      {group && <div className="lab-related-tools" role="group" aria-label={`${group.label}项目`}>{group.tools.map((key, index) => <button key={key} disabled={key === view} aria-current={key === view ? 'page' : undefined} onClick={() => enter({ view: key })}><small>{index + 1}</small>{LAB_TOOLS[key].title}</button>)}</div>}
    </nav>
    <Suspense fallback={<p className="muted" role="status">正在打开{title}…</p>}>
      {route.view === 'short' && <ShortReview key={JSON.stringify(route)} entry={route.entry} onSessionChange={markRecord} onOpenMaterials={id => enter({ view: 'materials', entry: { sourceType: 'session', sourceId: id } }, { view: 'short', entry: { sessionId: id } })}/>}
      {route.view === 'materials' && <MaterialPack key={JSON.stringify(route)} entry={route.entry} onPackChange={markRecord} onOpenRecord={onOpenRecord} onOpenTransfer={entry => enter({ view: 'transfer', entry })}/>}
      {route.view === 'transfer' && <TransferReview key={JSON.stringify(route)} entry={route.entry} sessionId={route.sessionId} onSessionChange={markRecord} onOpenMaterials={entry => enter({ view: 'materials', entry })}/>}
      {route.view === 'quiz' && <ExpressionQuiz key={JSON.stringify(route)} sessionId={route.sessionId} onSessionChange={markRecord}/>}
      {route.view === 'template' && <TemplateTraining key={JSON.stringify(route)} sessionId={route.sessionId} initialExpressionId={route.expressionId} onSessionChange={markRecord}/>}
      {route.view === 'callmap' && <CallMap key={route.taskId ?? 'all'} taskId={route.taskId} onOpenRecall={taskId => enter({ view: 'recall', taskId })} onOpenTemplate={expressionId => enter({ view: 'template', expressionId })}/>}
      {route.view === 'recall' && <RecallCards key={JSON.stringify(route)} sessionId={route.sessionId} taskId={route.taskId} onSessionChange={markRecord} onOpenMap={taskId => enter({ view: 'callmap', taskId })} onOpenTemplate={expressionId => enter({ view: 'template', expressionId })}/>}
      {view === 'survey' && <ExperienceSurvey/>}
    </Suspense>
  </div>;
  const visibleQueue = expanded ? queue : queue?.slice(0, 3);
  return <div className="lab-hub">
    <p className="lab-hub-intro">选一个目标开始。每个工具都可单独进入，也可以按下面的顺序衔接。</p>
    <div className="lab-pathways">{LAB_GROUPS.map(path => <section className="panel lab-pathway" key={path.id} aria-labelledby={`lab-path-${path.id}`}><div className="lab-pathway-heading"><span>{path.label}</span><h2 id={`lab-path-${path.id}`}>{path.title}</h2><p>{path.description}</p></div><ol className="lab-tool-list">{path.tools.map((key, index) => { const tool = LAB_TOOLS[key], Icon = TOOL_ICONS[key], help = guideForView(key); return <li key={key}><button className={`lab-tool-entry ${key === 'short' || key === 'quiz' || key === 'recall' ? 'lab-tool-featured' : ''}`} aria-label={tool.action} onClick={() => enter({ view: key })}><span className="lab-tool-number">{index + 1}</span><span className="lab-tool-copy"><small>{tool.role}</small><strong><Icon size={17}/>{tool.title}<span className="lab-beta">BETA</span></strong><span>{tool.description}</span></span><ArrowRight className="lab-tool-arrow" size={17}/></button>{help && <a className="lab-help-card-link" href={help.href} target="_blank" rel="noopener noreferrer" aria-label={`查看${help.title}使用说明（新标签页）`}><CircleHelp size={13}/>如何使用</a>}</li>; })}</ol></section>)}</div>
    <section className={`panel lab-continue ${!queue?.length ? 'lab-continue-compact' : ''}`} aria-labelledby="lab-continue-title"><div className="lab-continue-heading"><h2 id="lab-continue-title">待继续</h2><span className="caption">{queue?.length ? `${queue.length} 项 · 未完成或仍需再看` : '从上次停下的地方继续'}</span></div>
      {queueError ? <p className="error" role="alert">{queueError} <button className="text-button" onClick={() => setRetry(value => value + 1)}>重试</button></p> : !queue ? <p className="muted" role="status">正在读取复习进度…</p> : queue.length ? <><div className="lab-continue-list">{visibleQueue?.map(item => <button className="lab-continue-item" key={item.key} onClick={() => enter(item.route)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>{item.status === 'unfinished' ? '继续 →' : '再练 →'}</b></button>)}</div>{queue.length > 3 && <button className="text-button lab-queue-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起列表' : `展开其余 ${queue.length - 3} 项`}<ChevronDown size={15}/></button>}</> : <p className="muted">当前没有待继续的记录。</p>}
    </section>
    <section className="lab-survey-entry" aria-label="整体体验反馈"><ClipboardList size={19}/><div><strong>产品体验问卷</strong><p>记录整体使用体验；单项体验可在各工具底部反馈。</p></div><button className="button outline small" onClick={() => enter({ view: 'survey' })}>打开体验问卷</button><a className="lab-help-entry" href={guideForView('survey')!.href} target="_blank" rel="noopener noreferrer" aria-label="查看产品体验问卷使用说明（新标签页）">填写说明</a></section>
  </div>;
}
