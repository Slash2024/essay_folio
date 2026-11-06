import {all,decode,find,list,put} from './archive';
import type {Writing,Review,Question} from '../lib/folio';
import type {WritingVersion} from '../lib/revisions';
import {parseReview,applyOverrides,withScoreMaximum} from '../lib/review-analysis';
import questions from '../data/questions.json';
const questionMap=new Map((questions as Question[]).map(q=>[q.id,q]));
const LEGACY:Record<string,{reviewId:string;snapshotId:string}>={
 '1a673134-ca8d-4686-ade3-2ee1566cc797':{reviewId:'145e952c-4f7d-41da-ba0c-0c516fc05159',snapshotId:'f9fc870f-7eca-4be1-b32e-e4703c0a6af8'},
 '25a0f6d6-255e-4147-97a3-f1bcbea0257c':{reviewId:'2476d967-dd8e-47c6-817e-a31ae075347c',snapshotId:'446f7644-4edb-4153-a17e-c492051937b9'}
};
export function analyzedReview(r:Review):Review{return {...r,analysis:withScoreMaximum(applyOverrides(parseReview(r.markdown),r.issueOverrides),questionMap.get(r.questionId))};}
export async function versions(writingId:string){const result:WritingVersion[]=[];for(let offset=0;;offset+=100){const p=await list('revision',{writingId,limit:100,offset});result.push(...p.rows.map(r=>decode<WritingVersion>(r)));if(p.rows.length<100)break;}return result.sort((a,b)=>a.version-b.version);}
export async function saveVersion(w:Writing,source:WritingVersion['source'],createdAt:string|null=w.lastEditedAt||w.submittedAt||null,historyIncomplete=false){const version=w.revision||1,id=`${w.id}-v${version}`,prior=await find(id);if(prior){const v=decode<WritingVersion>(prior);if(prior.kind!=='revision'||v.text!==w.text)throw new Error('记录版本冲突，请刷新后重试');return v;}const v:WritingVersion={id,writingId:w.id,questionId:w.questionId,version,text:w.text,createdAt,source,...(historyIncomplete?{historyIncomplete:true}:{})};await put(id,'revision',v);return v;}
export async function ensureHistory(w:Writing){
  if(w.status==='draft')return [];
  const special=LEGACY[w.id];
  if(special){const [sr,rr]=await Promise.all([find(special.snapshotId),find(special.reviewId)]);if(sr?.kind==='snapshot'&&rr?.kind==='review'){const snap=decode<{writingId:string;text:string;createdAt:string}>(sr),r=decode<Review>(rr);if(snap.writingId!==w.id||r.writingId!==w.id||snap.createdAt>r.createdAt)throw new Error('记录历史快照核对失败');
    const a=parseReview(r.markdown);const normalized=(s:string)=>s.replace(/\s+/g,' ').trim();if(a.corrections.some(c=>c.original&&!normalized(snap.text).includes(normalized(c.original))))throw new Error('记录历史快照与批阅原句不匹配');
    const old=await saveVersion({...w,text:snap.text,revision:1},'legacySnapshot',snap.createdAt,true);
    await saveVersion(w,'legacyCurrent',w.lastEditedAt||null,true);
    if(!r.revisionId){await put(r.id,'review',{...r,writingRevision:1,revisionId:old.id,binding:'legacySnapshot'},rr);}
    return versions(w.id);
  }}
  const rows=await versions(w.id);if(rows.length)return rows;
  await saveVersion(w,(w.revision||1)>1?'recovered':'submitted',w.lastEditedAt||w.submittedAt||null,(w.revision||1)>1);return versions(w.id);
}
export async function migrateHistory(){const ws=await all('writing');let count=0;for(const row of ws){const w=decode<Writing>(row);if(w.status!=='draft'){await ensureHistory(w);count++;}}return count;}
