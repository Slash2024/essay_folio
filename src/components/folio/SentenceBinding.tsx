import {useState} from 'react';
import {Link2,ChevronDown} from 'lucide-react';
import type {ReadingRow} from '../../lib/sentence-reading';
import {READING_LABELS} from '../../lib/sentence-reading';
import {useUnsavedChanges} from '../../hooks/useUnsavedChanges';

interface Props {
 title:string;
 rows:ReadingRow[];
 currentId?:string;
 busy:boolean;
 onSave:(row:ReadingRow|null)=>Promise<boolean>;
}
export default function SentenceBinding({title,rows,currentId,busy,onSave}:Props){
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(currentId||''),[error,setError]=useState('');
 const target=rows.find(row=>row.id===choice);
 const current=rows.find(row=>row.id===currentId);
 useUnsavedChanges(open&&choice!==(currentId||''),busy&&open);
 async function save(row:ReadingRow|null){
  setError('');
  if(await onSave(row))setOpen(false);
  else setError('绑定未保存，请查看错误提示后重试。');
 }
 return <>
  <button type="button" className="sentence-binding-trigger" disabled={busy||!rows.length} aria-expanded={open}
   aria-label={current?`已绑定第 ${current.number} 句，点击更换或取消绑定`:`为「${title}」绑定句子`}
   onClick={()=>{setChoice(currentId||'');setError('');setOpen(!open);}}>
   <Link2 size={15} aria-hidden="true"/>
   {current?`已绑定 · 第 ${current.number} 句`:'绑定句子'}
   {current&&<ChevronDown size={13} aria-hidden="true"/>}
  </button>
  {open&&<form className="sentence-binding-form" onSubmit={event=>{event.preventDefault();if(target)save(target);}}>
   <label>为「{title}」选择句子
    <select aria-label={`为${title}选择绑定句子`} value={choice} disabled={busy} required onChange={event=>setChoice(event.target.value)}>
     <option value="">请选择对应句子</option>
     {rows.map(row=><option key={row.id} value={row.id}>第 {row.number} 句 · {READING_LABELS[row.section]} · {row.text}</option>)}
    </select>
   </label>
   {target&&<blockquote className="english">{target.text}</blockquote>}
   <p>保存后，这条建议会显示在所选句子的批注区。</p>
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="sentence-binding-actions">
    {currentId&&<button type="button" className="text-button" disabled={busy} onClick={()=>save(null)}>取消绑定</button>}
    <button type="button" className="button ghost small" disabled={busy} onClick={()=>setOpen(false)}>取消</button>
    <button className="button primary small" disabled={busy||!target}>{busy?'正在保存…':'确认绑定'}</button>
   </div>
  </form>}
 </>;
}
