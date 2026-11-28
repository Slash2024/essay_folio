import {useEffect,useRef} from 'react';
import MarkdownView from '../folio/MarkdownView';
import {translationVerdict} from '../../lib/translation-verdict';
// Color only the verdict explicitly supplied by the reviewer; never infer correctness from a translation.
export default function TranslationMarkdown({markdown}:{markdown:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const root=ref.current;if(!root)return;const decorate=()=>{for(const table of root.querySelectorAll('table')){const index=Array.from(table.querySelectorAll('thead th')).findIndex(cell=>/^(?:判定|结论|差异判定)/.test(cell.textContent?.trim()||''));if(index<0)continue;for(const row of table.querySelectorAll('tbody tr')){const cell=row.children[index] as HTMLElement|undefined;if(!cell)continue;const verdict=translationVerdict(cell.textContent||'');if(verdict)cell.dataset.verdict=verdict;else delete cell.dataset.verdict;}}};const observer=new MutationObserver(decorate);observer.observe(root,{childList:true,subtree:true});decorate();return()=>observer.disconnect();},[markdown]);
 return <div ref={ref}><MarkdownView markdown={markdown}/></div>;
}
