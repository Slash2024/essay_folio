import {secrets} from '@wix/secrets';
import {auth} from '@wix/essentials';
// Confirmed against the official create-secret, partially-update-secret and list-secret-info SDK schemas.
const listInfo=auth.elevate(secrets.listSecretInfo),getValue=auth.elevate(secrets.getSecretValue),create=auth.elevate(secrets.createSecret),update=auth.elevate(secrets.updateSecret);
const NAME='ESSAY_ANNOTATION_LLM';
export interface AnnotationConfig {baseURL:string;model:string;apiKey:string;jsonMode:boolean;enabled:boolean;revision:string}
export class AlignmentError extends Error {constructor(message:string,public status=400){super(message);}}
export function endpoint(base:string){
 let url:URL;try{url=new URL(base);}catch{throw new AlignmentError('请填写有效的 HTTPS 服务地址');}
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||!host.includes('.'))throw new AlignmentError('服务地址须为公开 HTTPS 域名，不能包含密钥、查询参数或内部地址');
 url.pathname=url.pathname.replace(/\/+$/,'');if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';return url.toString();
}
async function info(){const r=await listInfo();return r.secrets?.find(s=>s.name===NAME);}
export async function getAnnotationConfig():Promise<AnnotationConfig|null>{const found=await info();if(!found?._id)return null;const r=await getValue(NAME);if(!r.value)throw new AlignmentError('标注 API 配置读取失败',503);const c=JSON.parse(r.value) as AnnotationConfig;endpoint(c.baseURL);return c;}
export function publicConfig(c:AnnotationConfig|null){return {configured:!!c?.apiKey,baseURL:c?.baseURL||'',model:c?.model||'',jsonMode:c?.jsonMode??true,enabled:c?.enabled??false,revision:c?.revision||''};}
export async function saveAnnotationConfig(input:Record<string,unknown>){
 const found=await info();let prior:AnnotationConfig|null=null;if(found?._id){const r=await getValue(NAME);prior=JSON.parse(r.value||'null');}
 if(String(input.revision||'')!==(prior?.revision||''))throw new AlignmentError('API 配置已更新，请重新加载后保存',409);
 const baseURL=String(input.baseURL||'').trim(),model=String(input.model||'').trim(),apiKey=typeof input.apiKey==='string'&&input.apiKey.trim()?input.apiKey.trim():prior?.apiKey||'';
 endpoint(baseURL);if(baseURL.length>500||!model||model.length>150||!apiKey||apiKey.length>1800||/[\r\n]/.test(apiKey))throw new AlignmentError('请填写服务地址、模型名和有效密钥');
 const config:AnnotationConfig={baseURL,model,apiKey,jsonMode:input.jsonMode!==false,enabled:input.enabled===true,revision:crypto.randomUUID()};const value=JSON.stringify(config);
 if(value.length>3500)throw new AlignmentError('API 配置过长，请缩短服务地址或模型名');
 if(found?._id)await update(found._id,{value});else await create({name:NAME,description:'Private annotation alignment API configuration',value});
 return publicConfig(config);
}
