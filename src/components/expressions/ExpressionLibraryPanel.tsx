import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Download, Upload, CheckCircle2, X, LoaderCircle, MoreHorizontal, Filter, RefreshCw } from 'lucide-react';
import { validateExpressions, type ExpressionLibrary, type SentenceEntry, type WordEntry, type Tolerance } from '../../lib/expressions';
import { api, dateLabel, download } from '../../lib/client';
import type {ExpressionUsage} from '../../lib/expression-usage';
import type {Question} from '../../lib/folio';
import ExpressionEntryCard from './ExpressionEntryCard';
import {expressionKey,type ExpressionPerformance} from '../../lib/expression-performance';
import {performanceRequest} from '../../lib/expression-performance-client';
import {confirmUnsavedNavigation} from '../../lib/navigation';
import {useUnsavedChanges} from '../../hooks/useUnsavedChanges';
import './expression-library.css';
type Tab='sentences'|'words';
type Editor={kind:'sentence';value:SentenceEntry}|{kind:'word';value:WordEntry};
export default function ExpressionLibraryPanel({library,onSave,onRefresh,loading,questions,onOpen,onOpenQuiz}:{onOpenQuiz:(id:string)=>void;questions:Question[];onOpen:(id:string)=>void;library:ExpressionLibrary;onSave:(next:ExpressionLibrary)=>Promise<ExpressionLibrary>;onRefresh:()=>void;loading:boolean}) {
  const [tab,setTab]=useState<Tab>('sentences'),[search,setSearch]=useState(''),[category,setCategory]=useState('');
  const [editor,setEditor]=useState<Editor|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [bulk,setBulk]=useState(false),[bulkText,setBulkText]=useState(''),[bulkCategory,setBulkCategory]=useState('原因 / 自定义');
  const [replacement,setReplacement]=useState<ExpressionLibrary|null>(null);const editorRef=useRef<HTMLElement>(null);
  const editorBaseline=useRef('');
  useUnsavedChanges(!!editor&&JSON.stringify(editor)!==editorBaseline.current||bulk&&!!bulkText.trim()||!!replacement,pending);
  const [usage,setUsage]=useState<ExpressionUsage|null>(null),[usageError,setUsageError]=useState(''),[usageBusy,setUsageBusy]=useState(true),[refresh,setRefresh]=useState(0);
  const [usageFilter,setUsageFilter]=useState('all'),[usageSort,setUsageSort]=useState('default'),[expanded,setExpanded]=useState('');
  useEffect(()=>{
    let active=true;setUsageBusy(true);setUsageError('');setUsage(null);setExpanded('');
    api<{usage:ExpressionUsage}>('expressionUsage',{baseRevision:library.revision}).then(r=>{if(active)setUsage(r.usage);})
      .catch(e=>{if(active)setUsageError((e as Error).message);}).finally(()=>{if(active)setUsageBusy(false);});
    return()=>{active=false;};
  },[library,refresh]);
  const [performance,setPerformance]=useState<ExpressionPerformance|null>(null),[quizBusy,setQuizBusy]=useState(true),[quizError,setQuizError]=useState('');
  const [quizFilter,setQuizFilter]=useState('all'),[listPage,setListPage]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setPerformance(null);setQuizBusy(true);setQuizError('');
    performanceRequest<{performance:ExpressionPerformance}>(library.revision,undefined,0,controller.signal)
      .then(r=>{if(!controller.signal.aborted)setPerformance(r.performance);})
      .catch(e=>{if(!controller.signal.aborted)setQuizError((e as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setQuizBusy(false);});
    return()=>controller.abort();
  },[library,refresh]);
  useEffect(()=>setListPage(0),[tab,search,category,usageFilter,quizFilter,usageSort,library]);
  const quizReady=!quizBusy&&!loading&&performance?.revision===library.revision&&performance.updatedAt===library.updatedAt;
  const recitation=(e:SentenceEntry|WordEntry)=>performance?.entries[expressionKey('template'in e?'sentence':'word',e.id)];
  const filterQuiz=(e:SentenceEntry|WordEntry)=>!quizReady||quizFilter==='all'||(quizFilter==='practiced'?!!recitation(e)?.attempts:!recitation(e)?.attempts);
  const usageReady=!usageBusy&&!loading&&usage?.revision===library.revision&&usage.libraryUpdatedAt===library.updatedAt;
  const count=(id:string)=>usage?.entries[id]?.occurrences||0;
  function filterUsage(e:SentenceEntry|WordEntry){return !usageReady||usageFilter==='all'||(e.enabled&&(usageFilter==='used'?count(e.id)>0:count(e.id)===0));}
  function sortUsage(a:SentenceEntry|WordEntry,b:SentenceEntry|WordEntry){
    if(usageSort.startsWith('quiz-')&&quizReady)return usageSort==='quiz-desc'?(recitation(b)?.attempts||0)-(recitation(a)?.attempts||0):(recitation(a)?.attempts||0)-(recitation(b)?.attempts||0);
    if(usageSort.startsWith('accuracy-')&&quizReady){
      const x=recitation(a)?.accuracy,y=recitation(b)?.accuracy;
      if(x==null||y==null)return x==null?(y==null?0:1):-1;
      return usageSort==='accuracy-asc'?x-y:y-x;
    }
    if(!usageReady||usageSort==='default'||usageSort.startsWith('quiz-')||usageSort.startsWith('accuracy-'))return 0;
    if(a.enabled!==b.enabled)return a.enabled?-1:1;
    return usageSort==='desc'?count(b.id)-count(a.id):count(a.id)-count(b.id);
  }
  const overview=useMemo(()=>{
    const sentenceIds=new Set(library.sentences.map(e=>e.id));let sentences=0,words=0;
    for(const [id,n] of Object.entries(usage?.entries||{}))if(n.occurrences){if(sentenceIds.has(id))sentences++;else words++;}
    return {sentences,words};
  },[library,usage]);
  const disabled=pending||loading;
  const categories=[...new Set(library.sentences.map(e=>e.category))];
  const sentences=library.sentences.filter(e=>(!category||e.category===category)&&`${e.title} ${e.template} ${e.notes}`.toLowerCase().includes(search.toLowerCase())&&filterUsage(e)&&filterQuiz(e)).sort(sortUsage);
  const words=library.words.filter(e=>`${e.term} ${e.meaning} ${e.forms.join(' ')}`.toLowerCase().includes(search.toLowerCase())&&filterUsage(e)&&filterQuiz(e)).sort(sortUsage);
  async function save(next:ExpressionLibrary,success:string){setPending(true);setError('');setMessage('');try{validateExpressions(next);await onSave(next);setMessage(success);return true;}catch(e){setError((e as Error).message);return false;}finally{setPending(false);}}
  function open(value:Editor){if(!confirmUnsavedNavigation())return;editorBaseline.current=JSON.stringify(value);setEditor(value);setBulk(false);setError('');setMessage('');requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}
  function changeTab(next:Tab){if(next===tab||!confirmUnsavedNavigation())return;setTab(next);setEditor(null);setBulk(false);}
  function refreshLibrary(){if(!confirmUnsavedNavigation())return;setEditor(null);setBulk(false);setReplacement(null);onRefresh();}
  function add(){if(tab==='sentences')open({kind:'sentence',value:{id:crypto.randomUUID(),category:'原因 / 自定义',title:'',template:'',notes:'',substitutions:'',enabled:true}});else open({kind:'word',value:{id:crypto.randomUUID(),term:'',meaning:'',forms:[],enabled:true}});}
  async function saveEditor(){if(!editor)return;const next={...library};if(editor.kind==='sentence'){const index=next.sentences.findIndex(e=>e.id===editor.value.id);next.sentences=index<0?[...next.sentences,editor.value]:next.sentences.map(e=>e.id===editor.value.id?editor.value:e);}else{const index=next.words.findIndex(e=>e.id===editor.value.id);next.words=index<0?[...next.words,editor.value]:next.words.map(e=>e.id===editor.value.id?editor.value:e);}if(await save(next,'条目已保存，历史作文将使用最新表达库重新高亮'))setEditor(null);}
  async function remove(id:string){const next={...library,sentences:library.sentences.filter(e=>e.id!==id),words:library.words.filter(e=>e.id!==id)};await save(next,'条目已删除，对应历史高亮会随之更新');}
  async function toggle(id:string){const next={...library,sentences:library.sentences.map(e=>e.id===id?{...e,enabled:!e.enabled}:e),words:library.words.map(e=>e.id===id?{...e,enabled:!e.enabled}:e)};await save(next,'启用状态已更新');}
  async function importLines(){const lines=bulkText.split('\n').map(s=>s.trim()).filter(Boolean);if(!lines.length){setError('请先粘贴需要导入的内容');return;}const next={...library};if(tab==='sentences'){next.sentences=[...library.sentences,...lines.map((line,i)=>({id:crypto.randomUUID(),category:bulkCategory||'自定义',title:`导入句式 ${i+1}`,template:line,notes:'',substitutions:'',enabled:true}))];}else next.words=[...library.words,...lines.map(line=>{const[term,meaning='',forms='']=line.split('|');return{id:crypto.randomUUID(),term:term.trim(),meaning:meaning.trim(),forms:forms.split(/[,，]/).map(s=>s.trim()).filter(Boolean),enabled:true};})];if(await save(next,`已追加 ${lines.length} 条内容`)){setBulk(false);setBulkText('');}}
  async function readBackup(file?:File){if(!file)return;setError('');try{if(file.size>370000)throw new Error('表达库备份请控制在370 KB以内');const parsed=JSON.parse(await file.text());const clean=validateExpressions(parsed);setReplacement({...clean,revision:library.revision,updatedAt:library.updatedAt});}catch(e){setError((e as Error).message);}}
  const filtered=tab==='sentences'?sentences:words,totalPages=Math.max(1,Math.ceil(filtered.length/20)),displayPage=Math.min(listPage,totalPages-1);
  const visible=filtered.slice(displayPage*20,displayPage*20+20),activeFilters=(usageFilter!=='all'?1:0)+(quizFilter!=='all'?1:0);
  return <div className="expression-library expression-performance-library">
    <div className="expression-library-meta"><span className="caption">{library.sentences.length} 条句式 · {library.words.length} 个词条 · v{library.revision}</span><div className="expression-meta-actions"><label className="matching-mode"><span>匹配</span><select aria-label="匹配宽松程度" value={library.tolerance} disabled={disabled} onChange={e=>save({...library,tolerance:e.target.value as Tolerance},'匹配模式已更新')}><option value="strict">严谨</option><option value="balanced">标准</option><option value="loose">宽松</option></select></label><button className="button primary small" disabled={disabled} onClick={add}><Plus size={16}/>新增条目</button><details className="expression-page-menu"><summary className="icon-button" aria-label="表达库更多操作"><MoreHorizontal size={19}/></summary><div><button disabled={disabled} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');if(!confirmUnsavedNavigation())return;setBulk(!bulk);setEditor(null);setError('');}}>批量追加</button><button disabled={disabled} onClick={refreshLibrary}>刷新云端版本</button></div></details></div></div>
    <section className="panel expression-performance-overview" aria-label="表达表现">
      <div className="expression-overview-title"><h2>表达表现</h2><button className="text-button" disabled={usageBusy||quizBusy||loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={13}/>刷新</button></div>
      <div className="expression-overview-metrics"><div><span>写作已使用</span><strong>{usageReady?overview.sentences+overview.words:usageBusy||loading?'…':'—'}</strong></div><div><span>已默写条目</span><strong>{quizReady?performance.overview.practiced:quizBusy||loading?'…':'—'}</strong></div><div><span>默写总体准确率</span><strong className="metric-accuracy">{quizReady&&performance.overview.accuracy!==null?`${performance.overview.accuracy}%`:'—'}</strong></div></div>
      <p className="caption expression-overview-caption">默写按首次提交作答统计，未提交不计次数。{quizReady&&!performance.overview.attempts?'当前尚无已归属单条的作答记录。':''}</p>
      {quizReady&&performance.overview.shared>0&&<p className="caption expression-overview-caption">另有 {performance.overview.shared} 次同题多表达作答无法归属单条，明细可查，不计入以上统计。</p>}
      {(usageError||quizError)&&!loading&&<p className="error expression-overview-caption" role="alert">{usageError||quizError}<button className="text-button" onClick={refreshLibrary}>刷新云端版本</button></p>}
      <details className="expression-stat-explanation"><summary>统计口径</summary><p>写作使用按已提交、已批阅稿件最新正文及当前匹配模式重新计算，含近似命中，不含草稿与历史版本；停用条目不参与写作匹配。默写按当前条目英文内容汇总首次作答，“想不起来”计为未答对；准确率采用复核后结论，待复核不计分母。补充重练单列，新轮次的错题重练计为新的首次作答。</p>{usageReady&&<p>写作统计覆盖 {usage.writingCount} 稿，{overview.sentences} 条句式、{overview.words} 个词条已使用。更新于 {dateLabel(usage.computedAt)}。</p>}</details>
    </section>
    <div className="expression-toolbar"><div className="segmented expression-tabs"><button className={tab==='sentences'?'selected':''} onClick={()=>changeTab('sentences')} disabled={disabled}>句式 {library.sentences.length}</button><button className={tab==='words'?'selected':''} onClick={()=>changeTab('words')} disabled={disabled}>单词／短语 {library.words.length}</button></div></div>
    {error&&<p className="expression-feedback error" role="alert">{error}</p>}{message&&<p className="expression-feedback success" role="status">{message}</p>}
    {editor&&<section ref={editorRef} className="panel expression-editor"><div className="panel-heading"><h2>{editor.kind==='sentence'?'编辑句式模板':'编辑单词／短语'}</h2><button className="icon-button" aria-label="关闭条目编辑" disabled={disabled} onClick={()=>{if(confirmUnsavedNavigation())setEditor(null);}}><X size={18}/></button></div><form onSubmit={e=>{e.preventDefault();saveEditor();}}>{editor.kind==='sentence'?<><div className="expression-editor-meta"><label>分类<input aria-label="句式分类" value={editor.value.category} onChange={e=>setEditor({...editor,value:{...editor.value,category:e.target.value}})} maxLength={100} required/></label><label>标题<input aria-label="句式标题" value={editor.value.title} onChange={e=>setEditor({...editor,value:{...editor.value,title:e.target.value}})} maxLength={120} required/></label></div><label>句式模板<textarea aria-label="句式模板" className="english" value={editor.value.template} onChange={e=>setEditor({...editor,value:{...editor.value,template:e.target.value}})} maxLength={1800} required/></label><p className="caption">填空使用 {'{{对象}}'}、{'{{行动}}'} 等，也支持 [A] 和省略号。只有固定英文部分参与高亮。</p><label>说明与填空示例<textarea aria-label="句式说明" value={editor.value.notes} onChange={e=>setEditor({...editor,value:{...editor.value,notes:e.target.value}})} maxLength={3000}/></label><label>补充替换组<textarea aria-label="句式替换组" value={editor.value.substitutions} onChange={e=>setEditor({...editor,value:{...editor.value,substitutions:e.target.value}})} placeholder="important | significant | crucial\n每行一组单词" maxLength={1200}/></label></>:<><label>单词或短语<input aria-label="单词或短语" value={editor.value.term} onChange={e=>setEditor({...editor,value:{...editor.value,term:e.target.value}})} maxLength={220} required/></label><label>中文含义／备注<input aria-label="词条含义" value={editor.value.meaning} onChange={e=>setEditor({...editor,value:{...editor.value,meaning:e.target.value}})} maxLength={500}/></label><label>补充变体<textarea aria-label="词条补充变体" value={editor.value.forms.join('\n')} onChange={e=>setEditor({...editor,value:{...editor.value,forms:e.target.value.split('\n')}})} placeholder="每行一个词形、派生词或短语变体"/></label><p className="caption">常见词形与内置词族自动识别，特殊派生词和短语变体可在这里补充。</p></>}<label className="expression-enabled"><input type="checkbox" checked={editor.value.enabled} onChange={e=>setEditor(editor.kind==='sentence'?{kind:'sentence',value:{...editor.value,enabled:e.target.checked}}:{kind:'word',value:{...editor.value,enabled:e.target.checked}})}/>启用此条目</label><div className="expression-editor-actions"><button type="button" className="button ghost" disabled={disabled} onClick={()=>{if(confirmUnsavedNavigation())setEditor(null);}}>取消编辑</button><button className="button primary" disabled={disabled}>{pending?<LoaderCircle className="spin" size={16}/>:<CheckCircle2 size={16}/>}保存条目</button></div></form></section>}
    {bulk&&<section className="panel expression-editor"><h2>批量追加{tab==='sentences'?'句式':'词条'}</h2><p className="muted">{tab==='sentences'?'每行一条模板，填空用 {{名称}}。追加导入不会覆盖现有条目。':'每行一个词条，可用“英文 | 中文含义 | 变体1,变体2”格式。'}</p>{tab==='sentences'&&<label>导入分类<input aria-label="批量导入分类" value={bulkCategory} onChange={e=>setBulkCategory(e.target.value)}/></label>}<textarea aria-label="批量导入内容" value={bulkText} onChange={e=>setBulkText(e.target.value)} maxLength={150000}/><div className="expression-editor-actions"><button className="button ghost" disabled={disabled} onClick={()=>setBulk(false)}>取消导入</button><button className="button primary" disabled={disabled} onClick={importLines}>追加到表达库</button></div></section>}
    <div className="expression-browse-controls"><label className="search-input"><Search size={17}/><input aria-label="搜索表达库" placeholder="搜索表达或说明" value={search} onChange={e=>setSearch(e.target.value)}/></label>{tab==='sentences'&&<select aria-label="筛选表达分类" value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select>}
      <details className="expression-filter-popover"><summary><Filter size={15}/>筛选{activeFilters?` · ${activeFilters}`:''}</summary><div><label>写作使用<select aria-label="筛选表达使用情况" value={usageFilter} disabled={!usageReady} onChange={e=>setUsageFilter(e.target.value)}><option value="all">全部使用情况</option><option value="used">已使用</option><option value="unused">未使用</option></select></label><label>默写表现<select aria-label="筛选默写情况" value={quizFilter} disabled={!quizReady} onChange={e=>setQuizFilter(e.target.value)}><option value="all">全部默写情况</option><option value="practiced">已默写</option><option value="unpracticed">未默写</option></select></label><button className="text-button" onClick={()=>{setUsageFilter('all');setQuizFilter('all');}}>清除筛选</button></div></details>
      <select aria-label="表达表现排序" value={usageSort} onChange={e=>setUsageSort(e.target.value)}><option value="default">默认排序</option><option value="desc" disabled={!usageReady}>写作次数从高到低</option><option value="asc" disabled={!usageReady}>写作次数从低到高</option><option value="quiz-desc" disabled={!quizReady}>默写次数从高到低</option><option value="quiz-asc" disabled={!quizReady}>默写次数从低到高</option><option value="accuracy-asc" disabled={!quizReady}>准确率从低到高</option><option value="accuracy-desc" disabled={!quizReady}>准确率从高到低</option></select></div>
    <p className="caption expression-list-count">显示 {filtered.length} 条{activeFilters?' · 已应用筛选':''}</p>
    <section className="expression-card-list" aria-label="表达条目列表">{visible.map(e=><ExpressionEntryCard key={`${e.id}-${library.revision}-${refresh}`} entry={e} usage={usage?.entries[e.id]} recitation={recitation(e)} usageReady={usageReady} quizReady={quizReady} usageBusy={usageBusy||loading} quizBusy={quizBusy||loading} disabled={disabled} expanded={expanded===e.id} revision={library.revision} questions={questions} onExpand={()=>setExpanded(expanded===e.id?'':e.id)} onEdit={()=>open('template'in e?{kind:'sentence',value:{...e}}:{kind:'word',value:{...e,forms:[...e.forms]}})} onToggle={()=>toggle(e.id)} onRemove={()=>remove(e.id)} onOpen={onOpen} onOpenQuiz={onOpenQuiz}/>)}{!filtered.length&&<div className="panel empty-state"><Search size={28}/><p>暂无符合条件的条目</p></div>}</section>
    {filtered.length>20&&<div className="pagination expression-list-pagination"><button className="button ghost small" disabled={!displayPage} onClick={()=>{setListPage(displayPage-1);setExpanded('');}}>上一页</button><span>{displayPage+1} / {totalPages}</span><button className="button ghost small" disabled={displayPage+1>=totalPages} onClick={()=>{setListPage(displayPage+1);setExpanded('');}}>下一页</button></div>}
    <section className="panel expression-backup"><div><h2>表达库备份</h2><p className="muted">单独备份模板、词条与匹配设置。作文档案 ZIP 仍只包含题目、写作和批阅。</p></div><div className="expression-tools"><button className="button outline small" disabled={disabled} onClick={()=>download(JSON.stringify(library,null,2),'英语表达库.json','application/json;charset=utf-8')}><Download size={16}/>导出表达库</button><label className="button outline small"><Upload size={16}/>导入备份<input hidden disabled={disabled} type="file" accept=".json,application/json" onChange={e=>{readBackup(e.target.files?.[0]);e.target.value='';}}/></label><button className="text-button" disabled={disabled} onClick={refreshLibrary}>刷新云端版本</button></div></section>
    {replacement&&<section className="panel expression-editor"><h2>替换为备份中的表达库？</h2><p>备份包含 {replacement.sentences.length} 条句式、{replacement.words.length} 个词条。建议先导出当前版本留存。</p><div className="expression-editor-actions"><button className="button ghost" disabled={disabled} onClick={()=>setReplacement(null)}>取消替换</button><button className="button danger" disabled={disabled} onClick={async()=>{if(await save({...replacement,revision:library.revision},'备份已恢复，历史高亮将重新计算'))setReplacement(null);}}>确认替换表达库</button></div></section>}
    {!!library.sourceText&&<details className="panel expression-original"><summary>查看最初提供的“原因”素材</summary><pre>{library.sourceText}</pre></details>}
  </div>;
}
