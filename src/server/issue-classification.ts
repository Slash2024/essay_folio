import {accessConfig,equal,sign} from './session';
import {effectiveIssues,latestReviews,type AnalyticsIssue,type IssueDecision} from '../lib/analytics';
import {CLASSIFICATION_BATCH_SIZE,CLASSIFICATION_PROMPT,parseClassification,validClassificationCategories,type ClassificationResult} from '../lib/issue-classification';
import {plain} from '../lib/review-analysis';
import {templateKey,type Question,type Review} from '../lib/folio';
import {all,decode,deleteRow,find,put} from './archive';
import {AlignmentError,getAnnotationConfig} from './annotation-config';
import {requestModelJSON} from './annotation-provider';

const PREVIEW_TTL=30*60*1000;
const LEASE_WINDOW=60*1000;
type SavedDecision=IssueDecision & {reviewId:string;writingId:string};
type CachedResult=ClassificationResult;

async function hash(value:unknown){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
const eligible=(issue:AnalyticsIssue)=>issue.remembered&&!issue.categories.length&&!issue.classificationSource;
function modelInput(issue:AnalyticsIssue,question:Question){
 const original=plain(issue.original||''),replacement=plain(issue.replacement||'');
 const evidence=plain(issue.evidence);
 const explanation=original&&evidence.startsWith(original+'\n')?evidence.slice(original.length+1):evidence;
 return {type:templateKey(question),explanation:explanation.slice(0,1600),original:original.slice(0,500),replacement:replacement.slice(0,500)};
}
function contentFingerprint(issue:AnalyticsIssue,question:Question){
 return hash([templateKey(question),issue.evidence,issue.original??null,issue.replacement??null]);
}
function decisionId(reviewId:string,issueId:string,fingerprint:string){
 return hash([reviewId,issueId,fingerprint]).then(key=>'issue-decision-'+key);
}
export async function attachIssueDecisions(reviews:Review[],questions:Map<string,Question>){
 const stored=await all('issueDecision'),byReview=new Map<string,SavedDecision[]>();
 for(const row of stored){
  const decision=decode<SavedDecision>(row);
  const list=byReview.get(decision.reviewId)||[];
  list.push(decision);
  byReview.set(decision.reviewId,list);
 }
 return Promise.all(reviews.map(async review=>{
  const saved=byReview.get(review.id),question=questions.get(review.questionId);
  if(!saved?.length||!question)return review;
  const issues=effectiveIssues(review).filter(eligible);
  const matches=await Promise.all(issues.map(async issue=>{
   const fingerprint=await contentFingerprint(issue,question);
   return saved.find(d=>d.issueId===issue.id&&d.fingerprint===fingerprint);
  }));
  return {...review,issueDecisions:matches.filter(d=>d!==undefined).map(({issueId,fingerprint,categories,source,reason})=>({issueId,fingerprint,categories,source,reason}))};
 }));
}

export async function classifyIssues(action:string,items:unknown,questions:Map<string,Question>){
 if(!Array.isArray(items)||!items.length||items.length>CLASSIFICATION_BATCH_SIZE)
  throw new AlignmentError('请选择 1–8 条待分类重点问题');
 if(items.some(item=>!item||typeof item.reviewId!=='string'||typeof item.issueId!=='string'
   ||!/^[\w-]{1,100}$/.test(item.reviewId)||!/^[\w-]{1,220}$/.test(item.issueId)))
  throw new AlignmentError('批阅问题编号无效');

 const {signing}=await accessConfig();
 const requested=new Set(items.map(item=>item.reviewId));
 const reviewRows=(await all('review')).map(decode<Review>);
 const writingIds=new Set(reviewRows.filter(r=>requested.has(r.id)).map(r=>r.writingId));
 const latest=latestReviews(reviewRows.filter(r=>writingIds.has(r.writingId)));
 const targets=await Promise.all(items.map(async item=>{
  const review=latest.find(r=>r.id===item.reviewId);
  const question=review&&questions.get(review.questionId);
  const issue=review&&effectiveIssues(review).find(i=>i.id===item.issueId);
  if(!review||!question||!issue||!eligible(issue)||(await find(review.writingId))?.kind!=='writing')
   throw new AlignmentError('批阅或人工分类已变化，请刷新统计',409);
  const input=modelInput(issue,question);
  const fingerprint=await contentFingerprint(issue,question);
  const cacheId='issue-model-'+await hash(['v1',fingerprint]);
  const key=await decisionId(review.id,issue.id,fingerprint);
  const [decision,cache]=await Promise.all([find(key),find(cacheId)]);
  return {item,review,issue,input,fingerprint,cacheId,key,decision,cached:cache?.kind==='issueModel'?decode<CachedResult>(cache):undefined};
 }));
 if(new Set(targets.map(t=>t.key)).size!==targets.length)throw new AlignmentError('批阅问题编号重复');
 if(action==='acceptIssueClassification'){
  // Validate the whole selection before committing. Immutable IDs make retries idempotent.
  const decisions=await Promise.all(targets.map(async t=>{
   if(t.decision)return undefined;
   const {categories,fingerprint,expiresAt,token}=t.item;
   const cached=t.cached;
   if(!cached||fingerprint!==t.fingerprint||!Number.isFinite(expiresAt)||expiresAt<Date.now()||typeof token!=='string'||token.length!==43||!equal(token,await sign(JSON.stringify(['issue-preview',t.key,expiresAt]),signing)))
    throw new AlignmentError('预览已过期或批阅内容已变化，请重新读取分类结果',409);
   if(!validClassificationCategories(categories)||!categories.length)throw new AlignmentError('请至少选择一个有效类别');
   const same=JSON.stringify([...categories].sort())===JSON.stringify([...cached.categories].sort());
   return {reviewId:t.review.id,writingId:t.review.writingId,issueId:t.issue.id,fingerprint,
     categories,source:same?'llm':'manual',reason:same?cached.reason:''} satisfies SavedDecision;
  }));
  for(const [index,decision] of decisions.entries()){
   if(!decision)continue;
   const {key}=targets[index];
   try{await put(key,'issueDecision',decision);}catch(error){if((await find(key))?.kind!=='issueDecision')throw error;}
  }
  return {saved:targets.length};
 }
 if(targets.some(t=>t.decision))throw new AlignmentError('所选问题已保存分类，请刷新统计',409);

 const missing=[...new Map(targets.filter(t=>!t.cached).map(t=>[t.cacheId,t])).values()];
 const generated=new Map<string,CachedResult>();
 if(missing.length){
  const config=await getAnnotationConfig();
  if(!config?.enabled||!config.apiKey)throw new AlignmentError('请先在 API 设置中启用现有模型配置',503);
  const now=Date.now(),slot=Math.floor(now/LEASE_WINDOW);
  const claims:string[]=[];
  try{
   for(const target of missing){
    const claim=target.cacheId+'-'+slot;
    try{await put(claim,'issueModelClaim',{status:'pending'});}catch(error){
     if(await find(claim))throw new AlignmentError('相同问题正在分类，请稍后重试',409);
     throw error;
    }
    claims.push(claim);
    if(Date.now()>now+10000||Math.floor(Date.now()/LEASE_WINDOW)!==slot||
       await find(target.cacheId+'-'+(slot-1)))throw new AlignmentError('相同问题正在分类，请稍后重试',409);
    const ready=await find(target.cacheId);
    if(ready?.kind==='issueModel')generated.set(target.cacheId,decode<CachedResult>(ready));
   }
   const inputs=missing.filter(t=>!generated.has(t.cacheId)).map((t,i)=>({id:String(i+1),...t.input,cacheId:t.cacheId}));
   if(inputs.length){
    const value=await requestModelJSON(config,CLASSIFICATION_PROMPT,{items:inputs.map(({cacheId,...input})=>input)},35000);
    let result;
    try{result=parseClassification(value,inputs.map(input=>input.id));}
    catch(error){throw new AlignmentError((error as Error).message,502);}
    for(const {cacheId,id} of inputs){
     const entry=result.get(id)!;
     await put(cacheId,'issueModel',entry);
     generated.set(cacheId,entry);
    }
   }
  }finally{
   await Promise.allSettled(claims.map(deleteRow));
  }
 }
 const expiresAt=Date.now()+PREVIEW_TTL;
 return {candidates:await Promise.all(targets.map(async t=>{
  const {categories,reason}=(t.cached||generated.get(t.cacheId))!;
  return {reviewId:t.review.id,issueId:t.issue.id,fingerprint:t.fingerprint,expiresAt,categories,reason,token:await sign(JSON.stringify(['issue-preview',t.key,expiresAt]),signing)};
 }))};
}
