import { PICTURE_ESSAY_TOPICS, questionCategories, type Question, type Writing, type Review } from '../lib/folio';
import { plain } from '../lib/review-analysis';
import { PRACTICE_GROUPS, practiceGroup, summarizePractice, type PracticeProgress } from '../lib/practice-progress';
import type { EarnedMilestone, MilestoneId } from '../lib/achievement-types';

export function personalNoteCounts(questions:Question[],writings:Writing[],reviews:Review[]) {
  const known=new Set(questions.map(q=>q.id));
  const latest=new Map<string,Writing>();
  for(const w of writings)if(!latest.has(w.id)||w.updatedAt>latest.get(w.id)!.updatedAt)latest.set(w.id,w);
  const notes=new Map<string,Set<string>>();
  for(const review of reviews){
    const w=latest.get(review.writingId);
    if(!w||!known.has(w.questionId)||!w.text?.trim()||!['submitted','reviewed'].includes(w.status)||review.questionId!==w.questionId)continue;
    for(const note of Object.values(review.curation?.notes||{})){
      if(note.kind!=='personal'||note.origin!=='personal')continue;
      const parts=[note.shortNote,note.explanation,note.replacement].filter((s):s is string=>typeof s==='string').map(s=>plain(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()).filter(Boolean);
      // Ignore title-only entries. Same question/content remains one note across
      // imports, drafts and curation revisions; never inspect history snapshots.
      const content=[...new Set(parts)].sort().join('\n');
      if(!content)continue;
      if(!notes.has(w.questionId))notes.set(w.questionId,new Set());
      notes.get(w.questionId)!.add(content);
    }
  }
  return new Map([...notes].map(([id,contents])=>[id,contents.size]));
}

export function earnedMilestoneRules(questions:Question[],snapshot:PracticeProgress,noteCounts=new Map<string,number>()):EarnedMilestone[]{
  const progress=new Map(snapshot.questions.map(p=>[p.questionId,p]));
  const summary=summarizePractice(questions,progress);
  const practiced=questions.filter(q=>(progress.get(q.id)?.submittedCount||0)>0);
  const pools=PRACTICE_GROUPS.map(g=>({...g,...summarizePractice(questions.filter(q=>practiceGroup(q)===g.id),progress)}));
  const completed=pools.filter(g=>g.total>0&&g.practiced===g.total);
  const countCategories=(group:string)=>new Set(practiced.filter(q=>practiceGroup(q)===group).flatMap(questionCategories));
  const oneTopics=countCategories('one-large'),charts=countCategories('two-large'),letters=countCategories('one-small');
  const materials=['one-large','two-large'].every(group=>practiced.some(q=>practiceGroup(q)===group&&q.topicCategories?.includes('材料类')));
  const totalNotes=questions.reduce((n,q)=>n+(noteCounts.get(q.id)||0),0);
  const noteBreadth=questions.filter(q=>(noteCounts.get(q.id)||0)>=3).length;
  const result:EarnedMilestone[]=[];
  const add=(id:MilestoneId,title:string,detail:string,group:string,family:string,rank:number,condition:boolean)=>{if(condition)result.push({id,title,detail,group,family,rank});};
  const coverage:[MilestoneId,string,number][]=[['A01','初次落笔',1],['A02','五题渐入',5],['A03','十题成章',10],['A04','笔下成径',20],['A05','积页成卷',30],['A06','落笔成林',50]];
  for(const [id,title,n] of coverage)add(id,title,`已练习至少 ${n} 道不同题目`,'题目积累','coverage',n,summary.practiced>=n);
  add('A07','全库足迹','已练习当前题库全部题目','题目积累','all-questions',1,summary.total>0&&summary.practiced===summary.total);
  add('B01','三线起步','三类题库各完成至少 1 题','训练广度','balance',1,pools.every(g=>g.practiced>=1));
  add('B02','三线并进','三类题库各完成至少 5 题','训练广度','balance',5,pools.every(g=>g.practiced>=5));
  add('B03','一卷遍览',`完整覆盖：${completed.map(g=>g.label).join('、')}`,'训练广度','complete-pools',1,completed.length>=1);
  add('B04','双卷贯通',`完整覆盖至少两类题库：${completed.map(g=>g.label).join('、')}`,'训练广度','complete-pools',2,completed.length>=2);
  add('B05','六域初探','英语一六类主题各练习至少 1 题','训练广度','six-topics',1,PICTURE_ESSAY_TOPICS.every(t=>oneTopics.has(t)));
  add('B06','图表全景','五种图表类型各练习至少 1 题','训练广度','five-charts',1,['柱状图','条形图','饼图','曲线图','表格'].every(t=>charts.has(t)));
  add('B07','文体涉猎','覆盖至少 4 种小作文类别','训练广度','letter-variety',1,letters.size>=4);
  add('B08','双料初试','英语一、英语二材料题均已练习','训练广度','two-excerpts',1,materials);
  add('C01','再写一稿','同一题提交至少 2 篇独立稿件','重复打磨','single-rewrite',2,summary.rewritten>=1);
  add('C02','三稿成篇','同一题提交至少 3 篇独立稿件','重复打磨','single-rewrite',3,questions.some(q=>(progress.get(q.id)?.submittedCount||0)>=3));
  for(const [id,title,n] of [['C03','三题回炉',3],['C04','反复精进',5],['C05','十题重练',10]] as [MilestoneId,string,number][])add(id,title,`${n} 道不同题目均有重写稿`,'重复打磨','rewrite-breadth',n,summary.rewritten>=n);
  for(const [id,title,n] of [['D01','拾句成笺',10],['D02','笺页渐丰',30],['D03','札记成册',60],['D04','百笺成集',100]] as [MilestoneId,string,number][])add(id,title,`累计 ${n} 条有效个人笔记`,'个人笔记','note-count',n,totalNotes>=n);
  for(const [id,title,n] of [['D05','十题留痕',10],['D06','遍题成札',20]] as [MilestoneId,string,number][])add(id,title,`${n} 道不同题目各有至少 3 条有效个人笔记`,'个人笔记','note-breadth',n,noteBreadth>=n);
  return result;
}
