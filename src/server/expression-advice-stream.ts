import type {AdviceProgress,AdviceView} from '../lib/expression-advice';

// The work stays attached to an open streaming HTTP response; it is not an
// untracked fire-and-forget background job. Durable metadata supports reconnects.
export function adviceStream(run:(progress:(value:AdviceProgress)=>void)=>Promise<AdviceView>) {
 const encoder=new TextEncoder();let connected=true;
 const body=new ReadableStream<Uint8Array>({
  start(controller) {
   const send=(event:string,data:unknown)=>{if(!connected)return;try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{connected=false;}};
   // Flush headers and a small padding comment through buffering proxies early.
   controller.enqueue(encoder.encode(': '+'.'.repeat(2048)+'\n\n'));
   send('connected',{at:new Date().toISOString()});
   const heartbeat=setInterval(()=>send('heartbeat',{at:new Date().toISOString()}),10000);
   void run(value=>send('progress',value)).then(value=>send('result',value)).catch(error=>send('error',{error:error instanceof Error?error.message:'生成失败，请手动重试'})).finally(()=>{clearInterval(heartbeat);if(connected){try{controller.close();}catch{}connected=false;}});
  },
  cancel(){connected=false;},
 });
 return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
