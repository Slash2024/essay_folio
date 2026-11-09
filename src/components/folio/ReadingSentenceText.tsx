import type {SentenceDisplay,LocatedReviewNote} from '../../lib/sentence-reading';
import {plain} from '../../lib/review-analysis';
import SentenceChanges from './AnnotatedText';
import MarkdownView from './MarkdownView';

export default function ReadingSentenceText({display}:{display:SentenceDisplay}){
 const mode=display.notes.some(n=>n.note.display==='sentence')?'sentence'
  :display.notes.some(n=>n.note.display==='inline')?'inline':'auto';
 return <span className="sentence-body english">
  <SentenceChanges parts={display.parts} start={display.row.start} notes={display.notes.map(n=>n.note)} mode={mode}/>
  {display.notes.filter(n=>n.note.shortNote).map(n=>
   <span className="curation-inline-label" key={n.note.id}>
    {n.note.origin==='personal'?'个人：':''}{n.note.shortNote}
   </span>
  )}
  {display.notes.filter(n=>
   n.note.origin&&!n.note.appealVersion&&n.note.kind==='optimization'&&n.note.replacement&&
   n.range&&n.range.end<=display.row.end
  ).map(n=>
   <span className="curation-supplement" key={n.note.id}>
    <span>整理补充句 · 非原文</span>{plain(n.note.replacement!)}
   </span>
  )}
 </span>;
}

export function CrossSentenceRevisions({items,displays,located}:{items:SentenceDisplay[];displays:SentenceDisplay[];located:LocatedReviewNote[]}){
 const revisions=located.filter(n=>
  !n.note.hidden&&n.note.origin&&n.note.kind==='correction'&&n.note.display==='sentence'&&
  n.range&&n.note.replacement&&
  items.some(d=>n.range!.end>d.row.start&&n.range!.end<=d.row.end)&&
  displays.filter(d=>n.range!.start<d.row.end&&n.range!.end>d.row.start).length>1
 );
 return <>{revisions.map(n=>
  <div className="curation-cross-revision" key={n.note.id}>
   <strong>跨句整理改稿 · {n.note.title}</strong>
   <p>原文句子分别保留；以下是你确认关联的共同改法。</p>
   <MarkdownView markdown={n.note.replacement!}/>
  </div>
 )}</>;
}
