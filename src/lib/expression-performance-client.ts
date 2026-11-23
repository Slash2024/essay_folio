export async function performanceRequest<T>(revision:number,entry?:string,offset=0,signal?:AbortSignal):Promise<T>{
  const params=new URLSearchParams({revision:String(revision)});
  if(entry){params.set('entry',entry);params.set('offset',String(offset));}
  const response=await fetch('/api/expression-performance?'+params,{cache:'no-store',signal});
  let value;try{value=await response.json();}catch{throw new Error('默写统计未返回有效结果，请重试。');}
  if(!response.ok)throw new Error(value.error||'默写统计暂时无法读取。');
  return value;
}
