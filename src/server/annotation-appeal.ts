import questions from '../data/questions.json';
import {DEFAULT_RUBRICS,practiceQuestion,scoreTarget,wordCount,type Question,type Review,type Writing} from '../lib/folio';
import {
  APPEAL_CRITERIA,APPEAL_CRITERIA_VERSION,APPEAL_REASON_LIMIT,appealPrompt,parseAppealDecision,
  type AppealCandidate,type AppealDecision,type AppealMaterials
} from '../lib/annotation-appeal';
import {asCurated,curatedNotes,curationChanges,validateCuratedNote,type CuratedNote} from '../lib/review-curation';
import {parseReview,plain} from '../lib/review-analysis';
import {noteAnchor,reviewNotes,type ReviewNote,type TextAnchor} from '../lib/review-interactions';
import {exactSurfaceRange,readingRows} from '../lib/sentence-reading';
import {decode,find,put,type Row} from './archive';
import {AlignmentError,getAnnotationConfig} from './annotation-config';
import {requestModelJSON} from './annotation-provider';

const questionMap=new Map((questions as Question[]).map(q=>[q.id,q]));
const previewLifetime=30*60*1000;
interface AppealRecord {
  id:string;
  reviewId:string;
  noteId:string;
  writingId:string;
  fingerprint:string;
  requestFingerprint:string;
  expiresAt:number;
  status:'pending'|'ready'|'failed';
  candidate?:AppealCandidate;
  error?:string;
}

function validRange(range:TextAnchor|null|undefined,text:string):range is TextAnchor {
  return !!range&&Number.isSafeInteger(range.start)&&Number.isSafeInteger(range.end)
    &&range.start>=0&&range.end>range.start&&range.end<=text.length;
}

export function appealTarget(review:Review,noteId:string,text:string,allowHidden=false) {
  const analysis=parseReview(review.markdown),base=reviewNotes(analysis);
  const note=curatedNotes(analysis,review.curation).find(n=>n.id===noteId);
  if(!note||(!allowHidden&&note.hidden)||!['correction','optimization','keep'].includes(note.kind)||note.origin==='personal'){
    throw new AlignmentError('此条批注无法发起申诉，请重新打开批阅',409);
  }
  const attached=note.origin?(note.scope==='range'?note.anchor:null):noteAnchor(text,note,review.study?.entries[noteId]).range;
  const range=validRange(attached,text)?attached:null;
  const exact=note.original&&range?exactSurfaceRange(text,note.original,range):null;
  const sourceRange=exact||range;
  const rows=readingRows(text).rows.filter(row=>row.kind==='sentence');
  const first=sourceRange?rows.findIndex(row=>row.end>sourceRange.start&&row.start<sourceRange.end):-1;
  const last=sourceRange?rows.findLastIndex(row=>row.end>sourceRange.start&&row.start<sourceRange.end):-1;
  return {note,base,range:sourceRange,exact,rows,first,last};
}

async function fingerprint(value:unknown) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}

function targetFingerprint(review:Review,target:ReturnType<typeof appealTarget>) {
  return fingerprint([review.id,review.revisionId,target.note,target.range]);
}

async function loadTarget(reviewId:string,noteId:string) {
  const row=await find(reviewId);
  if(row?.kind!=='review')throw new AlignmentError('批阅不存在',404);
  const review=decode<Review>(row);
  const [writingRow,version]=await Promise.all([find(review.writingId),review.revisionId?find(review.revisionId):null]);
  if(writingRow?.kind!=='writing')throw new AlignmentError('作文记录不存在',404);
  const writing=decode<Writing>(writingRow);
  const bound=version?.kind==='revision'?decode<{writingId:string;text:string}>(version):null;
  if(!bound||bound.writingId!==writing.id)throw new AlignmentError('缺少这份批阅对应的原稿，无法发起申诉',409);
  const question=writing.questionSnapshot?.id===review.questionId?writing.questionSnapshot:questionMap.get(review.questionId);
  if(!question||question.id!==review.questionId)throw new AlignmentError('缺少该批阅的题目类型，无法选择复核准则',409);
  const target=appealTarget(review,noteId,bound.text);
  return {review,question:practiceQuestion(question),text:bound.text,target};
}

