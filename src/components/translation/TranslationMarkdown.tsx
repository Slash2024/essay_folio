import {useEffect,useRef} from 'react';
import MarkdownView from '../folio/MarkdownView';
// Color only the verdict explicitly supplied by the reviewer; never infer correctness from a translation.
export default function TranslationMarkdown({markdown}:{markdown:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const root=ref.current;if(!root)return;const decorate=()=>{for(const table of root.querySelectorAll('table')){const index=Array.from(table.querySelectorAll('thead th')).findIndex(cell=>/^(?:判定|结论|差异判定)/.test(cell.textContent?.trim()||''));if(index<0)continue;for(const row of table.querySelectorAll('tbody tr')){const cell=row.children[index] as HTMLElement|undefined;if(!cell)continue;const value=cell.textContent?.trim()||'';const verdict=/不同但正确|等值.*正确|正确异译|^正确(?:[。．，,、：:]|$)/.test(value)?'correct':/可接受|可以接受|建议优化|可优化/.test(value)?'optional':/确实错误|漏译|错译|需(?:要)?修改|词义错误|需要调整/.test(value)?'error':'';if(verdict)cell.dataset.verdict=verdict;}}};const observer=new MutationObserver(decorate);observer.observe(root,{childList:true,subtree:true});decorate();return()=>observer.disconnect();},[markdown]);
 return <div ref={ref}><MarkdownView markdown={markdown}/></div>;
}
