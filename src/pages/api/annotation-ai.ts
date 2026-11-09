import type {APIRoute} from 'astro';
import type {Review} from '../../lib/folio';
import {ALIGNMENT_PROMPT_VERSION,validateSegments,type AlignmentCandidate,type AlignmentStore,type AlignmentPair,type NoteAlignment} from '../../lib/annotation-alignment';
import {alignmentInput} from '../../lib/alignment-input';
import {fullEssayInput,FULL_ESSAY_ALIGNMENT_ID} from '../../lib/essay-comparison';
import {curatedNotes} from '../../lib/review-curation';
import {parseReview} from '../../lib/review-analysis';
import {readingRows} from '../../lib/sentence-reading';
import {authorized,sameOrigin} from '../../server/session';
import {find,put,decode} from '../../server/archive';
import {analyzedReview} from '../../server/history';
import {getAnnotationConfig,saveAnnotationConfig,publicConfig,AlignmentError} from '../../server/annotation-config';
import {requestAlignment} from '../../server/annotation-provider';
import {previewAppeal} from '../../server/annotation-appeal';
export const prerender=false;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const identifier=(v:unknown)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v)||['__proto__','constructor','prototype'].includes(v))throw new AlignmentError('记录编号不正确');return v;};
async function input(reviewId:string,noteId:string){
 const row=await find(reviewId);if(row?.kind!=='review')throw new AlignmentError('批阅不存在',404);const review=decode<Review>(row);
 const writing=await find(review.writingId);if(writing?.kind!=='writing')throw new AlignmentError('记录不存在',404);
 const version=review.revisionId?await find(review.revisionId):null;const source=version?.kind==='revision'?decode<{writingId:string;text:string}>(version):null;
 if(!source||source.writingId!==review.writingId)throw new AlignmentError('批阅对应正文为 not given，无法优化标注');
 const analysis=parseReview(review.markdown);
 const note=curatedNotes(analysis,review.curation).find(n=>n.id===noteId);
 const pair=noteId===FULL_ESSAY_ALIGNMENT_ID?fullEssayInput(source.text,analysis):note?alignmentInput(note,source.text):null;
 if(!pair&&noteId===FULL_ESSAY_ALIGNMENT_ID)throw new AlignmentError('请确认第六部分包含完整修改作文，且两版文字不同、各不超过 6000 字符');
 if(!pair)throw new AlignmentError('此条需有确定的原句和修改句；请先定位原文或确认改稿');
 return {row,review,pair,source:source.text};
}
function checkPair(pair:AlignmentPair,other:AlignmentPair){if(pair.original!==other.original||pair.revised!==other.revised||pair.display!==other.display)throw new AlignmentError('对应原句、改稿或显示设置已变化，请重新生成',409);}
export const POST:APIRoute=async({request})=>{
 try{
  if(!sameOrigin(request))return json({error:'请求来源不匹配'},403);
  if(!await authorized(request))return json({error:'请先输入个人访问码'},401);
  const text=await request.text();if(new TextEncoder().encode(text).length>16000)return json({error:'请求过大'},413);
  let b;try{b=JSON.parse(text);}catch{throw new AlignmentError('输入内容不是有效 JSON');}if(!b||typeof b!=='object'||Array.isArray(b))throw new AlignmentError('输入内容必须为对象');
  if(b.action==='config')return json({config:publicConfig(await getAnnotationConfig())});
  if(b.action==='saveConfig')return json({config:await saveAnnotationConfig(b)});
  if(b.action==='testConnection'){
   const config=await getAnnotationConfig();if(!config?.apiKey||!config.enabled)throw new AlignmentError('请先保存并启用标注 API 配置',503);
   const pair={original:'Parks serves residents.',revised:'Parks serve residents.',display:'auto'};
   await requestAlignment(config,pair,'主语 parks 是复数，修正主谓一致。');return json({ok:true,message:'连接与分组校验通过，未发送个人作文。'});
  }
  const reviewId=identifier(b.reviewId),noteId=identifier(b.noteId);
  if(b.action==='appealMaterials'||b.action==='previewAppeal')return json(await previewAppeal(b.action,reviewId,noteId,b));
  if(b.action==='generate'){
   const requestId=identifier(b.requestId),candidateId='ai-'+requestId;const previous=await find(candidateId);
   if(previous){const saved=decode<any>(previous);if(previous.kind!=='alignmentCandidate'||saved.reviewId!==reviewId||saved.noteId!==noteId)throw new AlignmentError('请求编号不匹配',409);
    if(saved.status==='ready'){const latest=await input(reviewId,noteId);checkPair(latest.pair,saved);if(Date.parse(saved.expiresAt)<Date.now())throw new AlignmentError('预览已过期，请重新生成',410);return json({candidate:saved,cached:true});}
    throw new AlignmentError(saved.status==='pending'?'上次请求仍在生成，可稍后查询；不会重复调用模型':saved.error||'上次生成未成功，请点击重新生成',saved.status==='pending'?409:502);
   }
   const target=await input(reviewId,noteId),config=await getAnnotationConfig();if(!config?.apiKey||!config.enabled)throw new AlignmentError('标注 API 尚未配置或未启用，请先到 API 设置中配置',503);
   let context:{previous:string;next:string}|undefined;
   if(b.includeContext===true&&noteId!==FULL_ESSAY_ALIGNMENT_ID){const rows=readingRows(target.source).rows;const first=rows.findIndex(r=>r.end>target.pair.start),last=rows.findLastIndex(r=>r.start<target.pair.end);context={previous:first>0?rows[first-1].text.slice(0,600):'',next:last>=0?rows[last+1]?.text.slice(0,600)||'':''};}
   const createdAt=new Date().toISOString(),pending={id:candidateId,reviewId,noteId,writingId:target.review.writingId,status:'pending',createdAt,expiresAt:new Date(Date.now()+1800000).toISOString()};
   // Unique insert prevents replay of one generation request from charging twice.
   await put(candidateId,'alignmentCandidate',pending);
   try{
    const segments=await requestAlignment(config,target.pair,target.pair.explanation,context);
    const candidate:AlignmentCandidate={...pending,status:'ready',original:target.pair.original,revised:target.pair.revised,display:target.pair.display,segments,model:config.model,promptVersion:ALIGNMENT_PROMPT_VERSION};
    const writing=await find(pending.writingId),reviewRow=await find(reviewId),saved=await find(candidateId);if(writing?.kind!=='writing'||reviewRow?.kind!=='review'||saved?.kind!=='alignmentCandidate')throw new AlignmentError('记录已移除，生成结果未保存',404);await put(candidateId,'alignmentCandidate',candidate,saved);return json({candidate});
   }catch(e){const saved=await find(candidateId),writing=await find(pending.writingId);if(saved?.kind==='alignmentCandidate'&&writing?.kind==='writing')await put(candidateId,'alignmentCandidate',{...pending,status:'failed',error:e instanceof AlignmentError?e.message:'生成未成功，请手动重试'},saved);throw e;}
  }
  if(!['accept','undo','rules'].includes(b.action))throw new AlignmentError('不支持的操作');
  const target=await input(reviewId,noteId),store:AlignmentStore=target.review.alignments||{revision:0,entries:{}};
  const entry:NoteAlignment=structuredClone(store.entries[noteId]||{current:null,versions:[],undo:[],events:[]});
  let candidate:AlignmentCandidate|undefined;
  if(b.action==='accept'){
   const saved=await find(identifier(b.candidateId));if(saved?.kind!=='alignmentCandidate')throw new AlignmentError('生成预览不存在',404);
   candidate=decode<AlignmentCandidate>(saved);if(candidate.status!=='ready'||candidate.reviewId!==reviewId||candidate.noteId!==noteId||candidate.writingId!==target.review.writingId)throw new AlignmentError('生成预览与本条批注不匹配');
   checkPair(target.pair,candidate);validateSegments(candidate,target.pair);
   if(entry.current===candidate.id)return json({review:analyzedReview(target.review),unchanged:true});
   if(Date.parse(candidate.expiresAt)<Date.now())throw new AlignmentError('预览已过期，请重新生成',410);
  }
  if(Number(b.baseRevision)!==store.revision)throw new AlignmentError('标注展示已在其他页面更新，请重新读取批阅后重试',409);
  if(b.action==='accept'&&candidate){
   entry.undo.push(entry.current);entry.current=candidate.id;
   const {id,original,revised,display,segments,model,promptVersion}=candidate;
   entry.versions=[...entry.versions.filter(v=>v.id!==id),{id,original,revised,display,segments,model,promptVersion,createdAt:new Date().toISOString()}].slice(-6);
  }else if(b.action==='undo'){
   if(!entry.undo.length)throw new AlignmentError('没有可撤销的采纳记录');entry.current=entry.undo.pop()??null;
  }else {if(entry.current===null)return json({review:analyzedReview(target.review),unchanged:true});entry.undo.push(entry.current);entry.current=null;}
  const available=new Set(entry.versions.map(v=>v.id));entry.undo=entry.undo.slice(-5).map(id=>id&&available.has(id)?id:null);
  if(entry.current&&!available.has(entry.current))entry.current=null;
  entry.events=[...entry.events,{at:new Date().toISOString(),operation:b.action,target:entry.current}].slice(-20);
  const alignments:AlignmentStore={revision:store.revision+1,entries:{...store.entries,[noteId]:entry}};
  if(new TextEncoder().encode(JSON.stringify(alignments)).length>110000)throw new AlignmentError('本篇已保存的分组历史达到容量上限，当前展示保留');
  const next={...target.review,alignments};if(new TextEncoder().encode(JSON.stringify(next)).length>370000)throw new AlignmentError('批阅内容过大，无法再保存分组');
  await put(next.id,'review',next,target.row);return json({review:analyzedReview(next)});
 }catch(e){if(e instanceof AlignmentError)return json({error:e.message},e.status);console.error('Annotation operation failed',e instanceof Error?e.name:'Error');return json({error:'标注服务暂不可用，当前正文与批阅保留。请稍后重试。'},503);}
};
