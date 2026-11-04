import {useMemo,useState} from 'react';
import {ArrowRight,CheckCircle2,LoaderCircle} from 'lucide-react';
import {applyPunctuationSuggestions,type PunctuationCheck as Check} from '../../lib/punctuation-check';
const visible=(value:string)=>value?value.replaceAll(' ','[空格]').replaceAll('\u00a0','[不换行空格]').replaceAll('\u3000','[全角空格]').replaceAll('\t','[Tab]'):'（空）';
export default function PunctuationCheck({check,busy,error,confirmLabel,onConfirm,onBack}:{check:Check;busy:boolean;error:string;confirmLabel:string;onConfirm:(text:string)=>void;onBack:()=>void}){
 const [limit,setLimit]=useState(100);
 const [selected,setSelected]=useState(()=>new Set(check.suggestions.map(s=>s.id)));
 const preview=useMemo(()=>applyPunctuationSuggestions(check,selected),[check,selected]);
 return <div className="punctuation-check"><p className="punctuation-intro">只检查中文标点与空格。不会纠正拼写、语法、大小写，也不增删标点或替换标点类型。换行和行首缩进保留。</p>
 <div className="punctuation-summary"><strong>{check.suggestions.length?`${check.suggestions.length} 处修改建议`:'未发现可自动处理的标点或空格问题'}</strong><span aria-live="polite">已选 {selected.size} / {check.suggestions.length} 处</span></div>
 {!!check.suggestions.length&&<><div className="punctuation-selection"><span>建议用 [空格]、[全角空格]、[不换行空格]、[Tab] 显示不可见空白；（空）表示删除为空。</span><div><button className="text-button" disabled={busy} onClick={()=>setSelected(new Set(check.suggestions.map(s=>s.id)))}>全选建议</button><button className="text-button" disabled={busy} onClick={()=>setSelected(new Set())}>取消全选</button></div></div><ul className="punctuation-suggestions">{check.suggestions.slice(0,limit).map((s,i)=><li key={s.id}><label><input type="checkbox" aria-label={`应用第${i+1}处修改`} checked={selected.has(s.id)} disabled={busy} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(s.id);else next.delete(s.id);return next;})}/><span><small>第 {s.line} 行 · 第 {s.column} 列</small><span className="punctuation-change"><code>{visible(s.before)}</code><ArrowRight size={14}/><code>{visible(s.after)}</code></span><span className="punctuation-reason">{s.reasons.join('；')}</span></span></label></li>)}</ul>{check.suggestions.length>limit&&<button className="text-button" onClick={()=>setLimit(limit+100)}>显示更多建议（已显示 {limit} / {check.suggestions.length}；未展开建议也按勾选状态应用）</button>}</>}
 {!!check.warnings.length&&<details className="punctuation-warnings" open><summary>{check.warnings.length} 处需要人工核对</summary><ul>{check.warnings.map((w,i)=><li key={`${w.start}-${i}`}>第 {w.line} 行：{w.message}</li>)}</ul><p>这些提示不会增加或删除任何标点；可返回编辑后重新检查。</p></details>}
 <div className="punctuation-preview-grid"><section><h3>检查前原文</h3><pre className="english" data-punctuation-original>{check.source}</pre></section><section><h3>应用所选建议后的预览</h3><pre className="english" data-punctuation-preview aria-live="polite">{preview}</pre></section></div>
 <p className="caption punctuation-consent">确认前不会应用修改。取消勾选的建议不会应用；正文以此处预览为准。</p>{error&&<p className="error" role="alert">{error}</p>}
 <div className="modal-actions"><button className="button ghost" disabled={busy} onClick={onBack}>返回编辑</button><button className="button primary" disabled={busy} onClick={()=>onConfirm(preview)}>{busy?<LoaderCircle size={17} className="spin"/>:<CheckCircle2 size={17}/>} {confirmLabel}</button></div>
 </div>;
}
