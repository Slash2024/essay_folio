import type { Dispatch, SetStateAction } from 'react';
import { ArrowUpRight, RefreshCw, Search, X } from 'lucide-react';
import { LARGE_ESSAY_CATEGORIES, SMALL_ESSAY_CATEGORIES, questionYearLabel, examName, questionCategories, typeName, type Question } from '../../lib/folio';

const scopes = [
  { id: '', label: '全部题目' },
  { id: 'one-large', label: '英语一 · 大作文' },
  { id: 'one-small', label: '英语一 · 小作文' },
  { id: 'two-large', label: '英语二 · 大作文' },
] as const;
const englishTwoCategories = ['柱状图','条形图','饼图','曲线图','表格','材料类'];
const matchesScope = (q: Question, scope: string) => !scope || `${q.exam || 'one'}-${q.type}` === scope;

export interface LibraryFilters { scope: string; category: string; year: string; search: string }
export function QuestionLibrary({ questions, busy, onStart, filters, setFilters }: { questions: Question[]; busy: boolean; onStart: (question: Question) => unknown; filters: LibraryFilters; setFilters: Dispatch<SetStateAction<LibraryFilters>> }) {
  const { scope, category, year, search } = filters;
  const setCategory = (category: string) => setFilters(old => ({...old, category}));
  const setYear = (year: string) => setFilters(old => ({...old, year}));
  const setSearch = (search: string) => setFilters(old => ({...old, search}));
  const scopeQuestions = questions.filter(q => matchesScope(q, scope));
  const years = [...new Set(scopeQuestions.map(q => q.year).filter((y): y is number => y !== null))].sort((a,b) => b-a);
  const keyword = search.trim().toLowerCase();
  const baseQuestions = scopeQuestions.filter(q => (!year || (year === 'supplement' ? q.year === null : q.year === Number(year))) && (!keyword || `${questionYearLabel(q)} ${examName(q)} ${typeName(q.type)} ${questionCategories(q).join(' ')} ${q.title} ${q.directions}`.toLowerCase().includes(keyword)));
  const results = baseQuestions.filter(q => !category || questionCategories(q).includes(category));
  const categories = scope === 'one-small' ? SMALL_ESSAY_CATEGORIES : scope === 'one-large' ? LARGE_ESSAY_CATEGORIES : scope === 'two-large' ? englishTwoCategories : [];
  const categoryLabel = scope === 'one-small' ? '写作类别' : scope === 'two-large' ? '作文分类' : '主题分类';
  const active = !!(scope || year || keyword || category);
  function changeScope(next: string) {
    setFilters(old => ({...old, scope: next, category: '', year: old.year && !questions.some(q => matchesScope(q,next) && (old.year === 'supplement' ? q.year === null : q.year === Number(old.year))) ? '' : old.year}));
  }
  function reset() { setFilters({scope: '', category: '', year: '', search: ''}); }

  return <>
    <section className="panel library-filters" aria-label="真题筛选">
      <div className="library-scopes" role="group" aria-label="卷别与题型">
        {scopes.map(item => <button key={item.id} className={scope === item.id ? 'selected' : ''} aria-pressed={scope === item.id} onClick={() => changeScope(item.id)}>{item.label}<span>{questions.filter(q => matchesScope(q,item.id)).length}</span></button>)}
      </div>
      <div className="library-search-row">
        <label className="library-search-label"><span>关键词</span><span className="search-input"><Search size={17}/><input aria-label="搜索真题" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索年份、类别、主题或题干"/>{search && <button className="icon-button" aria-label="清空真题搜索" onClick={() => setSearch('')}><X size={15}/></button>}</span></label>
        <label className="library-year-label"><span>年份</span><select aria-label="筛选年份" value={year} onChange={e => setYear(e.target.value)}><option value="">全部年份</option>{years.map(y => <option key={y} value={y}>{y}</option>)}{scopeQuestions.some(q => q.year === null) && <option value="supplement">补充题（未标年份）</option>}</select></label>
      </div>
      {scope ? <div className="library-category-group" role="group" aria-label={categoryLabel}>
        <span className="library-field-label">{categoryLabel}</span>
        <div className="library-categories">
          <button aria-pressed={!category} className={!category ? 'selected' : ''} onClick={() => setCategory('')}>全部<span>{baseQuestions.length}</span></button>
          {categories.map(value => <button key={value} aria-pressed={category === value} className={category === value ? 'selected' : ''} onClick={() => setCategory(value)}>{value}<span>{baseQuestions.filter(q => questionCategories(q).includes(value)).length}</span></button>)}
        </div>
        <p className="caption">{scope === 'one-large' ? '六类主题与材料类并列；材料类单独收录，其余题目可属多类。' : scope === 'one-small' ? '按写作任务归类，同题可属多类。' : '五类图表与材料类并列，按题目形式筛选。'} 数字为当前年份与关键词下的题数，0 表示暂无匹配。</p>
      </div> : <p className="library-filter-hint caption">先选择卷别与题型，可进一步按大作文主题、小作文类别或英语二作文分类筛选。</p>}
      <div className="library-filter-summary">
        <div className="library-active-filters" aria-label="当前筛选条件">
          {scope && <button onClick={() => changeScope('')} aria-label="移除卷别与题型条件">{scopes.find(s => s.id === scope)?.label}<X size={12}/></button>}
          {category && <button onClick={() => setCategory('')} aria-label="移除分类条件">{category}<X size={12}/></button>}
          {year && <button onClick={() => setYear('')} aria-label="移除年份条件">{year === 'supplement' ? '补充题' : `${year} 年`}<X size={12}/></button>}
          {keyword && <button onClick={() => setSearch('')} aria-label="移除关键词条件">关键词：{search.trim()}<X size={12}/></button>}
          {!active && <span className="caption">显示全部已收录真题</span>}
        </div>
        <div className="library-result-actions"><span className="caption" role="status">共 <b>{results.length}</b> 道题</span><button className="text-button" disabled={!active} onClick={reset}><RefreshCw size={14}/>重置筛选</button></div>
      </div>
    </section>
    <div className="panel question-list">{results.map(item => <div className="question-row" key={item.id}>
      <div className="year-stamp">{questionYearLabel(item)}<span>{examName(item)}<br/>{item.chartType || typeName(item.type)}</span></div>
      <div className="question-row-body"><h3>{item.title}</h3><div className="question-category-tags">{questionCategories(item).map(value => <button key={value} onClick={() => { changeScope(`${item.exam || 'one'}-${item.type}`); setCategory(value); }}>{value}</button>)}</div><p>{item.directions.replace(/^Directions:\s*/,'')}</p>{item.source ? <a href={item.source} target="_blank" rel="noreferrer">查看来源<ArrowUpRight size={12}/></a> : <span className="caption">{item.sourceLabel} · 未标年份</span>}</div>
      <button className="button outline small" disabled={busy} onClick={() => onStart(item)}>开始写作<ArrowUpRight size={15}/></button>
    </div>)}{!results.length && <div className="empty-state"><Search/><p>没有找到符合条件的题目</p><span>可移除上方单个条件，或重置筛选重新查找。</span><button className="text-button" onClick={reset}>重置筛选</button></div>}</div>
  </>;
}
