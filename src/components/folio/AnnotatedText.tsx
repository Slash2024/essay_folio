import type {DiffPart} from '../../lib/revisions';
import type {ReviewNote} from '../../lib/review-interactions';
import {isSentenceRewrite} from '../../lib/sentence-reading';
import {groupPhraseChanges} from '../../lib/phrase-diff';
function MarkedText({text,start,notes}:{text:string;start:number;notes:ReviewNote[]}){
 const relevant=notes.filter(n=>n.anchor&&n.emphasis&&n.emphasis!=='none'&&n.anchor.start<start+text.length&&n.anchor.end>start),points=new Set([0,text.length]);
 for(const n of relevant){points.add(Math.max(0,n.anchor!.start-start));points.add(Math.min(text.length,n.anchor!.end-start));}
 const sorted=[...points].sort((a,b)=>a-b);return <>{sorted.slice(0,-1).map((p,i)=>{const end=sorted[i+1],styles=[...new Set(relevant.filter(n=>n.anchor!.start<start+end&&n.anchor!.end>start+p).map(n=>`curation-mark-${n.emphasis}`))];return <span key={p} className={styles.join(' ')}>{text.slice(p,end)}</span>;})}</>;
}
export default function SentenceChanges({parts,mode='auto',start=0,notes=[]}:{parts:DiffPart[];mode?:'auto'|'inline'|'sentence';start?:number;notes?:ReviewNote[]}){
 if(mode==='auto'){const grouped:DiffPart[]=[];let pending:DiffPart[]=[];for(const p of parts){if(p.locked){grouped.push(...groupPhraseChanges(pending),p);pending=[];}else pending.push(p);}grouped.push(...groupPhraseChanges(pending));parts=grouped;}
 const locked=parts.some(p=>p.locked);
 const before=parts.filter(p=>p.type!=='add').map(p=>p.value).join(''),after=parts.filter(p=>p.type!=='remove').map(p=>p.value).join('');
 if(before!==after&&!locked&&(mode==='sentence'||mode==='auto'&&isSentenceRewrite(parts)))return <span className="sentence-rewrite"><span className="sentence-rewrite-line"><span className="sentence-rewrite-label">原句</span><del><MarkedText text={before} start={start} notes={notes}/></del></span><span className="sentence-rewrite-line"><span className="sentence-rewrite-label">修改后</span><ins>{after}</ins></span></span>;
 let position=start;return <>{parts.map((p,i)=>{const at=position;if(p.type!=='add')position+=p.value.length;return p.type==='remove'?<del key={i}><MarkedText text={p.value} start={at} notes={notes}/></del>:p.type==='add'?<ins key={i}>{p.value}</ins>:<MarkedText key={i} text={p.value} start={at} notes={notes}/>;})}</>;
}
