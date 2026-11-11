import {APPEAL_CRITERIA,type AppealMaterials} from '../../lib/annotation-appeal';

interface Props {
 materials:AppealMaterials;
 includeContext:boolean;
 includeTask:boolean;
 includeWordRule:boolean;
 rubricBand:string;
 disabled:boolean;
 onContextChange:(value:boolean)=>void;
 onTaskChange:(value:boolean)=>void;
 onWordRuleChange:(value:boolean)=>void;
 onRubricChange:(value:string)=>void;
}
export default function AppealMaterialsOptions({materials,includeContext,includeTask,includeWordRule,rubricBand,disabled,onContextChange,onTaskChange,onWordRuleChange,onRubricChange}:Props){
 const previews:{title:string;text:string;english?:boolean}[]=[];
 if(includeContext&&materials.context)previews.push({title:'前后句',text:[materials.context.previous,materials.context.next].filter(Boolean).join('\n'),english:true});
 if(includeTask&&materials.task)previews.push({title:'题目文字要求',text:materials.task,english:true});
 if(includeWordRule&&materials.wordRule)previews.push({title:'字数与扣分条款',text:materials.wordRule});
 const selectedBand=rubricBand!==''?materials.rubricBands[Number(rubricBand)]:undefined;
 if(selectedBand)previews.push({title:'评分档次原文',text:selectedBand});
 return <section className="appeal-material-options" aria-label="补充复核材料">
  <header className="appeal-material-options-heading"><h3>补充复核材料</h3><span>可选</span><span className="appeal-material-count" role="status">{previews.length?`已附加 ${previews.length} 项`:'未附加材料'}</span></header>
  <p className="appeal-material-intro">已默认使用考研英语复核准则，可按争议内容补充以下材料。</p>
  <div className="appeal-material-options-grid">
   {materials.context&&<label className="appeal-material-option"><input type="checkbox" aria-label="附带前后句" checked={includeContext} disabled={disabled} onChange={event=>onContextChange(event.target.checked)}/><span><strong>附带前后句</strong><small>核对上下文、指代与衔接。</small></span></label>}
   {materials.task&&<label className="appeal-material-option"><input type="checkbox" aria-label="附带题目文字要求" checked={includeTask} disabled={disabled} onChange={event=>onTaskChange(event.target.checked)}/><span><strong>附带题目文字要求</strong><small>核对写作任务与题目限制。</small></span></label>}
   {materials.wordRule&&<label className="appeal-material-option"><input type="checkbox" aria-label="附带字数与扣分条款" checked={includeWordRule} disabled={disabled} onChange={event=>onWordRuleChange(event.target.checked)}/><span><strong>附带字数与扣分条款</strong><small>核对字数及相关扣分依据。</small></span></label>}
   {materials.rubricBands.length>0&&<label className="appeal-material-option appeal-material-band"><strong>评分档次原文</strong><small>按需附带对应档次描述。</small><select aria-label="附带评分档次原文" value={rubricBand} disabled={disabled} onChange={event=>onRubricChange(event.target.value)}><option value="">不附带</option>{materials.rubricBands.map((band,index)=><option key={band} value={index}>{band.split(/[：:]/,1)[0]}</option>)}</select></label>}
  </div>
  <div className="appeal-material-disclosures">
   <details><summary>查看已选材料 · {previews.length} 项</summary>
    {previews.length?previews.map(item=><section className="appeal-material-preview" key={item.title}><h4>{item.title}</h4><p className={item.english?'english':undefined}>{item.text}</p>{item.title==='题目文字要求'&&<small>涉及题图内容时，可把相关文字或数值写入申诉理由。</small>}</section>):<p className="appeal-material-empty">尚未附加材料，可在上方按需选择。</p>}
   </details>
   <details><summary>查看本次复核准则 <span>{materials.type==='large'?'大作文':'小作文'}</span></summary><p className="appeal-material-criteria">{APPEAL_CRITERIA[materials.type]}</p></details>
  </div>
 </section>;
}
