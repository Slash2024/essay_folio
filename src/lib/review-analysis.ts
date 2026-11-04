// A deterministic parser: only explicit content from the imported Markdown is extracted.
export const PARSER_VERSION=1;
export const SECTION_NAMES=['题目要求与完成情况','总体评价','逐句批改','模板基础上的个性化优化','最值得记住的错误','修改后的完整作文','最值得积累的表达','评分'] as const;
export const ISSUE_CATEGORIES=['主谓一致','谓语与句子结构','时态与语态','单复数与冠词','介词与固定搭配','拼写与标点','指代与衔接','词义与主题','论证与任务','字数与格式','其他问题','不计入问题'] as const;
export type IssueCategory=typeof ISSUE_CATEGORIES[number];
export interface ReviewIssue {id:string; evidence:string; suggested:IssueCategory[]; categories:IssueCategory[]; manual:boolean}
export interface ReviewAnalysis { parserVersion:number; sections:(string|null)[]; task:Record<string,string|null>; corrections:{original:string|null;revision:string|null;explanation:string|null}[]; optimizations:{position:string|null;addition:string|null;effect:string|null}[]; issues:ReviewIssue[]; issueSource:'remembered'|'corrections'|'not given'; expressions:{expression:string;usage:string|null}[]; revisedEssay:string|null; reportedWords:string|null; revisedReportedWords:string|null; score:{point:number|null;low:number|null;high:number|null;max:number|null;band:string|null;evidence:string|null;advantages:string|null;deductions:string|null}; source:null; model:null }
export function plain(s:string){return s.replace(/\*\*|__|`/g,'').replace(/\*([^*\n]+)\*/g,'$1').replace(/^\s*>\s?/gm,'').trim();}
const normalize=(s:string)=>plain(s).replace(/^\s*#{1,6}\s*/,'').trim();
function field(block:string|null,labels:string[]):string|null {
  if(!block)return null;
  const lines=block.split('\n');let start=-1,head='';
  for(let i=0;i<lines.length;i++){const t=normalize(lines[i]).replace(/^[-*]\s+/,'');for(const l of labels){const re=new RegExp('^(?:【)?'+l+'(?:】)?\\s*[:：]?\\s*(.*)$');const m=t.match(re);if(m){start=i;head=m[1];break;}}if(start>=0)break;}
  if(start<0)return null;const rest:string[]=[head];
  for(let i=start+1;i<lines.length;i++){const t=normalize(lines[i]);if(/^(?:【[^】]+】|(?:题目要求|是否完成全部任务|是否偏题|字数情况|文体是否正确|预估档次|预估分数|得分优势|主要扣分点|修改为|说明|表达与用法|可用于)\s*[:：])/.test(t))break;rest.push(lines[i]);}
  return rest.join('\n').trim()||null;
}
function units(block:string|null,label:string){if(!block)return [];const lines=block.split('\n'),groups:string[]=[];let g:string[]|null=null;for(const line of lines){if(normalize(line).includes('【'+label+'】')){if(g)groups.push(g.join('\n'));g=[line.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.．、\s]+/,'')];}else if(g)g.push(line);}if(g)groups.push(g.join('\n'));return groups;}
function bulletItems(block:string|null){if(!block)return [];const items:string[]=[];let cur='';for(const l of block.split('\n')){if(/^\s*(?:[-*+·•]|\d+[.．、])\s+/.test(l)){if(cur)items.push(cur.trim());cur=l.replace(/^\s*(?:[-*+·•]|\d+[.．、])\s+/,'');}else if(cur&&l.trim())cur+='\n'+l;}if(cur)items.push(cur.trim());return items;}
export function suggestCategories(evidence:string):IssueCategory[]{
  // Positive problem statements only: a sentence saying “没有语法错误” is not a grammar issue.
  const s=plain(evidence).replace(/[^。；\n]*(?:不是|没有|并非|不构成|并不)[^。；\n]*(?:错误|问题)[^。；\n]*/g,'');
  const rules:[IssueCategory,RegExp][]=[['主谓一致',/主谓一致|复数主语|主语.*复数|parks.*serve|residents.*stand/i],['谓语与句子结构',/缺少.*谓语|限定谓语|句子成分|残句|逗号.*完整句|分词不能|谓语结构/],['时态与语态',/时态|被动语态|主动语态/],['单复数与冠词',/冠词|名词.*单复数|可数名词/],['介词与固定搭配',/固定搭配|from\s+(?:a|2014).*to\s+(?:b|2023)|补全.*to|介词/i],['拼写与标点',/拼写|书写|标点|引号|makeing|secend/i],['指代与衔接',/指代|衔接|承接/],['词义与主题',/词义|主题|论题|动作主体|作用关系|不协调|不够自然/],['论证与任务',/论断|判断.*力|过度推断|论证|结论.*强|任务遗漏|偏题/],['字数与格式',/字数|长度|格式/]];
  return rules.filter(([,r])=>r.test(s)).map(([c])=>c);
}
function stableId(s:string){let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0).toString(36);}
export function parseReview(markdown:string):ReviewAnalysis {
  const sections:(string|null)[]=Array(8).fill(null);let active=-1,buffer:string[]=[];
  function finish(){if(active>=0)sections[active]=buffer.join('\n').trim()||null;buffer=[];}
  for(const line of markdown.replace(/\r\n?/g,'\n').split('\n')){const t=normalize(line),m=t.match(/^([1-8一二三四五六七八])[．.、)）\s]+(.+?)\s*[:：]?$/);let index=-1;if(m){const n='一二三四五六七八'.indexOf(m[1]);const i=n>=0?n:Number(m[1])-1;if(m[2].replace(/\s/g,'').startsWith(SECTION_NAMES[i]))index=i;}if(index<0){const i=SECTION_NAMES.indexOf(t.replace(/[:：]$/,'') as any);if(i>=0)index=i;}if(index>=0){finish();active=index;}else if(active>=0)buffer.push(line);}finish();
  const task=Object.fromEntries(['题目要求','是否完成全部任务','是否偏题','字数情况','文体是否正确'].map(l=>[l,field(sections[0],[l])]));
  const corrections=units(sections[2],'原句').map(b=>{const first=b.split(/【修改与说明】/)[0];const original=plain(first.replace(/^.*?【原句】\s*[:：]?/,''))||null;return {original,revision:field(b,['修改为']),explanation:field(b,['说明'])};});
  const optimizations=units(sections[3],'位置').map(b=>({position:field(b,['位置']),addition:field(b,['可以补充','可以调整']),effect:field(b,['作用'])}));
  const remembered=bulletItems(sections[4]);const issueSource=remembered.length?'remembered':corrections.length?'corrections':'not given';const evidence=remembered.length?remembered:corrections.map(c=>[c.original,c.explanation].filter(Boolean).join('\n'));
  const issues=[...new Set(evidence.map(s=>s.trim()))].map(s=>{const suggested=suggestCategories(s);return {id:stableId(s),evidence:s,suggested,categories:suggested,manual:false};});
  const expressions:{expression:string;usage:string|null}[]=[];
  for(const line of (sections[6]||'').split('\n')){if(!/^\s*\|/.test(line))continue;const cells=line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(s=>s.trim());if(cells.length<2||/^[\s:|-]+$/.test(line)||/表达与用法/.test(cells[0]))continue;if(cells[0])expressions.push({expression:cells[0],usage:cells[1]||null});}
  if(!expressions.length){for(const b of units(sections[6],'表达与用法')){const e=field(b,['表达与用法']);if(e)expressions.push({expression:e,usage:field(b,['可用于'])});}if(!expressions.length&&sections[6]){const parts=sections[6].split(/(?=^\s*(?:\*\*)?表达与用法\s*[:：])/m);for(const b of parts){const e=field(b,['表达与用法']);if(e)expressions.push({expression:e,usage:field(b,['可用于'])});}}}
  const scoreText=field(sections[7],['预估分数']),s=plain(scoreText||''),range=s.match(/(?:区间(?:为|是|[:：])?\s*)?(\d+(?:\.\d+)?)\s*[—–~～-]\s*(\d+(?:\.\d+)?)\s*分?/);
  const ratio=s.match(/(\d+(?:\.\d+)?)\s*分?\s*[/／]\s*(\d+(?:\.\d+)?)\s*分?/);const beforeRange=range?s.slice(0,range.index):s;
  const point=ratio?Number(ratio[1]):beforeRange.match(/(\d+(?:\.\d+)?)\s*分/)?.[1];
  // No midpoint, denominator, band or model is inferred from the exam type or file name.
  const max=ratio?Number(ratio[2]):s.match(/满分\s*(\d+(?:\.\d+)?)\s*分/)?.[1];
  const revisedRaw=sections[5];let revisedEssay:string|null=null;
  if(revisedRaw){const paragraphs=revisedRaw.split(/\n\s*\n/);const english=paragraphs.filter(p=>{const v=plain(p);return /[A-Za-z]{2}/.test(v)&&!/[\u3400-\u9fff]/.test(v)&&!/^#|^\||^---/.test(v);});revisedEssay=english.map(plain).join('\n\n')||null;}
  return {parserVersion:PARSER_VERSION,sections,task,corrections,optimizations,issues,issueSource,expressions,revisedEssay,reportedWords:task['字数情况'],revisedReportedWords:revisedRaw?plain(revisedRaw).match(/(?:约\s*)?\d+\s*词/)?.[0]||null:null,score:{point:point===undefined||point===null?null:Number(point),low:range?Number(range[1]):null,high:range?Number(range[2]):null,max:max===undefined||max===null?null:Number(max),band:field(sections[7],['预估档次']),evidence:scoreText,advantages:field(sections[7],['得分优势']),deductions:field(sections[7],['主要扣分点'])},source:null,model:null};
}
export function applyOverrides(analysis:ReviewAnalysis,overrides?:Record<string,IssueCategory[]>):ReviewAnalysis{return {...analysis,issues:analysis.issues.map(i=>overrides&&Object.hasOwn(overrides,i.id)?{...i,categories:overrides[i.id],manual:true}:i)};}