function optionalExcerpt(value:string,max:number) {
  return value.length>max?value.slice(0,max)+'…（节选）':value;
}

function materialsOf({question,text,target}:Awaited<ReturnType<typeof loadTarget>>):AppealMaterials {
  const {note,range,exact,rows,first,last}=target;
  const quoted=exact?text.slice(exact.start,exact.end):null;
  const passage=range?text.slice(first>=0?rows[first].start:range.start,last>=0?rows[last].end:range.end):null;
  const context={
    previous:first>0?optionalExcerpt(rows[first-1].text,600):'',
    next:last>=0&&last+1<rows.length?optionalExcerpt(rows[last+1].text,600):''
  };
  const rubricLines=DEFAULT_RUBRICS[question.type].split('\n');
  const wordClause=rubricLines.find(line=>line.startsWith('字数若少于'));
  const rubricBands=rubricLines.filter(line=>/^[1-6][.．]/.test(line));
  return {
    type:question.type,
    original:quoted?optionalExcerpt(quoted,2400):null,
    sentence:passage&&passage!==quoted?optionalExcerpt(passage,2400):null,
    note:{kind:note.kind,explanation:note.explanation?optionalExcerpt(plain(note.explanation),2400):null,
      replacement:note.replacement?optionalExcerpt(plain(note.replacement),2400):null,position:note.position?optionalExcerpt(plain(note.position),500):null},
    context:context.previous||context.next?context:null,
    task:optionalExcerpt(question.directions,2400)||null,
    wordRule:scoreTarget(question)+'。本稿系统计数 '+wordCount(text)+' 词。'+(wordClause||''),
    rubricBands
  };
}

export function applyAppealDecision(note:ReviewNote,range:TextAnchor|null,source:string,base:ReviewNote[],decision:AppealDecision):CuratedNote {
  const draft=asCurated(note,range,source);
  if(decision.verdict==='withdraw')return validateCuratedNote({...draft,hidden:true},source,base,draft);
  if(decision.verdict!=='revise'||!decision.patch)throw new AlignmentError('该裁定没有可采纳的修改');
  const {kind,explanation,replacement}=decision.patch;
  // A newly proposed correction can be shown inline only when its source span was already exact.
  const display=kind==='correction'&&note.kind==='correction'&&note.original&&range&&exactSurfaceRange(source,note.original,range)
    ?draft.display:'notes';
  return validateCuratedNote({...draft,kind,explanation,replacement,display},source,base,draft);
}

