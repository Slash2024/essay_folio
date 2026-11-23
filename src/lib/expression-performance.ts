import type {ExpressionLibrary} from './expressions';
import type {QuizAnswer,QuizCorrection,QuizPractice,QuizReview,QuizSession,QuizMode} from './expression-quiz';

export interface RecitationCount {
  attempts:number; correct:number; incorrect:number; pending:number; practices:number; shared:number; accuracy:number|null;
}
export interface RecitationOccurrence {
  sessionId:string; index:number; createdAt:string; mode:QuizMode; prompt:string; answer:string;
  skipped:boolean; verdict:'correct'|'incorrect'|'pending'|'shared'; corrected:boolean; reason:string; practiceOnly?:boolean;
  practice?:{answer:string; verdict:'correct'|'incorrect'; skipped:boolean};
}
export interface ExpressionPerformance {
  revision:number; updatedAt:string|null; computedAt:string; entries:Record<string,RecitationCount>;
  overview:{practiced:number; attempts:number; correct:number; graded:number; pending:number; shared:number; accuracy:number|null};
}
export interface RecitationDetails {
  revision:number; count:RecitationCount; total:number; offset:number; hasNext:boolean; items:RecitationOccurrence[];
}
export interface RecitationRecords {
  sessions:QuizSession[]; answers:QuizAnswer[]; reviews:QuizReview[]; corrections:QuizCorrection[]; practices:QuizPractice[];
}
const emptyCount=():RecitationCount=>({attempts:0,correct:0,incorrect:0,pending:0,practices:0,shared:0,accuracy:null});
const percent=(correct:number,graded:number)=>graded?Math.round(correct/graded*1000)/10:null;
export const expressionKey=(kind:'sentence'|'word',id:string)=>`${kind}:${id}`;

// A round snapshots sources. Join by both stable key and English content so a
// replacement template cannot inherit the old template's accuracy.
export function collectExpressionPerformance(library:ExpressionLibrary,records:RecitationRecords) {
  const current=new Map([
    ...library.sentences.map(e=>[expressionKey('sentence',e.id),e.template] as const),
    ...library.words.map(e=>[expressionKey('word',e.id),e.term] as const)
  ]);
  const entries:Record<string,RecitationCount>=Object.create(null);
  const occurrences:Record<string,RecitationOccurrence[]>=Object.create(null);
  for(const key of current.keys()){entries[key]=emptyCount();occurrences[key]=[];}
  const sessions=new Map(records.sessions.map(s=>[s.id,s]));
  const identity=(v:{writingId:string;index:number})=>JSON.stringify([v.writingId,v.index]);
  const reviews=new Set(records.reviews.map(identity));
  const corrections=new Map<string,QuizCorrection>(),practices=new Map<string,QuizPractice>();
  for(const c of [...records.corrections].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))corrections.set(identity(c),c);
  for(const p of [...records.practices].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))practices.set(identity(p),p);
  const seen=new Set<string>();let shared=0;
  for(const answer of [...records.answers].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
    const id=identity(answer);if(seen.has(id))continue;seen.add(id);
    const session=sessions.get(answer.writingId),question=session?.questions[answer.index];
    if(!session||!question)continue;
    const sources=question.sources.filter(s=>current.get(s.key)===s.text);
    if(!sources.length)continue;
    const correction=corrections.get(id),pending=reviews.has(id)&&!correction;
    const verdict=pending?'pending':correction?.verdict??answer.verdict;
    // One grouped prompt can accept different expressions. Only a unique source
    // or the actual matchedKey can receive a personal result. Ambiguous failures
    // remain visible as shared records and never inflate individual accuracy.
    const uniqueKeys=[...new Set(question.sources.map(s=>s.key))];
    const attributed=uniqueKeys.length===1?uniqueKeys[0]:answer.matchedKey;
    const key=attributed&&sources.some(s=>s.key===attributed)?attributed:null;
    if(!key)shared++;
    const targetKeys=key?[key]:sources.map(s=>s.key);
    for(const sourceKey of new Set(targetKeys)){
      const count=entries[sourceKey],candidate=practices.get(id);
      const practice=candidate&&(uniqueKeys.length===1||candidate.matchedKey===sourceKey)?candidate:undefined;
      if(key){
        count.attempts++;
        if(verdict==='pending')count.pending++;else count[verdict]++;
      }else count.shared++;
      occurrences[sourceKey].push({
        sessionId:session.id,index:answer.index,createdAt:answer.createdAt,mode:session.mode,prompt:question.prompt,
        answer:answer.answer,skipped:answer.skipped,verdict:key?verdict:'shared',corrected:!!correction,
        reason:correction?.reason??answer.reason,
        ...(practice?{practice:{answer:practice.answer,verdict:practice.verdict,skipped:practice.skipped}}:{})
      });
    }
  }
  // A supplementary attempt may use a different accepted expression from the
  // first answer. Attribute it independently and keep it outside first accuracy.
  for(const practice of practices.values()){
    if(!seen.has(identity(practice)))continue;
    const session=sessions.get(practice.writingId),question=session?.questions[practice.index];
    if(!session||!question)continue;
    const keys=[...new Set(question.sources.map(s=>s.key))];
    const key=keys.length===1?keys[0]:practice.matchedKey;
    if(!key||!question.sources.some(s=>s.key===key&&current.get(key)===s.text))continue;
    entries[key].practices++;
    const previous=occurrences[key].find(item=>item.sessionId===session.id&&item.index===practice.index);
    if(previous){previous.practice={answer:practice.answer,verdict:practice.verdict,skipped:practice.skipped};continue;}
    occurrences[key].push({sessionId:session.id,index:practice.index,createdAt:practice.createdAt,mode:session.mode,prompt:question.prompt,answer:practice.answer,skipped:practice.skipped,verdict:practice.verdict,corrected:false,reason:practice.reason,practiceOnly:true});
  }
  const overview={practiced:0,attempts:0,correct:0,graded:0,pending:0,shared,accuracy:null as number|null};
  for(const [key,count] of Object.entries(entries)){
    count.accuracy=percent(count.correct,count.correct+count.incorrect);
    if(count.attempts)overview.practiced++;
    overview.attempts+=count.attempts;overview.correct+=count.correct;overview.graded+=count.correct+count.incorrect;overview.pending+=count.pending;
    occurrences[key].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.sessionId.localeCompare(b.sessionId)||a.index-b.index);
  }
  overview.accuracy=percent(overview.correct,overview.graded);
  const performance:ExpressionPerformance={revision:library.revision,updatedAt:library.updatedAt,computedAt:new Date().toISOString(),entries,overview};
  return {performance,occurrences};
}

export function recitationDetails(result:ReturnType<typeof collectExpressionPerformance>,key:string,offset=0,limit=10):RecitationDetails {
  const all=result.occurrences[key]||[];
  return {revision:result.performance.revision,count:result.performance.entries[key]||emptyCount(),total:all.length,offset,hasNext:offset+limit<all.length,items:all.slice(offset,offset+limit)};
}
