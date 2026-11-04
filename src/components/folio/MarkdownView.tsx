import { useEffect, useState } from 'react';
export default function MarkdownView({markdown}:{markdown:string}) {
  const [html,setHtml]=useState('');const [error,setError]=useState('');
  useEffect(()=>{let active=true;Promise.all([import('marked'),import('dompurify')]).then(async([{marked},{default:purify}])=>{const raw=await marked.parse(markdown,{gfm:true,breaks:false});if(active)setHtml(purify.sanitize(raw,{FORBID_TAGS:['style','iframe','form','input','button'],FORBID_ATTR:['style'],ALLOW_DATA_ATTR:false}));}).catch(()=>active&&setError('渲染未成功，可切换到 Markdown 原文查看'));return()=>{active=false;};},[markdown]);
  if(error)return <p className="error">{error}</p>;if(!html)return <p className="muted">正在排版批阅内容…</p>;
  return <div className="markdown" dangerouslySetInnerHTML={{__html:html}}/>;
}