export async function previewAppeal(action:string,reviewId:string,noteId:string,body:Record<string,unknown>) {
  const loaded=await loadTarget(reviewId,noteId);
  const {review,target}=loaded;
  const materials=materialsOf(loaded);
  const targetKey=await targetFingerprint(review,target);
  const materialsKey=await fingerprint([targetKey,APPEAL_CRITERIA_VERSION,materials]);
  if(action==='appealMaterials')return {materials,fingerprint:materialsKey};

  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(!reason||reason.length>APPEAL_REASON_LIMIT)throw new AlignmentError('请填写申诉理由，最多 1200 字符');
  if(body.fingerprint!==materialsKey)throw new AlignmentError('批注或关联原文已变化，请重新打开申诉',409);
  if(typeof body.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(body.requestId))throw new AlignmentError('申诉请求编号不正确');
  const id='appeal-'+body.requestId;
  const {type,original,sentence,note,context,task,wordRule,rubricBands}=materials;
  const rubric=typeof body.rubricBand==='number'&&Number.isInteger(body.rubricBand)?rubricBands[body.rubricBand]:undefined;
  const input={
    type,original,sentence,note,reason,
    ...(body.includeContext===true&&context?{context}:{}),
    ...(body.includeTask===true&&task?{task}:{}),
    ...(body.includeWordRule===true&&wordRule?{wordRule}:{}),
    ...(rubric?{rubric}:{})
  };
  const requestFingerprint=await fingerprint([targetKey,APPEAL_CRITERIA_VERSION,input]);
  async function existing(row:Row) {
    const saved=decode<AppealRecord>(row);
    if(row.kind!=='appealCandidate'||saved.requestFingerprint!==requestFingerprint)throw new AlignmentError('申诉材料已变化，请发起新请求',409);
    if(saved.expiresAt<Date.now())throw new AlignmentError('裁定预览已过期，请重新提交申诉',410);
    if(saved.status==='ready'&&saved.candidate)return {candidate:saved.candidate,cached:true};
    throw new AlignmentError(saved.status==='pending'?'正在复核，可稍后查询上次结果':saved.error||'复核失败，请重新提交',saved.status==='pending'?409:502);
  }
  const prior=await find(id);
  if(prior)return existing(prior);
  const config=await getAnnotationConfig();
  if(!config?.enabled||!config.apiKey)throw new AlignmentError('请先在 API 设置中启用模型配置',503);
  const record:AppealRecord={id,reviewId,noteId,writingId:review.writingId,fingerprint:targetKey,
    requestFingerprint,expiresAt:Date.now()+previewLifetime,status:'pending'};
  try{await put(id,'appealCandidate',record);}catch(error){
    const concurrent=await find(id);
    if(concurrent)return existing(concurrent);
    throw error;
  }
  try{
    const raw=await requestModelJSON(config,appealPrompt(type),input);
    const evidence=[APPEAL_CRITERIA[type],rubric,original,sentence,...('context' in input?[context?.previous,context?.next]:[]),
      ...('task' in input?[task]:[]),...('wordRule' in input?[wordRule]:[])].filter((s):s is string=>!!s);
    let decision:AppealDecision;
    try{decision=parseAppealDecision(raw,evidence);}catch(error){throw new AlignmentError((error as Error).message,502);}
    const proposed=decision.verdict==='revise'||decision.verdict==='withdraw'
      ?applyAppealDecision(target.note,target.range,loaded.text,target.base,decision):null;
    const changes=proposed?curationChanges(target.note,proposed).filter(change=>
      ['性质','修改稿 / 补充表达','详细说明','暂不采纳'].includes(change.field)):[];

    const candidate:AppealCandidate={id,model:config.model,criteriaVersion:APPEAL_CRITERIA_VERSION,
      reason,decision,expiresAt:record.expiresAt,changes};
    const current=await loadTarget(reviewId,noteId);
    if(await targetFingerprint(current.review,current.target)!==targetKey)throw new AlignmentError('复核期间批注已更新，请重新打开申诉',409);
    const saved=await find(id);
    if(saved?.kind!=='appealCandidate')throw new AlignmentError('申诉记录已移除',404);
    await put(id,'appealCandidate',{...record,status:'ready',candidate},saved);
    return {candidate};
  }catch(error){
    const saved=await find(id);
    if(saved?.kind==='appealCandidate'){
      await put(id,'appealCandidate',{...record,status:'failed',error:error instanceof AlignmentError?error.message:'复核未完成，请手动重试'},saved);
    }
    throw error;
  }
}

export async function resolveAppeal(review:Review,noteId:string,candidateId:string,text:string) {
  const row=await find(candidateId);
  if(row?.kind!=='appealCandidate')throw new AlignmentError('裁定预览不存在，请重新提交申诉',404);
  const record=decode<AppealRecord>(row),candidate=record.candidate;
  if(record.status!=='ready'||!candidate||record.reviewId!==review.id||record.noteId!==noteId||record.writingId!==review.writingId){
    throw new AlignmentError('裁定预览与本条批注不匹配',409);
  }
  if(record.expiresAt<Date.now())throw new AlignmentError('裁定预览已过期，请重新提交申诉',410);
  const target=appealTarget(review,noteId,text);
  if(record.fingerprint!==await targetFingerprint(review,target))throw new AlignmentError('原批注已更新，请重新提交申诉',409);
  if(candidate.decision.unverifiedEvidence)throw new AlignmentError('这次裁定包含无法核对的引文，请重新复核后采纳',409);
  if(!candidate.changes.length)throw new AlignmentError('该裁定没有可采纳的实际变化',409);
  const note=applyAppealDecision(target.note,target.range,text,target.base,candidate.decision);
  return {candidate,note,before:target.note};
}
