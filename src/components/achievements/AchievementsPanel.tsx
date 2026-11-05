import {milestoneDisplay,type EarnedMilestone} from '../../lib/achievement-types';
import {MilestoneArt} from './MilestoneArt';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, dateLabel } from '../../lib/client';
import { questionCategories, questionYearLabel, type Question } from '../../lib/folio';
import { PRACTICE_GROUPS, practiceGroup, practiceState, practiceCategories, summarizePractice, categoryPractice, type PracticeGroup, type PracticeProgress, type QuestionProgress } from '../../lib/practice-progress';
import { AchievementArt, AchievementMedal } from './AchievementArt';
import './achievements.css';

function MilestoneCard({milestone:m}:{milestone:EarnedMilestone}) {
  return <article className="achievement-badge" data-milestone={m.id}><MilestoneArt id={m.id}/><small>{m.group}</small><h4>{m.title}</h4><span>已达成</span><p>{m.detail}</p></article>;
}
const stateLabels = {unstarted:'未开始',draft:'草稿中',practiced:'已练习',reviewed:'已批阅'};
function ProgressBar({done,total,label}:{done:number;total:number;label:string}) {
  return <div className="achievement-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done} aria-valuetext={`${done} / ${total} 道题`}><span style={{width:`${total ? done/total*100 : 0}%`}}/></div>;
}
export default function AchievementsPanel({questions,initialScope,onClose,onStart,onOpenRecord,onShowRecords}:{questions:Question[];initialScope:string;onClose:()=>void;onStart:(q:Question)=>void;onOpenRecord:(id:string)=>void;onShowRecords:(q:Question)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),detail=useRef<HTMLDivElement>(null);
  const [snapshot,setSnapshot]=useState<PracticeProgress|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [scope,setScope]=useState<PracticeGroup>(PRACTICE_GROUPS.some(g=>g.id===initialScope)?initialScope as PracticeGroup:'one-large');
  const [mode,setMode]=useState<'year'|'category'>('year'),[category,setCategory]=useState(''),[selected,setSelected]=useState('');
  useEffect(()=>{
    const el=dialog.current!,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    el.showModal();document.body.style.overflow='hidden';
    return()=>{el.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    api<PracticeProgress>('practiceProgress').then(data=>{if(active)setSnapshot(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[reload]);
  const progress=useMemo(()=>new Map((snapshot?.questions||[]).map(p=>[p.questionId,p])),[snapshot]);
  const summary=summarizePractice(questions,progress);
  const pools=useMemo(()=>PRACTICE_GROUPS.map(group=>({...group,questions:questions.filter(q=>practiceGroup(q)===group.id)})),[questions]);
  const pool=pools.find(g=>g.id===scope)!;
  const poolSummary=summarizePractice(pool.questions,progress);
  const milestones=snapshot?.milestones||[];
  const {featured,earlier}=milestoneDisplay(milestones);
  const ordered=[...pool.questions].sort((a,b)=>(a.year??Infinity)-(b.year??Infinity)||a.id.localeCompare(b.id));
  const visible=mode==='category'&&category?ordered.filter(q=>questionCategories(q).includes(category)):ordered;
  const selectedQuestion=visible.find(q=>q.id===selected);
  const selectedProgress=progress.get(selected);
  const selectedState=practiceState(selectedProgress);
  const next=ordered.find(q=>!progress.get(q.id)?.submittedCount&&progress.get(q.id)?.draftCount)||ordered.find(q=>!progress.get(q.id)?.submittedCount);
  function chooseQuestion(id:string){setSelected(id);}
  function changeScope(next:PracticeGroup){setScope(next);setCategory('');setSelected('');}
  function continueNext(){if(!next)return;setCategory('');setSelected(next.id);requestAnimationFrame(()=>detail.current?.scrollIntoView({block:'nearest',behavior:'auto'}));}
  function openLatest(p:QuestionProgress){const id=p.latestReviewedId||p.latestSubmittedId;if(id)onOpenRecord(id);}
  return <dialog ref={dialog} className="achievement-dialog" aria-labelledby="achievement-title" aria-describedby="achievement-subtitle" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <header className="achievement-header"><div className="achievement-title"><AchievementMedal/><div><h2 id="achievement-title">写作成就</h2><p id="achievement-subtitle">记录每一道题，也记录每一次重写。</p></div></div><button className="achievement-close" aria-label="关闭写作成就" onClick={onClose} autoFocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div className="achievement-body" aria-busy={loading}>
      {error&&<div className="achievement-error" role="alert"><span>{error}。{snapshot?'下方保留上次读取的进度。':'暂时无法读取成就，请重试。'}</span><button disabled={loading} onClick={()=>setReload(n=>n+1)}>重新读取</button></div>}
      {!snapshot?<div className="achievement-loading" role="status">{loading?'正在读取你的写作足迹…':'进度暂未加载'}</div>:<>
        <section className="achievement-overview" aria-label="总练习进度"><div className="achievement-hero-art"><AchievementArt kind="hero"/></div><div className="achievement-overview-data"><div className="achievement-numbers"><div><h3>已练习 <strong>{summary.practiced}</strong> 道题</h3><p>{summary.total} 道题中的 {summary.percent}%</p></div><dl><div><dt>已批阅</dt><dd><b>{summary.reviewed}</b> 题</dd></div><div><dt>累计提交</dt><dd><b>{summary.submitted}</b> 稿</dd></div></dl></div><ProgressBar done={summary.practiced} total={summary.total} label="总练习覆盖率"/></div></section>
        <div className="achievement-pools" role="tablist" aria-label="成就题库">{pools.map(group=>{const stats=summarizePractice(group.questions,progress);return <button key={group.id} id={`achievement-tab-${group.id}`} role="tab" aria-selected={scope===group.id} aria-controls="achievement-footprints" className={scope===group.id?'selected':''} onClick={()=>changeScope(group.id)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=pools.findIndex(g=>g.id===scope),index=e.key==='Home'?0:e.key==='End'?pools.length-1:(i+(e.key==='ArrowRight'?1:pools.length-1))%pools.length;changeScope(pools[index].id);document.getElementById(`achievement-tab-${pools[index].id}`)?.focus();}} tabIndex={scope===group.id?0:-1}><AchievementArt kind={group.art}/><div><h3>{group.label}</h3><p><b>{stats.practiced}</b> / {stats.total}<span>{stats.percent}%</span></p><ProgressBar done={stats.practiced} total={stats.total} label={`${group.label}覆盖率`}/></div></button>;})}</div>
        <section id="achievement-footprints" className="achievement-footprints" role="tabpanel" aria-labelledby={`achievement-tab-${scope}`}>
          <div className="achievement-section-heading"><div><h3>题目足迹</h3><p>{pool.label} · 已练习 {poolSummary.practiced} / {poolSummary.total} 题</p></div><div className="achievement-mode" role="group" aria-label="足迹展示方式"><button aria-pressed={mode==='year'} onClick={()=>{setMode('year');setSelected('');}}>按年份</button><button aria-pressed={mode==='category'} onClick={()=>{setMode('category');setSelected('');}}>按类别</button></div></div>
          {mode==='category'&&<div className="achievement-categories" role="group" aria-label="足迹类别"><button aria-pressed={!category} onClick={()=>{setCategory('');setSelected('');}}>全部 <span>{poolSummary.practiced}/{poolSummary.total}</span></button>{practiceCategories(scope).map(label=>{const s=categoryPractice(pool.questions,label,progress);return <button key={label} aria-pressed={category===label} onClick={()=>{setCategory(label);setSelected('');}}>{label}<span>{s.total?`${s.practiced}/${s.total}`:'暂无题目'}</span></button>;})}<p>同题可属多类，各类别分别计数，总进度按题目去重。</p></div>}
          <div className="achievement-year-grid" aria-label="题目点亮墙">{visible.map(q=>{const p=progress.get(q.id),state=practiceState(p),newDraft=!!p?.draftCount&&!!p?.submittedCount;return <button key={q.id} data-progress={state} className={`achievement-tile ${selected===q.id?'active':''}`} aria-pressed={selected===q.id} aria-label={`${questionYearLabel(q)} ${q.title}，${stateLabels[state]}${newDraft?'，有新草稿':''}`} title={`${q.title} · ${stateLabels[state]}${p?.submittedCount?` · ${p.submittedCount} 稿`:''}${newDraft?' · 有新草稿':''}`} onClick={()=>chooseQuestion(q.id)}><span>{q.year??'补充题'}</span>{state==='reviewed'?<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>:state==='draft'?<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 7-7 2 2-7 7-3 1Z"/></svg>:state==='practiced'?<i aria-hidden="true"/>:null}{newDraft&&<span className="achievement-new-draft" aria-hidden="true"/>}</button>;})}</div>
          {!visible.length&&<p className="achievement-empty-category">此类别暂未收录题目。</p>}
          <div className="achievement-map-footer"><div className="achievement-legend">{Object.entries(stateLabels).map(([key,label])=><span key={key}><i data-progress={key}/>{label}</span>)}</div>{next&&<button className="achievement-next" onClick={continueNext}>继续未完成的题目 <span aria-hidden="true">→</span></button>}</div>
          <p className="achievement-help">提交过一稿即点亮，同题重写不重复计题。已点亮题签右上角的小点表示有新草稿。</p>
          {selectedQuestion&&<div ref={detail} className="achievement-question-detail"><div><span>{questionYearLabel(selectedQuestion)} · {stateLabels[selectedState]}{selectedProgress?.submittedCount&&selectedProgress.draftCount?' · 新稿进行中':''}</span><h4>{selectedQuestion.title}</h4><p>已提交 {selectedProgress?.submittedCount||0} 稿 · 已批阅 {selectedProgress?.reviewedCount||0} 稿{selectedProgress?.draftCount?` · ${selectedProgress.draftCount} 份草稿`:''}</p></div><div className="achievement-question-actions">{selectedProgress?.latestDraftId&&<button className="button primary small" onClick={()=>onOpenRecord(selectedProgress.latestDraftId!)}>继续草稿</button>}{selectedProgress?.submittedCount?<><button className="button outline small" onClick={()=>openLatest(selectedProgress)}>{selectedProgress.latestReviewedId?'查看最近批阅':'查看最近提交'}</button><button className="text-button" onClick={()=>onShowRecords(selectedQuestion)}>全部练习</button></>:null}<button className={`button ${!selectedProgress?.submittedCount&&!selectedProgress?.draftCount?'primary':'ghost'} small`} onClick={()=>onStart(selectedQuestion)}>{selectedProgress?.submittedCount||selectedProgress?.draftCount?'再写一稿':'开始写作'}</button></div></div>}
        </section>
        {milestones.length>0&&<section className="achievement-milestones" aria-label="已达成的里程碑"><div className="achievement-section-heading"><h3>我的里程碑</h3><span>已达成 {milestones.length} 项</span></div><div className="achievement-badges">{featured.map(m=><MilestoneCard key={m.id} milestone={m}/>)}</div>{earlier.length>0&&<details className="achievement-earlier"><summary>查看此前获得的徽章（{earlier.length}）</summary><div className="achievement-badges">{earlier.map(m=><MilestoneCard key={m.id} milestone={m}/>)}</div></details>}</section>}
        <footer className="achievement-footer"><div><p>根据当前题库与云端练习记录自动计算。</p><details><summary>统计口径</summary><p>有非空正文且已提交的稿件，才计入练习。草稿不增加覆盖率；同稿修改与重复导入批阅不增加稿数。删除记录后进度会相应更新，新增题目会增加总题数。里程碑仅显示当前记录已达成的项目，同系列默认展示最高阶段，可展开查看此前获得的徽章。个人笔记仅统计主动添加且正文非空的条目，同题同内容去重；自动批注、收藏、重复导入和笔记修改版本不累计。批阅数量不触发成就。练习覆盖不代表已经掌握。</p></details></div><div><span>读取于 {dateLabel(snapshot.generatedAt)}</span><button className="text-button" disabled={loading} onClick={()=>setReload(n=>n+1)}>{loading?'正在更新…':'刷新进度'}</button></div></footer>
      </>}
    </div>
  </dialog>;
}
