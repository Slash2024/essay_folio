import type {WritingVersion} from './revisions';
import type { Question, Writing, Review } from './folio';
import { ENGLISH_TWO_PRACTICE_NOTE, typeName, examName } from './folio';
import { api, download } from './client';
export async function exportArchive() {
  const [{default:JSZip},data]=await Promise.all([import('jszip'),api<{questions:Question[];writings:(Writing & {versions:WritingVersion[]})[];reviews:Review[]}>('export')]);
  const zip=new JSZip();
  const portableQuestions=data.questions.map(q=>({...q,images:q.images.map(src=>`${q.id}/${src.split('/').pop()}`)}));
  zip.file('题目/index.json',JSON.stringify(portableQuestions,null,2));
  zip.file('写作/index.json',JSON.stringify(data.writings,null,2));
  zip.file('批阅/index.json',JSON.stringify(data.reviews,null,2));
  await Promise.all(data.questions.map(async q=>{const dir=`题目/${q.id}/`;const images:string[]=[];for(const src of q.images){const name=src.split('/').pop()!;const r=await fetch(src);if(!r.ok)throw new Error(`${q.year} 年题图下载失败，导出未完成，请重试`);zip.file(dir+name,await r.blob());images.push(`![原题图](${name})`);}zip.file(dir+'题目.md',`# ${q.year} 年${examName(q)} · ${typeName(q.type)}\n\n${q.exam==='two'?ENGLISH_TWO_PRACTICE_NOTE+'\n\n':''}${q.directions}${q.originalDirections?'\n\n## 原题要求（仅供来源核对）\n\n'+q.originalDirections:''}\n\n${images.join('\n\n')}\n\n来源：${q.source}\n`);}));
  for(const w of data.writings){zip.file(`写作/${w.id}/作文.txt`,w.text);zip.file(`写作/${w.id}/修改记录.json`,JSON.stringify(w.versions||[],null,2));for(const v of w.versions||[])zip.file(`写作/${w.id}/版本/V${v.version}.txt`,v.text);}
  for(const r of data.reviews){const name=r.filename.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)||'批阅.md';zip.file(`批阅/${r.writingId}/${r.id}/${name.endsWith('.md')?name:name+'.md'}`,r.markdown);zip.file(`批阅/${r.writingId}/${r.id}/结构化分析.json`,JSON.stringify({analysis:r.analysis,issueOverrides:r.issueOverrides,analysisUpdatedAt:r.analysisUpdatedAt,revisionId:r.revisionId,binding:r.binding,study:r.study,curation:r.curation,alignments:r.alignments},null,2));zip.file(`批阅/${r.writingId}/${r.id}/人工整理历史.json`,JSON.stringify(r.curationHistory||[],null,2));}
  const csv=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  zip.file('写作/记录索引.csv','\ufeff'+[['记录编号','题目编号','状态','创建时间','提交时间','上一稿编号'],...data.writings.map(w=>[w.id,w.questionId,w.status,w.createdAt,w.submittedAt,w.parentId])].map(row=>row.map(csv).join(',')).join('\r\n'));
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});download(blob,`英语作文档案-${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}.zip`);
  return {questions:data.questions.length,writings:data.writings.length,reviews:data.reviews.length};
}
