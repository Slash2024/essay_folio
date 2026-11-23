import type {APIRoute} from 'astro';
import {authorized,sameOrigin} from '../../server/session';
import {TranslationError,identifier,practice,questionPractice,openQuestion,savePractice,uploadReferenceChunk,uploadReference,readImage,importReview,retiredReferences,archiveReference,conversation,requestTranslationModel,modelResult,acceptAppeal,undoAppeal} from '../../server/translation';
import {AlignmentError} from '../../server/annotation-config';
export const prerender=false;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function failure(e:unknown){return e instanceof TranslationError||e instanceof AlignmentError?json({error:e.message},e.status):json({error:'翻译服务暂时不可用，请保留当前文字后重试。'},503);}
export const GET:APIRoute=async({request})=>{try{
 if(!await authorized(request))return json({error:'请先输入个人访问码。'},401);
 const params=new URL(request.url).searchParams;
 if(params.has('image')){const image=await readImage(params.get('image')!);const binary=atob(image.data.split(',')[1]);return new Response(Uint8Array.from(binary,c=>c.charCodeAt(0)),{headers:{'Content-Type':image.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':image.type==='image/svg+xml'||!image.type.startsWith('image/')?'attachment':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});}
 if(params.has('id'))return json({practice:await practice(identifier(params.get('id')))});
 if(params.has('conversation'))return json({items:await conversation(identifier(params.get('conversation')))});
 if(params.has('questionId'))return json({practice:await questionPractice(params.get('questionId')!)});
 if(params.has('retired'))return json({images:await retiredReferences(identifier(params.get('retired')))});
 throw new TranslationError('请选择翻译年份。');
}catch(e){return failure(e);}};
export const POST:APIRoute=async({request})=>{try{
 if(!sameOrigin(request))return json({error:'请求来源不匹配。'},403);
 if(!await authorized(request))return json({error:'请先输入个人访问码。'},401);
 if(Number(request.headers.get('content-length')||0)>390000)return json({error:'本次内容过大。'},413);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>390000)return json({error:'本次内容过大。'},413);
 let b;try{b=JSON.parse(raw);}catch{throw new TranslationError('请求不是有效JSON。');}if(!b||typeof b!=='object'||Array.isArray(b))throw new TranslationError('请求格式不正确。');
 if(b.action==='open')return json({practice:await openQuestion(String(b.questionId))});
 if(b.action==='uploadReferenceChunk')return json(await uploadReferenceChunk(b));
 if(b.action==='archiveReference')return json(await archiveReference(b));
 if(['save','submit'].includes(b.action))return json({practice:await savePractice(b)});
 if(b.action==='uploadReference')return json({image:await uploadReference(b)});
 if(b.action==='importReview')return json({practice:await importReview(b)});
 if(b.action==='ask')return json({result:await requestTranslationModel(b)});
 if(b.action==='modelResult')return json({result:await modelResult(b)});
 if(b.action==='acceptAppeal')return json({practice:await acceptAppeal(b)});
 if(b.action==='undoAppeal')return json({practice:await undoAppeal(b)});
 throw new TranslationError('不支持的翻译操作。');
}catch(e){return failure(e);}};
