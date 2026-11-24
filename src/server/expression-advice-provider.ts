import {AlignmentError,endpoint,type AnnotationConfig} from './annotation-config';

export interface ModelReception {receivedCharacters:number;receivedItems:number}
// Count only complete JSON objects in the items array. Braces inside quoted
// templates/examples and incomplete chunks cannot inflate visual progress.
export function completedAdviceItems(text:string) {
 const match=/"items"\s*:\s*\[/.exec(text);if(!match)return 0;
 let quoted=false,escaped=false,depth=0,start=-1,count=0;
 for(let i=match.index+match[0].length;i<text.length;i++) {
  const ch=text[i];
  if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
  if(ch==='"'){quoted=true;continue;}
  if(ch==='{' ){if(depth===0)start=i;depth++;}
  else if(ch==='}'){depth--;if(depth===0&&start>=0){try{const value=JSON.parse(text.slice(start,i+1));if(typeof value.entryKey==='string')count++;}catch{}start=-1;}}
  else if(ch===']'&&depth===0)break;
 }
 return Math.min(10,count);
}
function parseResult(content:string) {
 try{return JSON.parse(content.replace(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/,'$1'));}
 catch{throw new AlignmentError('模型未返回完整的调用卡 JSON，请手动重试',502);}
}
export async function requestAdviceJSON(config:AnnotationConfig,prompt:string,input:unknown,onReception:(value:ModelReception)=>void=()=>{},timeout=300000):Promise<unknown> {
 const abort=new AbortController();let timedOut=false,idleExpired=false;
 const timer=setTimeout(()=>{timedOut=true;abort.abort();},timeout);
 let idle:ReturnType<typeof setTimeout>|undefined;
 const resetIdle=(ms:number)=>{clearTimeout(idle);idle=setTimeout(()=>{idleExpired=true;abort.abort();},ms);};
 resetIdle(Math.min(180000,timeout));
 let content='',buffer='',bytes=0,lastReport=0,done=false;
 const decoder=new TextDecoder();
 const report=(force=false)=>{const now=Date.now();if(force||now-lastReport>=300){lastReport=now;onReception({receivedCharacters:content.length,receivedItems:completedAdviceItems(content)});}};
 function event(block:string) {
  const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)return;if(data.trim()==='[DONE]'){done=true;return;}
  let value:any;try{value=JSON.parse(data);}catch{throw new AlignmentError('模型流式响应格式不正确',502);}
  if(value.error)throw new AlignmentError('模型服务返回错误，请检查模型配置或稍后重试',502);
  const choice=value.choices?.[0];if(choice?.finish_reason==='length')throw new AlignmentError('模型结果被截断，请提高模型输出限制后重试',502);
  const part=choice?.delta?.content??choice?.message?.content;
  if(typeof part==='string')content+=part;
  // Provider reasoning is never returned, logged or stored. Traffic alone resets
  // the idle timer; visual progress reports answer length and complete items only.
  if(content.length>100000)throw new AlignmentError('模型输出过长，结果未被采用',502);
  resetIdle(Math.min(120000,timeout));report();
 }
 try {
  const response=await fetch(endpoint(config.baseURL),{method:'POST',redirect:'error',signal:abort.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,stream:true,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],...(config.jsonMode?{response_format:{type:'json_object'}}:{})})});
  if(!response.ok)throw new AlignmentError(response.status===401||response.status===403?'接口鉴权失败，请检查 API 密钥与模型权限':response.status===429?'接口限流或额度不足，请稍后手动重试':`模型接口返回 HTTP ${response.status}`,502);
  const reader=response.body?.getReader();if(!reader)throw new AlignmentError('模型接口未返回内容',502);
  const isJSON=response.headers.get('content-type')?.includes('application/json');
  try {
   while(true) {
    const chunk=await reader.read();if(chunk.done)break;
    // Per-token SSE envelopes can be much larger than the final JSON.
    // Bound transport bytes separately from answer and per-event memory.
    bytes+=chunk.value.byteLength;if(bytes>32*1024*1024)throw new AlignmentError('模型响应过大，结果未被采用',502);
    buffer+=decoder.decode(chunk.value,{stream:true});
    if(isJSON)continue;
    buffer=buffer.replace(/\r\n/g,'\n');let boundary;
    while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
    if(buffer.length>260000)throw new AlignmentError('模型流式片段过大，结果未被采用',502);
    if(done)break;
   }
   buffer+=decoder.decode();
   if(isJSON) {
    let raw;try{raw=JSON.parse(buffer);}catch{throw new AlignmentError('模型接口未返回有效 JSON',502);}
    if(raw?.choices?.[0]?.finish_reason==='length')throw new AlignmentError('模型结果被截断，请提高模型输出限制后重试',502);
    content=raw?.choices?.[0]?.message?.content;
    if(typeof content!=='string'||content.length>100000)throw new AlignmentError('模型没有返回可用的内容',502);
   } else if(buffer.trim())event(buffer);
   report(true);return parseResult(content);
  }finally{await reader.cancel().catch(()=>{});}
 }catch(e){
  if(e instanceof AlignmentError)throw e;
  throw new AlignmentError(timedOut?'本次模型生成超过5分钟，请稍后手动重试':idleExpired?'模型长时间未返回数据，请稍后手动重试':'与模型服务的连接中断，请稍后手动重试',502);
 }finally{clearTimeout(timer);clearTimeout(idle);}
}
