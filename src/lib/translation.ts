import questionData from '../data/translation-questions.json';
import {extractTranslationTotal} from './translation-review';
export interface TranslationQuestion {id:string;year:number;exam:string;title:string;directions:string;paragraphs:string[];sentences:{number:number;text:string}[];sources:{label:string;url:string}[];checkedAt:string}
export const translationQuestions = questionData as TranslationQuestion[];
export const questionById = new Map(translationQuestions.map(q=>[q.id,q]));
export interface ReferenceImage {id:string;name:string;type:string;width?:number;height?:number;size?:number;archived?:boolean}
export interface TranslationPractice {
 id:string;questionId:string;revision:number;status:'draft'|'submitted'|'reviewed';createdAt:string;updatedAt:string;submittedAt?:string;lastSubmittedReferences?:ReferenceImage[];retiredReferences?:ReferenceImage[];
 answers:string[];answerInput?:string;referenceText:string;references:ReferenceImage[];packet?:string;review?:{original:string;markdown:string;filename:string;importedAt:string;undoMarkdown?:string};
}
export const MAX_TRANSLATION_INPUT_LENGTH=21000;
export function formatTranslationInput(answers:string[]):string {
 return answers.some(answer=>answer.trim())?answers.map((answer,i)=>`${46+i}. ${answer}`).join('\n\n'):'';
}
export function parseTranslationInput(value:unknown):string[] {
 if(typeof value!=='string'||value.length>MAX_TRANSLATION_INPUT_LENGTH)throw new Error('请输入五句译文，整段不超过21000字。');
 const source=value.replace(/\r\n?/g,'\n'),markers=[...source.matchAll(/^[\t ]*(\d{2})[.．][\t ]*/gm)];
 if(!markers.length)throw new Error('未识别到题号。请让五句分别从新的一行开始，以46.、47.、48.、49.、50.开头。');
 if(source.slice(0,markers[0].index).trim())throw new Error('46.之前有未归属的文字，请删除说明文字，或将译文放到对应题号之后。');
 const seen=new Set<number>();
 for(const marker of markers){
  const n=Number(marker[1]);
  if(n<46||n>50)throw new Error(`识别到题号${n}，本题只接受46—50题。`);
  if(seen.has(n))throw new Error(`第${n}题重复，请每个题号只保留一次。`);
  seen.add(n);
 }
 const missing=[46,47,48,49,50].filter(n=>!seen.has(n));
 if(missing.length)throw new Error(`缺少第${missing.join('、')}题，请补齐五个题号及译文。`);
 if(markers.some((marker,i)=>Number(marker[1])!==46+i))throw new Error('题号顺序不正确，请按46.至50.的顺序排列。');
 return markers.map((marker,i)=>{
  const answer=source.slice(marker.index!+marker[0].length,markers[i+1]?.index??source.length).trim();
  if(!answer)throw new Error(`第${46+i}题译文为空，请补充后重新解析。`);
  if(answer.length>4000)throw new Error(`第${46+i}题译文超过4000字，请缩短后重新解析。`);
  return answer;
 });
}
export const practiceIdForQuestion=(questionId:string)=>'tr-'+questionId.replace('translation-','');
export const REVIEW_TITLES=['总分与整体评价','逐句批阅','与参考答案的差异判定','语法理解与纠正','词汇与中文表达建议','完善后的完整译文'];
export const REVIEW_PROMPT=`现在开始正式的批阅：假设你现在是全国研究生考试英语一阅卷组的一名老师 现要求你批改翻译一题（满分10）

考研英语一翻译部分的评分标准和评分档次如下：

评分原则与方法

1. 采点给分：

每个句子被划分为若干采分点（通常为3-4个）。每个采分点分值约为0.5分。

三个错别字扣0.5分。

人名需要音译，人名翻译错误或遗漏扣1分。

2. 综合评判：在遵循“采点给分”的基础上，对译文进行整体评分，重点考量其准确性、完整性和语言流畅性。

评分细则（阅卷执行标准）

· 如果句子译文明显扭曲原文意思，该句得分最多不超过0.5分。

· 如果考生就一个题目提供了两个或两个以上的译文，若均正确，给分；若其中一个译法有错，按错误译文评分。

· 译文中错别字不个别扣分，按整篇累计扣分。在不影响意思的前提下，满三个错别字扣0.5分，无0.25扣分。

各分数档译文特征

· 满分（2分）：准确、完整、通顺。理解正确，译文流畅，完全符合汉语表达习惯，无错译、漏译。

· 1.5分：准确、完整、大体通顺。理解基本正确，译文通顺，有个别错译或漏译。

· 1分：不够准确、不够完整。理解有偏差，译文不够通顺，有数处错译或漏译。

· 0.5分：仅完成部分翻译。只正确翻译出部分词语或句子片段，大部分内容未正确翻译。

· 0分：未作答或译文与原文毫不相关。

需要注意的是，考研英语一翻译部分的评分较为严格，基本不会轻易给出满分。

你的回答应该包含处于0~10分的给分、文章所处的档位、给分依据、语法错误和纠正（请先讲一下语法知识点并给出示例）、词汇表达的建议以及完善后的文章。

 评分示例（仅说明扣分尺度，回答格式参照前文）：I have also almost lost my taste for pictures or music .50) Darwin was convinced that the loss of these tastes was not only a loss of happiness , but might possibly be injurious to the intellect , and more probably to the moral character .(200850)
参考译文：达尔文（著名人名翻译准确）确信（ be convinced that 固定词组），没有了这些爱好（ taste ）不只是少了（ a loss ）乐趣，而且可能会有损于（ be injurious to ）一个人的思维能力（ intellect )，更有可能导致一个人道德品质（ character ）的下降。( and … to 并列带省略）例1达尔文相信这种欣赏能力的丧失不仅是一种快乐的丧失，而且可能对他的智力，更可能对他的道德品格造成损害。(2分）
例2达尔文确信，这些味觉的丧失，不仅仅是一种快乐的丧失，也是对人们智慧的损害，更可能是对道德品质的损害。(1.5分）（味觉翻译错误）
例3达尔文深信，失去了欣赏这些东西的能力，他不仅失去了快乐心情，而且可能是智力，也许还有道德特征。(1分）（不通顺，应该补一个的能力，没有翻译出伤害）
例4达尔文被说了这些松散不仅失去了幸福，而且估计可能对人工智能有伤害，更可能对道德特点有伤害。(0.5分）（错误点：被说服／松散／人工智能／道德特点）
例5达尔文失去这些读写听的能力，对他是一个严重的打击，他失去的不仅是幸福和希望，而且损伤知识分子，更严重的是精神人物的健康。(0分）（句意完全错误）`;
export function translationPacket(q:TranslationQuestion,p:Pick<TranslationPractice,'answers'|'referenceText'|'references'>){
 return `${q.year} 年考研英语一 · 翻译\n\n${REVIEW_PROMPT}\n\n## 真题要求\n${q.directions}\n\n## 完整英文原文（括号中为划线题号）\n${q.paragraphs.join('\n\n')}\n\n## 需翻译的划线内容\n${q.sentences.map(s=>`${s.number}. ${s.text}`).join('\n\n')}\n\n## 考生中文译文\n${p.answers.map((s,i)=>`${46+i}. ${s}`).join('\n\n')}\n\n## 用户指定参考答案\n${p.referenceText.trim()||'参考答案以随附图片为准。'}\n${p.references.length?`随附图片共 ${p.references.length} 张，请同时阅读附件；若未收到图片或无法辨认，请明确说明，勿自行补造参考答案。`:''}`;
}
export interface ReviewSection {index:number;title:string;body:string;start:number;end:number;bodyStart:number}
export function reviewSections(markdown:string):ReviewSection[]{
 const headings:Array<{index:number;title:string;start:number;bodyStart:number}>=[];
 const aliases=[/总分|整体评价|评分与|整体档位/,/逐句|采分点/,/差异|不一致/,/语法|句法/,/词汇|中文表达|用词/,/完整译文|完整修订|完善后的/];
 const re=/^\s{0,3}(?:#{1,2}\s+|\*\*)([^\n]+?)(?:\*\*)?\s*$/gm;let match;
 while((match=re.exec(markdown))){const title=match[1].replace(/\*\*/g,'').trim();const index=aliases.findIndex(a=>a.test(title));if(index>=0&&!headings.some(h=>h.index===index))headings.push({index,title,start:match.index,bodyStart:re.lastIndex});}
 return REVIEW_TITLES.map((title,index)=>{const h=headings.find(x=>x.index===index);if(!h)return {index,title,body:'',start:-1,end:-1,bodyStart:-1};const next=headings.find(x=>x.start>h.start);const end=next?.start??markdown.length;return {index,title,body:markdown.slice(h.bodyStart,end).trim(),start:h.start,end,bodyStart:h.bodyStart};});
}
export function reviewScore(markdown:string):number|null{
 return extractTranslationTotal(markdown);
}
export function replaceReviewSection(markdown:string,index:number,body:string){const s=reviewSections(markdown)[index];if(!s||s.start<0)throw new Error('该部分未被识别，请先重新导入符合结构的批阅。');return markdown.slice(0,s.bodyStart)+'\n\n'+body.trim()+'\n\n'+markdown.slice(s.end);}
export function validScore(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10&&Number.isInteger(value*2);}
export function validateAnswers(value:unknown):string[]{if(!Array.isArray(value)||value.length!==5||value.some(x=>typeof x!=='string'||x.length>4000))throw new Error('请按46—50题填写五段中文译文，每句不超过4000字。');return value as string[];}
