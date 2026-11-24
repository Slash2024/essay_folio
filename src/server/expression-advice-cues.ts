import {CUE_VERSION,validateCueUpdates,type AdviceProgress,type AdviceTask,type ExpressionAdvice} from '../lib/expression-advice';
import {AlignmentError,getAnnotationConfig} from './annotation-config';
import {decode,find,put} from './archive';
import {adviceIndex,adviceView} from './expression-advice';
import {requestAdviceJSON} from './expression-advice-provider';
import {CUE_GUIDANCE} from './expression-advice-cue-rules';

export interface CueRepairSummary {updatedCards:number;updatedItems:number;skippedCards:number;pending?:boolean;taskId?:string}
interface CueRepairTask {id:string;status:'pending'|'ready'|'failed';createdAt:string;summary?:CueRepairSummary;error?:string}
export const CUE_REPAIR_PROMPT=`你只负责优化已保存的英语表达调用线索，不重新选表达、不修改例句、不补写范文。
${CUE_GUIDANCE}
输入只给表达条目、应用位置和待修正的旧线索。旧线索里的具体情境是需要抽离的数据，不能照搬；没有提供题干、正文或应用示例，不能编造新的题目情境。
依据固定表达和用法说明确认其功能，再把旧线索的具体应用意图提升到可迁移层次。相同表达且用途相同可保持相近线索，不为差异化添加情境细节。
保留每个id，逐条返回全部线索。只返回JSON：{items:[{id:string,cue:string}]}。`;
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');

export async function repairSavedAdviceCues(requestId:string,onProgress?:(p:AdviceProgress)=>void):Promise<CueRepairSummary> {
 const startedAt=new Date().toISOString();
 const report=(message:string)=>onProgress?.({stage:'validation',message,startedAt,updatedAt:new Date().toISOString()});
 report('正在读取已保存的调用卡，仅准备更新调用线索');
 const {questionIds}=await adviceIndex();
 const views=await Promise.all(questionIds.map(async id=>({questionId:id,view:await adviceView(id)})));
 const cards=views.flatMap(({questionId,view})=>view.result&&view.result.cueVersion!==CUE_VERSION?[{questionId,result:view.result}]:[]);
 if(!cards.length)return {updatedCards:0,updatedItems:0,skippedCards:0};
 const snapshot=await hash(cards.map(c=>[c.result.id,c.result]));
 const baseId='advice-cues-'+await hash([CUE_VERSION,snapshot]);
 const prior=await find(baseId);
 if(prior?.kind==='expressionAdviceCueRepair') {
  const previous=decode<CueRepairTask>(prior);
  if(previous.status==='ready'&&previous.summary)return previous.summary;
  if(previous.status==='pending'&&Date.now()-Date.parse(previous.createdAt)<15*60*1000)return {updatedCards:0,updatedItems:0,skippedCards:0,pending:true,taskId:baseId};
 }
 const id=prior?'advice-cues-'+await hash([baseId,requestId]):baseId;
 const task:CueRepairTask={id,status:'pending',createdAt:startedAt};
 try {await put(id,'expressionAdviceCueRepair',task);}catch(e){const existing=await find(id);if(existing?.kind==='expressionAdviceCueRepair'){const saved=decode<CueRepairTask>(existing);return saved.summary||{updatedCards:0,updatedItems:0,skippedCards:0,pending:true,taskId:id};}throw e;}
 try {
  const config=await getAnnotationConfig();if(!config?.enabled||!config.apiKey)throw new AlignmentError('请先配置并启用现有模型服务',503);
  let number=0;
  const entries=cards.flatMap(card=>card.result.items.map((item,index)=>({id:'cue-'+String(++number).padStart(3,'0'),cardId:card.result.id,index,item})));
  const input={entries:entries.map(({id,item})=>({id,kind:item.entry.kind,expression:item.entry.expression,meaning:item.entry.meaning,notes:item.entry.notes.slice(0,650),category:item.entry.category,stage:item.stage,oldCue:item.cue}))};
  report(`正在优化 ${cards.length} 张卡的 ${entries.length} 条调用线索`);
  const output=await requestAdviceJSON(config,CUE_REPAIR_PROMPT,input,p=>{if(p.receivedCharacters)report('正在接收通用调用线索');});
  const updates=validateCueUpdates(output,entries.map(e=>e.id));
  let updatedCards=0,updatedItems=0,skippedCards=0;
  for(const card of cards) {
   const row=await find(card.result.id);if(row?.kind!=='expressionAdviceRun'){skippedCards++;continue;}
   const saved=decode<AdviceTask>(row);
   // Compare the complete snapshot so concurrent regeneration or repair cannot
   // be overwritten. Persist a patch of cue fields and cue metadata only.
   if(saved.status!=='ready'||!saved.result||await hash(saved.result)!==await hash(card.result)){skippedCards++;continue;}
   const active=await adviceView(card.questionId);if(active.result?.id!==card.result.id){skippedCards++;continue;}
   const mapped=new Map(entries.filter(e=>e.cardId===card.result.id).map(e=>[e.index,updates.get(e.id)!]));
   const result:ExpressionAdvice={...saved.result,items:saved.result.items.map((item,index)=>({...item,cue:mapped.get(index)!})),cueVersion:CUE_VERSION,cueUpdatedAt:new Date().toISOString(),cueModel:config.model};
   await put(row._id,'expressionAdviceRun',{...saved,result},row);
   updatedCards++;updatedItems+=result.items.length;
  }
  const summary={updatedCards,updatedItems,skippedCards};
  const row=await find(id);if(row?.kind==='expressionAdviceCueRepair')await put(id,'expressionAdviceCueRepair',{...task,status:'ready',summary},row);
  report(`已更新 ${updatedCards} 张卡的调用线索，表达和示例保持原样`);
  return summary;
 }catch(e){const row=await find(id);if(row?.kind==='expressionAdviceCueRepair')await put(id,'expressionAdviceCueRepair',{...task,status:'failed',error:e instanceof Error?e.message:'线索修正失败'},row);throw e;}
}
