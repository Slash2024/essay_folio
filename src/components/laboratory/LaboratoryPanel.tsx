import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, ClipboardList, NotebookPen, BookOpen } from 'lucide-react';
import ShortReview from './ShortReview';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import './short-review.css';
const MaterialPack = lazy(() => import('./MaterialPack'));
const TransferReview = lazy(() => import('./TransferReview'));
const ExperienceSurvey = lazy(() => import('./ExperienceSurvey'));
type View = 'home' | 'short' | 'survey' | 'materials' | 'transfer';

export default function LaboratoryPanel({ onOpenRecord }: { onOpenRecord: (writingId: string, reviewId: string, noteId: string) => void }) {
  const [view, setView] = useState<View>('home');
  const [materialSession, setMaterialSession] = useState<string>();
  function enter(next: View) { setView(next); window.scrollTo({ top: 0 }); }
  function returnHome() { if (confirmUnsavedNavigation()) enter('home'); }
  if (view !== 'home') return <>
    <nav className="lab-experiment-nav" aria-label="实验室栏目导航"><button className="button outline" onClick={returnHome}><ArrowLeft size={17}/>返回实验室入口</button><span>{({ short: '短复习单', materials: '复习材料包', transfer: '换语境复测', survey: '产品体验问卷' })[view]}</span></nav>
    {view === 'short' && <ShortReview onOpenMaterials={id => { setMaterialSession(id); enter('materials'); }}/>}
    {view === 'materials' && <Suspense fallback={<p>正在打开复习材料包…</p>}><MaterialPack initialSessionId={materialSession} onOpenRecord={onOpenRecord}/></Suspense>}
    {view === 'transfer' && <Suspense fallback={<p>正在打开换语境复测…</p>}><TransferReview/></Suspense>}
    {view === 'survey' && <Suspense fallback={<p>正在读取问卷…</p>}><ExperienceSurvey/></Suspense>}
  </>;
  return <div className="lab-experiments">
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><NotebookPen size={20}/>短复习单 <span className="lab-beta">BETA</span></h2><span className="caption">1–3 句 · 约 5 分钟</span></div><p>从已有批阅里选几句话，独立修改后再对照，把这次复习做完。</p><button className="button primary" onClick={() => enter('short')}>进入短复习</button></section>
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><BookOpen size={20}/>复习材料包 <span className="lab-beta">BETA</span></h2><span className="caption">原句 · 批注 · 笔记 · 作答</span></div><p>围绕一个问题，把复习需要的材料整理在一起，保存后随时回看。</p><button className="button primary" onClick={() => { setMaterialSession(undefined); enter('materials'); }}>进入材料包</button></section>
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><ArrowRightLeft size={20}/>换语境复测 <span className="lab-beta">BETA</span></h2><span className="caption">旧问题 · 另一道题</span></div><p>把学过的问题带到另一道题里，先独立修改，再查看参考和记录自评。</p><button className="button primary" onClick={() => enter('transfer')}>进入换语境复测</button></section>
    <section className="panel lab-experiment"><h2><ClipboardList size={20}/>产品体验问卷</h2><p className="muted">填写或回看已提交的七道客观题，记录实际使用体验。</p><button className="button outline" onClick={() => enter('survey')}>打开体验问卷</button></section>
  </div>;
}
