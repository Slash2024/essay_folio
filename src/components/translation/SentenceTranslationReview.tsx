import {useMemo,useRef} from 'react';
import type {TranslationPractice,TranslationQuestion} from '../../lib/translation';
import {parseTranslationReview,renderReviewFragments} from '../../lib/translation-review';
import TranslationMarkdown from './TranslationMarkdown';

export default function SentenceTranslationReview({question,practice,selected,onSelect,onAppeal,onCopy,busy}:{question:TranslationQuestion;practice:TranslationPractice;selected:number;onSelect:(number:number)=>void;onAppeal:()=>void;onCopy:(text:string)=>void;busy:boolean}){
 const review=useMemo(()=>parseTranslationReview(practice.review!.markdown,question,practice.answers),[practice.review!.markdown,question,practice.answers]);
 const current=review.sentences.find(s=>s.number===selected)!,heading=useRef<HTMLDivElement>(null);
 const globalMarkdown=renderReviewFragments(review.global);
 function select(number:number){onSelect(number);heading.current?.scrollIntoView({behavior:'smooth',block:'start'});}
 return <div className="tr-per-question-review">
  <div className="tr-review-overview"><div className="tr-score"><span>本次总分</span><strong>{review.total??'未识别'}</strong>{review.total!==null&&<span>/ 10</span>}</div><div className="tr-overall-comment"><h3>整体评价</h3>{review.summary?<TranslationMarkdown markdown={review.summary}/>:<p className="caption">未识别到单独的整体评价，原文仍可在下方说明或原始 Markdown 中查看。</p>}</div></div>
  {!!globalMarkdown&&<details className="tr-global-review"><summary>全篇说明与未归属内容</summary><p className="caption">保留全篇评分说明，以及无法可靠对应到单题的内容。</p><TranslationMarkdown markdown={globalMarkdown}/></details>}
  <div className="tr-sentence-review-grid">
   <aside className="tr-question-column"><div className="tr-question-column-heading"><h3>原文与我的译文</h3><span className="caption">点击题目查看对应批阅</span></div><nav className="tr-question-list" aria-label="选择翻译题目">{question.sentences.map((s,i)=>{const details=review.sentences[i];return <button type="button" key={s.number} className={'tr-question-card'+(s.number===selected?' selected':'')} aria-label={`查看第${s.number}题批阅`} aria-pressed={s.number===selected} onClick={()=>select(s.number)}><span className="tr-question-card-heading"><strong>第 {s.number} 题</strong>{details.score!==null&&<span>{details.score} / 2</span>}{s.number===selected&&<small>当前查看</small>}</span><span className="tr-question-label">英文原句</span><span className="english tr-question-original">{s.text}</span><span className="tr-question-label">我的译文</span><span className="tr-question-answer">{practice.answers[i]}</span></button>;})}</nav></aside>
   <section key={`${selected}:${practice.revision}`} className="tr-current-question" aria-label={`第${selected}题完整批阅`}><div className="tr-current-question-heading" ref={heading}><h2>第 {selected} 题 · 完整批阅</h2><button className="text-button" disabled={busy||!current.fragments.some(f=>f.numbers.length===1)} onClick={onAppeal}>申诉本题</button></div><div className="tr-review-body tr-sentence-review-body">{current.groups.length?current.groups.map(group=><section key={group.section} className={'tr-sentence-group'+(group.section===5?' tr-final-translation':'')} data-section={group.section}><div className="tr-sentence-group-heading"><h3>{group.title}</h3>{group.section===1&&current.score!==null&&<strong className="tr-question-score">{current.score} <small>/ 2</small></strong>}</div><TranslationMarkdown markdown={group.markdown}/>{group.section===5&&<button className="text-button tr-copy-translation" disabled={busy} onClick={()=>onCopy(group.markdown.replace(/[*]{2}|__/g,'').replace(/^#{1,6}\s+/gm,'').trim())}>复制译文</button>}</section>):<div className="empty-state"><p>尚未识别到本题的批阅</p><span>请查看“全篇说明与未归属内容”或原始 Markdown，内容仍完整保留。</span></div>}</div></section>
  </div>
 </div>;
}
