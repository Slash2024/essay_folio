import type {APIRoute} from 'astro';
import {authorized} from '../../server/session';
import {find,decode} from '../../server/archive';
import {DEFAULT_EXPRESSIONS,type ExpressionLibrary} from '../../lib/expressions';
import {collectExpressionPerformance,recitationDetails} from '../../lib/expression-performance';
import {readRecitationRecords} from '../../server/expression-performance';
export const prerender=false;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export const GET:APIRoute=async({request})=>{
  try{
    if(!await authorized(request))return json({error:'请先输入个人访问码。'},401);
    const params=new URL(request.url).searchParams;
    const revision=Number(params.get('revision')),offset=Number(params.get('offset')||0),key=params.get('entry');
    if(!params.has('revision')||!Number.isSafeInteger(revision)||!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:'统计参数不正确。'},400);
    const row=await find('expression-library'),library=row?decode<ExpressionLibrary>(row):DEFAULT_EXPRESSIONS;
    if(revision!==library.revision)return json({error:'表达库已更新，请刷新云端版本后查看默写统计。'},409);
    if(key&&!([...library.sentences.map(e=>'sentence:'+e.id),...library.words.map(e=>'word:'+e.id)].includes(key)))return json({error:'表达条目不存在，请刷新云端版本。'},404);
    const result=collectExpressionPerformance(library,await readRecitationRecords());
    return json(key?{details:recitationDetails(result,key,offset)}:{performance:result.performance});
  }catch{return json({error:'默写统计暂时无法读取，请稍后重试。'},503);}
};
