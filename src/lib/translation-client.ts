import type {ReferenceImage,TranslationPractice,TranslationQuestion} from './translation';
import {translationPacket} from './translation';
export async function translationApi<T=any>(action:string,data:object={}):Promise<T>{return result(await fetch('/api/translation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})}));}
export async function translationGet<T=any>(params:Record<string,string>={}):Promise<T>{return result(await fetch('/api/translation?'+new URLSearchParams(params),{credentials:'same-origin'}));}
async function result(response:Response){let body;try{body=await response.json();}catch{throw new Error('翻译服务未返回有效结果，请保留文字后重试。');}if(!response.ok)throw new Error(body.error||'操作未成功。');return body;}
export const referenceUrl=(id:string)=>'/api/translation?image='+encodeURIComponent(id);
const CHUNK_BYTES=240000;
function base64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
// Preserve every original byte; do not decode, inspect, resize or re-encode an upload.
export async function uploadOriginalReference(id:string,file:File){
 const imageId='tri-'+crypto.randomUUID(),parts=Math.max(1,Math.ceil(file.size/CHUNK_BYTES));
 for(let index=0;index<parts;index++){const bytes=new Uint8Array(await file.slice(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES).arrayBuffer());await translationApi('uploadReferenceChunk',{id,imageId,index,data:base64(bytes)});}
 return (await translationApi('uploadReference',{id,imageId,name:file.name.slice(0,180),type:file.type,parts,size:file.size})).image as ReferenceImage;
}
async function compactOldImage(id:string){
 const response=await fetch(referenceUrl(id));if(!response.ok)throw new Error('旧附件暂未读取，请稍后重试。');
 const original=await response.blob(),src=URL.createObjectURL(original),image=new Image();image.src=src;
 try{
  await image.decode();const scale=Math.min(1,240/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return {data:canvas.toDataURL('image/jpeg',.08),type:'image/jpeg'};
 }catch{
  const {default:JSZip}=await import('jszip');const zip=new JSZip();zip.file('original',original);
  const compact=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:9}});
  if(compact.length>240000)throw new Error('旧附件压缩尚未完成。');
  return {data:'data:application/zip;base64,'+base64(compact),type:'application/zip'};
 }finally{URL.revokeObjectURL(src);}
}
export async function compactRetiredReferences(p:TranslationPractice){
 if(p.status==='draft')return;
 const {images}=await translationGet({retired:p.id});
 for(const image of images as (ReferenceImage&{writingId:string})[]){const compact=await compactOldImage(image.id);await translationApi('archiveReference',{id:image.writingId,imageId:image.id,...compact});}
}
export async function packetImage(q:TranslationQuestion,p:TranslationPractice):Promise<Blob>{
 const images=await Promise.all(p.references.map(async r=>{const image=new Image();image.src=referenceUrl(r.id);await image.decode();return image;}));
 const width=1440,padding=64,bodyWidth=width-padding*2,lines:string[]=[];const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.font='26px sans-serif';
 for(const para of (p.packet||translationPacket(q,p)).split('\n')){let line='';for(const token of para.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^A-Za-z0-9]/gu)||[]){if(ctx.measureText(line+token).width>bodyWidth&&line){lines.push(line);line=token.trimStart();}else line+=token;}lines.push(line);}
 const height=padding*2+lines.length*40+images.reduce((n,i)=>n+i.naturalHeight*bodyWidth/i.naturalWidth+70,0);if(height>30000)throw new Error('图文材料过长，请使用下载送审包，分别附上文字与参考答案。');
 const scale=Math.min(1,Math.sqrt(14000000/(width*height)));canvas.width=Math.floor(width*scale);canvas.height=Math.floor(height*scale);ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.font='26px sans-serif';ctx.fillStyle='#152642';ctx.textBaseline='top';let y=padding;for(const line of lines){ctx.fillText(line,padding,y);y+=40;}for(const [i,image] of images.entries()){ctx.fillStyle='#12658e';ctx.fillText(`参考答案图片 ${i+1}`,padding,y);y+=50;const h=image.naturalHeight*bodyWidth/image.naturalWidth;ctx.drawImage(image,padding,y,bodyWidth,h);y+=h+20;}
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('送审长图生成失败。')),'image/png'));
}
export async function exportTranslation(q:TranslationQuestion,p:TranslationPractice){const {default:JSZip}=await import('jszip');const zip=new JSZip();zip.file('送审材料.md',p.packet||translationPacket(q,p));zip.file('练习记录.json',JSON.stringify(p,null,2));if(p.review){zip.file('原始批阅.md',p.review.original);zip.file('当前批阅.md',p.review.markdown);}await Promise.all(p.references.map(async(r,i)=>{const response=await fetch(referenceUrl(r.id));if(!response.ok)throw new Error('参考答案图片下载失败，未导出不完整材料。');zip.file(`参考答案/${i+1}.${response.headers.get('Content-Type')==='image/png'?'png':response.headers.get('Content-Type')==='image/webp'?'webp':response.headers.get('Content-Type')==='application/zip'?'zip':response.headers.get('Content-Type')==='image/jpeg'?'jpg':r.name.split('.').pop()||'bin'}`,await response.blob());}));return zip.generateAsync({type:'blob'});}
