import type {ReviewNote} from './review-interactions';
import {locateQuote} from './review-interactions';
import {exactSurfaceRange} from './sentence-reading';
import {plain} from './review-analysis';
import type {AlignmentPair} from './annotation-alignment';
export function alignmentInput(note:ReviewNote,source:string):(AlignmentPair&{start:number;end:number;explanation:string})|null{
 if(note.kind!=='correction'||note.hidden||!note.original||!note.replacement)return null;
 const at=note.origin&&note.scope==='range'?note.anchor:locateQuote(source,note.original);
 const range=at?exactSurfaceRange(source,note.original,at):null;if(!range)return null;
 const original=source.slice(range.start,range.end),revised=plain(note.replacement);
 if(!original.trim()||!revised.trim()||original===revised||original.length>6000||revised.length>6000)return null;
 return {original,revised,display:note.display||'auto',start:range.start,end:range.end,explanation:note.explanation||''};
}
