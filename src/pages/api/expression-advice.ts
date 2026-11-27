import {repairSavedAdviceCues} from '../../server/expression-advice-cues';
import {adviceStream} from '../../server/expression-advice-stream';
import type {APIRoute} from 'astro';
import {authorized,sameOrigin} from '../../server/session';
import {AlignmentError} from '../../server/annotation-config';
import {adviceIndex,adviceView,prepareAdviceContext,generateExpressionAdvice} from '../../server/expression-advice';
export const prerender=false;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function identifier(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new AlignmentError('题目或请求编号不正确');return value;}
export const POST:APIRoute=async({request})=>{
 try {
  if(!sameOrigin(request))return json({error:'请求来源不匹配'},403);
  if(!await authorized(request))return json({error:'请先输入个人访问码'},401);
  if(Number(request.headers.get('content-length')||0)>6000)return json({error:'请求过大'},413);
  const text=await request.text();if(new TextEncoder().encode(text).length>6000)return json({error:'请求过大'},413);
  let body;try{body=JSON.parse(text);}catch{return json({error:'请求格式不正确'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'请求格式不正确'},400);
  if(body.action==='index')return json(await adviceIndex());
  if(body.action==='repairCues'){
   const requestId=identifier(body.requestId);
   return body.stream===true?adviceStream(progress=>repairSavedAdviceCues(requestId,progress)):json(await repairSavedAdviceCues(requestId));
  }
  if(body.mode!==undefined&&body.mode!=='normal'&&body.mode!=='strong')return json({error:'调用卡模式不正确'},400);
  const mode=body.mode||'normal';
  const id=identifier(body.questionId),writingId=body.writingId!==undefined?identifier(body.writingId):undefined;
  if(body.action==='read')return json(await adviceView(id,body.taskId?identifier(body.taskId):undefined,writingId,mode));
  const requestId=identifier(body.requestId);
  if(body.stream===true&&(body.action==='prepare'||body.action==='generate'))return adviceStream(progress=>body.action==='prepare'?prepareAdviceContext(id,requestId,body.refresh===true,progress,writingId,mode):generateExpressionAdvice(id,requestId,body.regenerate===true,progress,writingId,mode));
  if(body.action==='prepare')return json(await prepareAdviceContext(id,requestId,body.refresh===true,undefined,writingId,mode));
  if(body.action==='generate')return json(await generateExpressionAdvice(id,requestId,body.regenerate===true,undefined,writingId,mode));
  return json({error:'未知操作'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'生成暂不可用，请手动重试'},e instanceof AlignmentError?e.status:502);}
};
