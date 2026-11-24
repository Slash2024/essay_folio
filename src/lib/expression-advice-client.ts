import type {AdviceView,AdviceProgress} from './expression-advice';
export class AdviceConnectionError extends Error {
 constructor(message:string,public taskId?:string){super(message);this.name='AdviceConnectionError';}
}
export async function adviceAPI<T=AdviceView>(action:string,data:object={},signal?:AbortSignal):Promise<T>{
 const r=await fetch('/api/expression-advice',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal});
 let value;try{value=await r.json();}catch{throw new AdviceConnectionError('暂时无法读取云端状态');}
 if(!r.ok)throw new Error(value.error||'读取失败，请稍后重试');return value;
}
export async function streamAdvice(action:'prepare'|'generate',data:object,onProgress:(p:AdviceProgress)=>void,onActivity:()=>void):Promise<AdviceView> {
 const abort=new AbortController();let lastActivity=Date.now(),taskId:string|undefined,result:AdviceView|undefined,serverError='';
 const watchdog=setInterval(()=>{if(Date.now()-lastActivity>45000)abort.abort();},5000);
 const activity=()=>{lastActivity=Date.now();onActivity();};
 try {
  const response=await fetch('/api/expression-advice',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data,stream:true}),signal:abort.signal});
  activity();
  if(!response.ok){let value;try{value=await response.json();}catch{throw new AdviceConnectionError('生成连接暂时中断');}if(response.status>=500)throw new AdviceConnectionError(value.error||'生成服务暂不可用');throw new Error(value.error||'生成请求未被接受');}
  if(!response.headers.get('content-type')?.includes('text/event-stream')) {
   try{return await response.json();}catch{throw new AdviceConnectionError('生成响应未完整返回');}
  }
  const reader=response.body?.getReader();if(!reader)throw new AdviceConnectionError('生成连接没有返回数据');
  const decoder=new TextDecoder();let buffer='';
  const consume=(block:string)=>{
   const lines=block.split('\n'),event=lines.find(s=>s.startsWith('event:'))?.slice(6).trim();
   const raw=lines.filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
   if(!raw)return;let value;try{value=JSON.parse(raw);}catch{throw new AdviceConnectionError('进度信息未完整返回',taskId);}
   if(event==='progress'){taskId=value.taskId||taskId;onProgress(value);}
   if(event==='result')result=value;
   if(event==='error')serverError=value.error||'生成失败，请手动重试';
  };
  try {
   while(true){const chunk=await reader.read();if(chunk.done)break;activity();buffer+=decoder.decode(chunk.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){consume(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}if(buffer.length>400000)throw new AdviceConnectionError('生成响应片段过大',taskId);}
   buffer+=decoder.decode();if(buffer.trim())consume(buffer);
  }finally{await reader.cancel().catch(()=>{});}
  if(serverError)throw new Error(serverError);
  if(!result)throw new AdviceConnectionError('生成连接中断，正在查询云端结果',taskId);
  return result;
 }catch(error){
  if(error instanceof AdviceConnectionError||serverError)throw error;
  if(abort.signal.aborted||error instanceof TypeError)throw new AdviceConnectionError('连接暂时中断，正在查询云端生成状态',taskId);
  throw error;
 }finally{clearInterval(watchdog);}
}
