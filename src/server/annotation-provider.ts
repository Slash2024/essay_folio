import {ALIGNMENT_PROMPT,validateSegments,type AlignmentPair} from '../lib/annotation-alignment';
import {AlignmentError,endpoint,type AnnotationConfig} from './annotation-config';
export async function requestAlignment(config:AnnotationConfig,pair:AlignmentPair,explanation:string,context?:{previous:string;next:string}){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000);
 try{
  const response=await fetch(endpoint(config.baseURL),{method:'POST',redirect:'error',signal:abort.signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,stream:false,messages:[{role:'system',content:ALIGNMENT_PROMPT},{role:'user',content:JSON.stringify({original:pair.original,revised:pair.revised,explanation:explanation.slice(0,6000),...(context?{context}:{} )})}],...(config.jsonMode?{response_format:{type:'json_object'}}:{})})});
  if(!response.ok)throw new AlignmentError(response.status===401||response.status===403?'接口鉴权失败，请检查 API 密钥与模型权限':response.status===429?'接口限流或额度不足，请稍后手动重试':`标注接口返回 HTTP ${response.status}，当前展示未改变`,502);
  const reader=response.body?.getReader();if(!reader)throw new AlignmentError('标注接口未返回内容',502);
  let total=0,text='';const decoder=new TextDecoder();while(true){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>160000){await reader.cancel();throw new AlignmentError('模型响应过大，结果未被采用',502);}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();
  let raw:any;try{raw=JSON.parse(text);}catch{throw new AlignmentError('接口未返回有效 JSON',502);}
  const choice=raw?.choices?.[0];if(choice?.finish_reason==='length')throw new AlignmentError('模型结果被截断，请更换输出限制更宽松的模型',502);
  const content=choice?.message?.content;if(typeof content!=='string'||content.length>100000)throw new AlignmentError('模型没有返回可用的分组内容',502);
  let value;try{value=JSON.parse(content.replace(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/,'$1'));}catch{throw new AlignmentError('模型未返回约定的 JSON 分组，请手动重试',502);}
  try{return validateSegments(value,pair);}catch(e){throw new AlignmentError((e as Error).message,502);}
 }catch(e){if(e instanceof AlignmentError)throw e;throw new AlignmentError(abort.signal.aborted?'模型请求超时；当前标注保留，可查询上次结果或重新生成':'标注接口暂不可用，请检查服务地址或稍后重试',502);}finally{clearTimeout(timer);}
}
