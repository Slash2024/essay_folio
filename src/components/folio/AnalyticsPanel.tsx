import {useEffect,useMemo,useState} from 'react';
import {RefreshCw,ArrowUpRight} from 'lucide-react';
import {api,dateLabel} from '../../lib/client';
import {ENGLISH_TWO_PRACTICE_NOTE,questionYearLabel,templateKeys,templateName,type TemplateKey,type Review,type Question} from '../../lib/folio';
import {analyzeGroup,latestReviews,type AnalyticsWriting} from '../../lib/analytics';
import {buildInsights} from '../../lib/analytics-insights';
import IssueClassification from './IssueClassification';
import AnalyticsInsights from './AnalyticsInsights';
import '../../styles/analytics.css';
import {plain} from '../../lib/review-analysis';
export default function AnalyticsPanel({questions,onOpen}:{questions:Question[];onOpen:(id:string,reviewId?:string,noteId?:string)=>void}){
 const [reviews,setReviews]=useState<Review[]>([]),[writings,setWritings]=useState<AnalyticsWriting[]>([]),[texts,setTexts]=useState<Record<string,string>>({}),[key,setKey]=useState<TemplateKey>('large'),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const count=writings.length;
 async function load(){setLoading(true);setError('');try{const d=await api('analytics');setReviews(d.reviews);setWritings(d.writings);setTexts(d.texts||{});}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);const a=useMemo(()=>analyzeGroup(reviews,questions,key),[reviews,questions,key]);
 const insights=useMemo(()=>buildInsights(reviews,questions,key,writings,texts),[reviews,questions,key,writings,texts]);
 return <div className="analytics-page"><section className="panel analytics-intro"><div><h2>批阅统计</h2><p className="muted">已保存 {count} 稿 · 已批阅 {latestReviews(reviews).length} 稿 · 共 {reviews.length} 份批阅。每稿仅使用最新批阅统计。</p></div><button className="text-button" disabled={loading} onClick={load}><RefreshCw size={16}/>刷新数据</button></section>
 <div className="segmented stats-tabs" aria-label="统计卷别与题型">{templateKeys.map(k=><button key={k} className={key===k?'selected':''} onClick={()=>setKey(k)}>{templateName(k)}</button>)}</div>{error&&<p className="error" role="alert">{error}</p>}
 {loading?<div className="panel empty-state">正在读取批阅统计…</div>:<><div className="stats-cards"><article className="panel"><span>已批阅稿件</span><strong>{a.rows.length}<small> 稿</small></strong></article><article className="panel"><span>原始作文平均估分</span><strong>{a.average===null?'not given':a.average.toFixed(1)}<small> / {a.max}</small></strong></article><article className="panel"><span>纳入均分的有效评分</span><strong>{a.scored.length}<small> / {a.rows.length}</small></strong></article></div>
 {key==='englishTwoLarge'&&<p className="practice-standard-note">{ENGLISH_TWO_PRACTICE_NOTE} 历史 15 分制批阅保留原始分数，不换算、不计入当前均分。</p>}
 <section className="panel stats-section"><h2>评分分布</h2>
 <p className="caption">中位数 {a.median??'—'} · 最低 {a.minimum??'—'} · 最高 {a.maximum??'—'}</p>
 <div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>分数范围</th><th>稿件数</th></tr></thead>
 <tbody>{a.bands.map((band,i)=><tr key={band.low}><td>{band.low}–{i===a.bands.length-1?band.high:`＜${band.high}`}</td><td>{band.count}</td></tr>)}</tbody></table></div>
 </section>
 <section className="panel stats-section"><h2>问题分布</h2>
 <div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>类别</th><th>涉及稿件</th><th>题目数</th><th>问题条数</th></tr></thead>
 <tbody>{a.categories.map(([category,rows])=><tr key={category}><td>{category}</td><td>{rows.length} / {a.rows.length}</td>
 <td>{new Set(rows.map(r=>r.question.id)).size}</td><td>{rows.reduce((n,r)=>n+r.analysis.issues.filter(i=>!i.categories.includes('不计入问题')&&i.categories.some(c=>c===category)).length,0)}</td></tr>)}</tbody></table></div>
 {!a.categories.length&&<p className="caption">暂无已分类问题。</p>}
 {a.unclassified>0&&<p className="caption">待分类 {a.unclassified} 条。</p>}
 </section>
 <IssueClassification key={key} items={a.rows.flatMap(row=>row.analysis.issues
  .filter(issue=>issue.remembered&&!issue.categories.length&&!issue.classificationSource)
  .map(issue=>({reviewId:row.review.id,writingId:row.review.writingId,question:row.question,issue})))}
  onOpen={onOpen} onSaved={load}/>
 <AnalyticsInsights insights={insights} onOpen={onOpen}/>
 <section className="panel stats-section"><h2>原文评分记录</h2><p className="caption">按批阅导入时间排序；误差线为批阅给出的合理区间。</p>{a.scored.length>0&&<svg className="score-chart" viewBox="0 0 700 220" role="img" aria-label={`${templateName(key)}评分记录，${a.scored.length}条单点评分及原文区间`}>
 {[0,a.max/2,a.max].map(v=><g key={v}><line x1="40" y1={180-v/a.max*145} x2="680" y2={180-v/a.max*145} stroke="#dfe7ef"/><text x="28" y={184-v/a.max*145} textAnchor="end" fontSize="12" fill="#64748b">{v}</text></g>)}
 <polyline fill="none" stroke="#087c77" strokeWidth="2" points={a.scored.map((r,i)=>`${a.scored.length===1?360:65+i/(a.scored.length-1)*580},${180-r.analysis.score.point!/a.max*145}`).join(' ')}/>
 {a.scored.map((r,i)=>{const x=a.scored.length===1?360:65+i/(a.scored.length-1)*580,s=r.analysis.score;const validRange=s.low!==null&&s.high!==null&&s.low>=0&&s.high<=a.max&&s.low<=s.high;return <g key={r.review.id}><title>{questionYearLabel(r.question)}：{s.point}分；区间{s.low??'not given'}–{s.high??'not given'}</title>{validRange&&<line x1={x} x2={x} y1={180-s.low!/a.max*145} y2={180-s.high!/a.max*145} stroke="#087c77" opacity=".4" strokeWidth="7"/>}<circle cx={x} cy={180-s.point!/a.max*145} r="5" fill="#087c77"/><text x={x} y={168-s.point!/a.max*145} textAnchor="middle" fontSize="13" fill="#075e5b">{s.point}</text><text x={x} y="205" textAnchor="middle" fontSize="11" fill="#64748b">{questionYearLabel(r.question)}年题</text></g>;})}</svg>}
 <div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>题目 / 导入时间</th><th>原文估分</th><th>合理区间</th><th>档次</th><th>正文</th></tr></thead><tbody>{a.rows.map(r=><tr key={r.review.id}><td>{questionYearLabel(r.question)} · {r.question.title}<small>{dateLabel(r.review.createdAt)}</small></td><td>{r.analysis.score.point??'not given'} / {r.analysis.score.max??'not given'}{r.analysis.score.max!==null&&r.analysis.score.max!==a.max&&<small>与当前 {a.max} 分制不符，未计入均分</small>}</td><td>{r.analysis.score.low===null?'not given':`${r.analysis.score.low}–${r.analysis.score.high}`}</td><td>{r.analysis.score.band?plain(r.analysis.score.band):'not given'}</td><td><button className="text-button" onClick={()=>onOpen(r.review.writingId,r.review.id)}>查看批阅<ArrowUpRight size={13}/></button>{r.review.binding==='legacySnapshot'&&<small>历史快照 V{r.review.writingRevision}</small>}</td></tr>)}</tbody></table>{!a.rows.length&&<div className="empty-state">这一题型还没有批阅数据</div>}</div></section>
 <details className="panel stats-section stats-method"><summary>统计口径</summary>
 <p>按卷别与题型分组，每稿取最新批阅，按批阅导入时间排列。小作文满分 10 分，两类大作文满分 20 分。均分、分布和中位数采用满分符合且有效的单点评分；区间沿用原记录。各分数段含下限，最后一段也含满分。</p>
 <p>问题分布以本题型已批阅稿件为分母，同稿同类别只计一稿；同一条多标签问题可计入多个类别。问题优先取重点错误，缺失时使用逐句批改，并同步人工整理。</p>
 <p>重写中的“未提及”仅表示当前批阅没有提到。新题表达匹配使用批阅所绑定的提交正文；估分差异是批阅记录差异。</p>
 </details></>}
 </div>;
}
