import {useId,useState} from 'react';
import {Link2,ChevronDown} from 'lucide-react';
import type {ReadingRow} from '../../lib/sentence-reading';
import type {TextAnchor} from '../../lib/review-interactions';
import {READING_LABELS} from '../../lib/sentence-reading';
import {useUnsavedChanges} from '../../hooks/useUnsavedChanges';

interface Props {
 title:string;
 rows:ReadingRow[];
 currentRange?:TextAnchor|null;
 currentText?:string;
 manual?:boolean;
 busy:boolean;
 onSave:(row:ReadingRow|null)=>Promise<boolean>;
}
const CURRENT_RANGE='current-range';
export default function SentenceBinding({title,rows,currentRange,currentText,manual=false,busy,onSave}:Props){
 const matched=rows.filter(row=>currentRange&&row.start<currentRange.end&&row.end>currentRange.start);
 const first=matched[0],last=matched.at(-1);
 const number=(row:ReadingRow)=>String(row.number).padStart(2,'0');
 const rangeLabel=first?`第 ${number(first)}${last&&last.id!==first.id?`–${number(last)}`:''} 句`:'原文片段';
 const method=manual?'手动关联':'自动匹配';
 // An existing paragraph/cross-sentence association stays intact until a sentence is selected.
 const initialChoice=matched.length===1?first.id:currentRange?CURRENT_RANGE:'';
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(initialChoice),[error,setError]=useState('');
 const formId=useId();
 const target=rows.find(row=>row.id===choice);
 useUnsavedChanges(open&&choice!==initialChoice,busy&&open);
 async function save(row:ReadingRow|null){
  if(busy)return;
  setError('');
  if(await onSave(row))setOpen(false);
  else setError('绑定未保存，请查看错误提示后重试。');
 }
 return <>
  <button type="button" className="sentence-binding-trigger" disabled={busy||!rows.length} aria-expanded={open} aria-controls={open?formId:undefined}
   aria-label={currentRange?`${method} · ${rangeLabel}，点击调整关联句子`:`为「${title}」绑定句子`}
   onClick={()=>{setChoice(initialChoice);setError('');setOpen(!open);}}>
   <Link2 size={15} aria-hidden="true"/>
   {currentRange?`${method} · ${rangeLabel}`:'绑定句子'}
   {currentRange&&<ChevronDown size={13} className={open?'sentence-binding-chevron-open':undefined} aria-hidden="true"/>}
  </button>
  {open&&<form id={formId} className="sentence-binding-form" onSubmit={event=>{event.preventDefault();if(target)save(target);}}>
   <strong className="sentence-binding-heading">{currentRange?'调整关联句子':'绑定句子'}</strong>
   {currentRange&&<p className="sentence-binding-current">当前关联：{rangeLabel} · {method}</p>}
   <label>为「{title}」选择句子
    <select aria-label={`为${title}选择绑定句子`} value={choice} disabled={busy} required onChange={event=>setChoice(event.target.value)}>
     <option value="">请选择对应句子</option>
     {currentRange&&matched.length!==1&&<option value={CURRENT_RANGE}>当前关联 · {rangeLabel}（选择句子后再确认调整）</option>}
     {rows.map(row=><option key={row.id} value={row.id}>第 {number(row)} 句 · {READING_LABELS[row.section]} · {row.text}</option>)}
    </select>
   </label>
   {(target||choice===CURRENT_RANGE&&currentText)&&<blockquote className="english">{target?.text||currentText}</blockquote>}
   <p>{currentRange?'确认后改为手动关联，并将这条建议移至所选句子的批注区。':'保存后，这条建议会显示在所选句子的批注区。'}</p>
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="sentence-binding-actions">
    {currentRange&&manual&&<button type="button" className="text-button" disabled={busy} onClick={()=>save(null)}>取消绑定</button>}
    <button type="button" className="button ghost small" disabled={busy} onClick={()=>setOpen(false)}>取消</button>
    <button className="button primary small" disabled={busy||!target}>{busy?'正在保存…':currentRange?'确认调整':'确认绑定'}</button>
   </div>
  </form>}
 </>;
}
