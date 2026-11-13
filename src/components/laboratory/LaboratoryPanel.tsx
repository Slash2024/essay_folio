import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ClipboardList, NotebookPen, BookOpen } from 'lucide-react';
import ShortReview from './ShortReview';
import { confirmUnsavedNavigation } from '../../lib/navigation';
import './short-review.css';
const MaterialPack = lazy(() => import('./MaterialPack'));
const ExperienceSurvey = lazy(() => import('./ExperienceSurvey'));

export default function LaboratoryPanel({ onOpenRecord }: { onOpenRecord: (writingId: string, reviewId: string, noteId: string) => void }) {
  const [view, setView] = useState<'home' | 'short' | 'survey' | 'materials'>('home');
  const [materialSession, setMaterialSession] = useState<string>();
  if (view === 'short') return <ShortReview onExit={() => setView('home')} onOpenMaterials={id => { setMaterialSession(id); setView('materials'); }}/>;
  if (view === 'materials') return <Suspense fallback={<p>正在打开复习材料包…</p>}><MaterialPack initialSessionId={materialSession} onExit={() => setView('home')} onOpenRecord={onOpenRecord}/></Suspense>;
  if (view === 'survey') return <><button className="text-button lab-return" onClick={() => {
    if (confirmUnsavedNavigation()) setView('home');
  }}><ArrowLeft size={15}/>返回实验室</button><Suspense fallback={<p>正在读取问卷…</p>}><ExperienceSurvey/></Suspense></>;
  return <div className="lab-experiments">
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><NotebookPen size={20}/>短复习单 <span className="lab-beta">BETA</span></h2><span className="caption">1–3 句 · 约 5 分钟</span></div><p>从已有批阅里选几句话，独立修改后再对照，把这次复习做完。</p><button className="button primary" onClick={() => setView('short')}>进入短复习</button></section>
    <section className="panel lab-experiment"><div className="lab-short-header"><h2><BookOpen size={20}/>复习材料包 <span className="lab-beta">BETA</span></h2><span className="caption">原句 · 批注 · 笔记 · 作答</span></div><p>围绕一个问题，把复习需要的材料整理在一起，保存后随时回看。</p><button className="button primary" onClick={() => { setMaterialSession(undefined); setView('materials'); }}>进入材料包</button></section>
    <section className="panel lab-experiment"><h2><ClipboardList size={20}/>产品体验问卷</h2><p className="muted">填写或回看已提交的七道客观题，记录实际使用体验。</p><button className="button outline" onClick={() => setView('survey')}>打开体验问卷</button></section>
  </div>;
}
