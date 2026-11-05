import type { Question } from './folio';
import { practiceQuestion, ENGLISH_TWO_PRACTICE_NOTE, reviewPrompt, questionYearLabel, DEFAULT_RUBRICS, reviewPackage, typeName, examName, templateKey, rubricLabel } from './folio';
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function loadImage(src:string) {const image=new Image();image.src=src;await image.decode();return image;}
export async function makePacket(q:Question,text:string,prompt:string,rubric:string=DEFAULT_RUBRICS[templateKey(q)]):Promise<Blob> {
  q=practiceQuestion(q);
  const images=await Promise.all(q.images.map(loadImage));const width=1440,padding=72,bodyWidth=width-2*padding;
  const measure=document.createElement('canvas').getContext('2d')!;
  const segments:{text?:string;image?:HTMLImageElement;font?:string;line?:number;color?:string;gap?:number}[]=[];
  function block(value:string,font:string,line:number,color='#152642',gap=28){measure.font=font;for(const paragraph of value.split('\n')){if(!paragraph){segments.push({gap:line/2});continue;}let current='';const tokens=paragraph.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[^A-Za-z0-9]/gu)||[];for(const token of tokens){if(measure.measureText(current+token).width>bodyWidth&&current){segments.push({text:current,font,line,color});current=token.trimStart();}else current+=token;}if(current)segments.push({text:current,font,line,color});}segments.push({gap});}
  block(`${questionYearLabel(q)} · 考研${examName(q)} · ${typeName(q.type)}`,'bold 36px sans-serif',52,'#087c77');
  if(q.exam==='two')block(ENGLISH_TWO_PRACTICE_NOTE,'24px sans-serif',38,'#087c77');
  block('批阅提示词','bold 29px sans-serif',44);block(reviewPrompt(q,prompt),'24px sans-serif',38);
  block(rubricLabel(q),'bold 29px sans-serif',44);block(rubric,'24px sans-serif',38);
  block(q.exam==='two'?'完整题目（练习适配版）':'完整题目','bold 29px sans-serif',44);block(q.directions,'26px Georgia, serif',40);
  for(const image of images)segments.push({image,gap:30});
  block('我的作文','bold 29px sans-serif',44);block(text,'28px Georgia, serif',43);
  block('请结合以上完整材料进行批阅，并输出 Markdown。','24px sans-serif',38,'#536779');
  const height=Math.ceil(padding*2+segments.reduce((n,s)=>n+(s.image?s.image.height*Math.min(bodyWidth/s.image.width,1.8)+(s.gap||0):s.line||s.gap||0),0));
  if(height>30000)throw new Error('送审长图过长，请精简本次提示词，或改用文字与题图分别复制');
  // Keep long user-supplied prompts legible while bounding canvas memory on phones.
  const scale=Math.min(1,Math.sqrt(12000000/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.floor(width*scale);canvas.height=Math.floor(height*scale);const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.textBaseline='top';let y=padding;
  for(const s of segments){if(s.image){const scale=Math.min(bodyWidth/s.image.width,1.8),w=s.image.width*scale,h=s.image.height*scale;ctx.drawImage(s.image,(width-w)/2,y,w,h);y+=h+(s.gap||0);}else if(s.text){ctx.font=s.font!;ctx.fillStyle=s.color!;ctx.fillText(s.text,padding,y);y+=s.line!;}else y+=s.gap||0;}
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('送审图片生成失败')),'image/png'));
}
export async function copyPacket(q:Question,text:string,prompt:string,packet?:Blob,rubric:string=DEFAULT_RUBRICS[templateKey(q)]) {
  if(!navigator.clipboard)throw new Error('当前浏览器不支持剪贴板操作，请使用 HTTPS 页面');
  const plain=reviewPackage(q,text,prompt,rubric);
  if(!q.images.length){await navigator.clipboard.writeText(plain);return '文字已复制，可直接粘贴送审';}
  if(!packet)throw new Error('图文材料还在准备，请稍后再复制');
  const imageUrl=URL.createObjectURL(packet);
  try {
    const html=`<article><h1>${questionYearLabel(q)} ${examName(q)} · ${typeName(q.type)}</h1><div style="white-space:pre-wrap">${escape(plain)}</div>${q.images.map(src=>`<img src="${new URL(src,location.origin).href}" alt="原题图"/>`).join('')}</article>`;
    await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plain],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'}),'image/png':packet})]);
    return '完整图文已复制。粘贴后请确认题图或完整送审长图已附带';
  } finally {URL.revokeObjectURL(imageUrl);}
}
