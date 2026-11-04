import {CURATION_GUIDE_VERSION,type CurationGuidePreference} from '../../lib/curation-guide';
import {curatedNotes,validateCuratedNote,curationChanges,validateCurationSize,type CurationData,type CurationVersion,type ReviewCuration} from '../../lib/review-curation';
import {validateReadingLayout} from '../../lib/sentence-reading';
import { reviewNotes, validateStudyEntry, interactionId, type ReviewStudy } from '../../lib/review-interactions';
import { analyzedReview, ensureHistory, saveVersion, versions, migrateHistory } from '../../server/history';
import { ISSUE_CATEGORIES, parseReview, type IssueCategory } from '../../lib/review-analysis';
import type { APIRoute } from 'astro';
import { accessConfig, authorized, equal, makeSession, sameOrigin, secret, SITE_ORIGIN } from '../../server/session';
import { all, decode, find, list, put, deleteRow } from '../../server/archive';
import { DEFAULT_TEMPLATES, DEFAULT_RUBRICS, templateKey, examName, type Question, type Writing, type Notice, type Review } from '../../lib/folio';
import { DEFAULT_EXPRESSIONS, validateExpressions, type ExpressionLibrary } from '../../lib/expressions';
import questionsJson from '../../data/questions.json';
export const prerender=false;
const questionMap=new Map((questionsJson as Question[]).map(q=>[q.id,q]));
function json(body:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
function str(value:unknown,max=300000){if(typeof value!=='string'||value.length>max)throw new Error('输入内容格式或长度不正确');return value;}
function id(value:unknown){const s=str(value,100);if(!/^[a-zA-Z0-9_-]+$/.test(s))throw new Error('记录编号不正确');return s;}
export const GET:APIRoute=async({request})=>{try{return json({authenticated:await authorized(request)});}catch{return json({authenticated:false,error:'云端服务暂不可用'},503);}};
export const POST:APIRoute=async({request})=>{
  try {
    if(!sameOrigin(request))return json({error:'请求来源不匹配，请刷新后重试'},403);
    if(Number(request.headers.get('content-length')||0)>420000)return json({error:'文件过大'},413);
    const raw=await request.text();if(new TextEncoder().encode(raw).length>420000)return json({error:'文件过大'},413);
    const body=JSON.parse(raw);const action=body.action;
    if(action==='login') {const cfg=await accessConfig();if(!equal(String(body.code||''),cfg.code))return json({error:'访问码不正确'},401);return json({ok:true},200,{'Set-Cookie':`folio_session=${await makeSession(cfg.signing)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});}
    if(action==='logout')return json({ok:true},200,{'Set-Cookie':'folio_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    if(!await authorized(request))return json({error:'请先输入个人访问码'},401);
    if(action==='getCurationGuide'||action==='saveCurationGuide') {
      const key='preference-curation-guide-v1',row=await find(key);if(row&&row.kind!=='preference')return json({error:'记录类型不正确'},400);const previous=row?decode<CurationGuidePreference>(row):null;
      if(action==='getCurationGuide')return json({guide:previous});
      if(body.version!==CURATION_GUIDE_VERSION||!['unseen','completed','skipped'].includes(body.status))return json({error:'输入的引导设置不正确'},400);
      if(previous?.version===CURATION_GUIDE_VERSION&&previous.status===body.status)return json({guide:previous,unchanged:true});
      const guide:CurationGuidePreference={version:CURATION_GUIDE_VERSION,status:body.status,updatedAt:new Date().toISOString()};await put(key,'preference',guide,row);return json({guide});
    }
    if(action==='list') {const p=await list('writing',{offset:Math.max(0,Number(body.offset)||0),limit:30,questionId:body.questionId?str(body.questionId,100):'',status:body.status?str(body.status,20):''});return json({items:p.rows.map(r=>decode<Writing>(r)),total:p.total,hasNext:p.hasNext});}
    if(action==='get') {const row=await find(id(body.id));if(!row||row.kind!=='writing')return json({error:'记录不存在'},404);const [reviews,notices]=await Promise.all([list('review',{writingId:row._id,limit:100}),list('notice',{writingId:row._id,limit:20})]);const writing=decode<Writing>(row);const history=await ensureHistory(writing);const fresh=await list('review',{writingId:row._id,limit:100});return json({writing,reviews:fresh.rows.map(r=>analyzedReview(decode<Review>(r))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)),versions:history,notices:notices.rows.map(r=>decode<Notice>(r))});}
    if(action==='delete') {
      const recordId=id(body.id);
      if(body.confirmed!==true)return json({error:'请先确认删除这条练习记录'},400);
      let row=await find(recordId);
      if(!row)return json({ok:true,alreadyDeleted:true});
      if(row.kind!=='writing'&&row.kind!=='deleted')return json({error:'记录类型不正确'},400);
      if(row.kind==='writing') {
        const w=decode<Writing>(row);
        if(str(body.baseUpdatedAt,100)!==w.updatedAt)return json({error:'记录已更新，请取消并重新打开删除确认框，以核对最新内容。'},409);
        // Remove the body first, while retaining an ID-only tombstone so a stale
        // autosave cannot recreate a record the user deliberately deleted.
        await put(recordId,'deleted',{id:recordId,deletedAt:new Date().toISOString()},row);
      }
      try {
      for(const kind of ['review','snapshot','notice','revision','curationVersion']) {
        // Always drain the first page: advancing an offset while deleting skips rows.
        while(true) {
          const batch=await list(kind,{writingId:recordId,limit:100});
          if(!batch.rows.length)break;
          for(const related of batch.rows)await deleteRow(related._id);
        }
      }
      } catch {
        return json({error:'记录正文已移除，关联内容尚未清理完毕。请再次点击“确认删除”重试。'},503);
      }
      return json({ok:true});
    }
    if(action==='draft'||action==='submit') {
      const recordId=id(body.id);const q=questionMap.get(str(body.questionId,100));if(!q)throw new Error('请选择有效真题');
      const text=str(body.text,60000);if(action==='submit'&&!text.trim())throw new Error('请先输入作文正文');
      const row=await find(recordId);if(row?.kind==='deleted')return json({error:'记录已删除，请新建写作，避免旧页面重新保存已删除内容。'},410);if(row&&row.kind!=='writing')throw new Error('记录类型不正确');const old=row?decode<Writing>(row):null;
      if(old&&old.status!=='draft'){if(action==='submit')return json({writing:old,alreadySubmitted:true});throw new Error('已提交稿件请使用“编辑本稿”修改正文');}
      const now=new Date().toISOString();const w:Writing={id:recordId,questionId:q.id,text,status:action==='submit'?'submitted':'draft',createdAt:old?.createdAt||now,updatedAt:now,...(body.parentId?{parentId:id(body.parentId)}:{})};
      if(action==='submit'){w.revision=1;w.submittedAt=now;w.promptSnapshot=str(body.prompt,16000);w.rubricSnapshot=str(body.rubric??DEFAULT_RUBRICS[templateKey(q)],16000);w.questionSnapshot=q;}
      await put(recordId,'writing',w,row);if(action==='submit')await saveVersion(w,'submitted',now);return json({writing:w,versions:action==='submit'?await versions(w.id):[]});
    }
    if(action==='edit') {
      const recordId=id(body.id);
      const row=await find(recordId);
      if(!row||row.kind!=='writing')return json({error:'记录不存在'},404);
      const w=decode<Writing>(row);
      if(w.status==='draft')return json({error:'请先使用草稿编辑功能'},400);
      const existingReviews=await list('review',{writingId:w.id,limit:1});if(w.status==='reviewed'||existingReviews.rows.length)return json({error:'已导入批阅，正文已锁定，无法再修改。'},409);
      const text=str(body.text,60000);
      if(!text.trim())return json({error:'请先输入作文正文'},400);
      if(str(body.baseUpdatedAt,100)!==w.updatedAt)return json({error:'记录已在其他页面更新，请重新打开记录后再编辑；当前修改请先复制保留。'},409);
      if(text===w.text)return json({writing:w,unchanged:true,versions:await ensureHistory(w)});
      await ensureHistory(w);
      const now=new Date().toISOString();
      w.text=text;
      w.updatedAt=now;
      w.lastEditedAt=now;
      w.revision=(w.revision||1)+1;
      await saveVersion(w,'edit',now);
      await put(recordId,'writing',w,row);
      return json({writing:w,versions:await versions(w.id)});
    }
    if(action==='notify') {
      const writingId=id(body.writingId);const row=await find(writingId);if(!row||row.kind!=='writing')throw new Error('找不到对应作文');const w=decode<Writing>(row);if(w.status==='draft')throw new Error('请先提交作文');
      const event=id(body.eventId);if(event!==`submit-${writingId}`&&!event.startsWith('manual-'))throw new Error('提醒类型不正确');
      const existing=await find(event);if(existing){if(existing.kind!=='notice'||decode<Notice>(existing).writingId!==writingId)throw new Error('提醒编号不匹配');return json({notice:decode<Notice>(existing),duplicate:true});}
      const n:Notice={id:event,writingId,state:'sending',createdAt:new Date().toISOString()};
      try {await put(event,'notice',n);}catch(e){const prior=await find(event);if(prior?.kind==='notice')return json({notice:decode<Notice>(prior),duplicate:true});throw e;}
      const stored=await find(event);
      try {const key=await secret('ESSAY_BARK_KEY');const q=questionMap.get(w.questionId)!;const u=new URL(`https://api.day.app/${encodeURIComponent(key)}/${encodeURIComponent('英语作文待处理')}/${encodeURIComponent(`${q.year}年${examName(q)} · ${q.type==='small'?'小作文':'大作文'} · ${q.title}\n作文已保存，请查看记录。`)}`);u.searchParams.set('group','英语作文');u.searchParams.set('ttl','600');u.searchParams.set('url',`${SITE_ORIGIN}/?record=${writingId}`);
        const r=await fetch(u,{method:'GET',signal:AbortSignal.timeout(12000)});const answer=await r.json();if(!r.ok||answer.code!==200)throw new Error('推送服务未接受请求');n.state='accepted';
      }catch{n.state='failed';n.error='推送请求未成功；作文已经保存，可手动再次提醒。';}
      await put(event,'notice',n,stored);return json({notice:n});
    }
    if(action==='review') {
      const writingId=id(body.writingId);const row=await find(writingId);if(!row||row.kind!=='writing')throw new Error('请先保存对应作文');const w=decode<Writing>(row);if(w.status==='draft')throw new Error('请先提交作文，再关联批阅结果');
      if(str(body.baseUpdatedAt,100)!==w.updatedAt)return json({error:'记录已更新，请重新打开记录并核对正文后导入批阅。'},409);await ensureHistory(w);const bound=await saveVersion(w,(w.revision||1)>1?'edit':'submitted');
      const markdown=str(body.markdown,300000);if(!markdown.trim())throw new Error('批阅内容不能为空');const r:Review={id:id(body.id),writingId,questionId:w.questionId,filename:str(body.filename,180),markdown,createdAt:new Date().toISOString(),label:str(body.label||'批阅结果',100),writingRevision:w.revision||1,revisionId:bound.id,binding:'latest'};
      const prior=await find(r.id);if(prior?.kind==='review')return json({review:decode<Review>(prior)});await put(r.id,'review',r);w.status='reviewed';w.updatedAt=r.createdAt;await put(w.id,'writing',w,row);return json({review:analyzedReview(r),writing:w,versions:await versions(w.id)});
    }
    if(action==='expressions') {
      const row=await find('expression-library');
      return json({library:row?decode<ExpressionLibrary>(row):DEFAULT_EXPRESSIONS});
    }
    if(action==='saveExpressions') {
      const row=await find('expression-library');
      const previous=row?decode<ExpressionLibrary>(row):DEFAULT_EXPRESSIONS;
      if(Number(body.baseRevision)!==previous.revision)return json({error:'表达库已在其他页面更新，请先备份当前编辑内容，再刷新云端版本。'},409);
      const clean=validateExpressions(body.library);
      const library:ExpressionLibrary={...clean,revision:previous.revision+1,updatedAt:new Date().toISOString()};
      await put('expression-library','expressions',library,row);
      return json({library});
    }
    if(action==='templates') {const [row,rubric]=await Promise.all([find('templates'),find('rubrics')]);return json({templates:{...DEFAULT_TEMPLATES,...(row?decode<Record<string,string>>(row):{})},rubrics:{...DEFAULT_RUBRICS,...(rubric?decode<Record<string,string>>(rubric):{})}});}
    if(action==='snapshot') {const writingId=id(body.writingId);const row=await find(writingId);if(!row||row.kind!=='writing')throw new Error('找不到对应作文');const w=decode<Writing>(row);const prompt=str(body.prompt,16000),rubric=str(body.rubric??DEFAULT_RUBRICS[templateKey(questionMap.get(w.questionId)!)],16000),text=str(body.text,60000);if(w.questionId!==body.questionId)throw new Error('记录题目不匹配');const snapshot={id:id(body.id),writingId,questionId:w.questionId,prompt,rubric,text,question:questionMap.get(w.questionId),createdAt:new Date().toISOString()};await put(snapshot.id,'snapshot',snapshot);return json({ok:true});}
    if(action==='saveTemplates') {const prior=await find('templates');const previous=prior?decode<Record<string,string>>(prior):{};const t={small:str(body.small,16000),large:str(body.large,16000),englishTwoLarge:body.englishTwoLarge===undefined?(previous.englishTwoLarge||DEFAULT_TEMPLATES.englishTwoLarge):str(body.englishTwoLarge,16000)};if(!t.small.trim()||!t.large.trim()||!t.englishTwoLarge.trim())throw new Error('所有提示词均不能为空');await put('templates','templates',t,await find('templates'));return json({templates:t});}
    if(action==='saveRubrics') {const prior=await find('rubrics');const previous=prior?decode<Record<string,string>>(prior):{};const r={small:str(body.small,16000),large:str(body.large,16000),englishTwoLarge:body.englishTwoLarge===undefined?(previous.englishTwoLarge||DEFAULT_RUBRICS.englishTwoLarge):str(body.englishTwoLarge,16000)};if(!r.small.trim()||!r.large.trim()||!r.englishTwoLarge.trim())throw new Error('所有评分标准均不能为空');await put('rubrics','rubrics',r,await find('rubrics'));return json({rubrics:r});}
    if(action==='migrateHistory')return json({migrated:await migrateHistory()});
    if(action==='saveReviewCuration'||action==='getReviewCurationVersion') {
      const row=await find(id(body.reviewId));if(!row||row.kind!=='review')return json({error:'批阅不存在'},404);const r=decode<Review>(row);
      const writingRow=await find(r.writingId);if(!writingRow||writingRow.kind!=='writing')return json({error:'记录不存在'},404);
      if(action==='getReviewCurationVersion') {const versionId=id(body.versionId);if(!r.curation?.history.some(h=>h.id===versionId))return json({error:'批阅整理版本不存在'},404);const saved=await find(versionId);if(!saved||saved.kind!=='curationVersion')return json({error:'批阅整理版本不存在'},404);const version=decode<CurationVersion>(saved);if(version.reviewId!==r.id||version.writingId!==r.writingId)return json({error:'批阅整理版本不匹配'},400);return json({version});}
      const current=r.curation;if(Number(body.baseRevision)!==(current?.revision||0))return json({error:'批阅整理已在其他页面更新，请重新打开本稿后再保存；当前文字请先复制保留。'},409);
      const bound=r.revisionId?await find(r.revisionId):null;const original=bound?.kind==='revision'?decode<{writingId:string;text:string}>(bound):null;if(!original||original.writingId!==r.writingId)return json({error:'批阅对应正文为 not given，无法保存人工整理'},400);
      const base=reviewNotes(parseReview(r.markdown));let data:CurationData={notes:{...current?.notes}},changes:CurationVersion['changes']=[],label='';
      if(body.operation==='upsert') {let note;try{note=validateCuratedNote(body.note,original.text,base,data.notes[body.note?.id]);}catch(e){return json({error:(e as Error).message},400);}const before=data.notes[note.id]||base.find(n=>n.id===note.id);changes=curationChanges(before as any,note);data.notes[note.id]=note;label=`整理「${note.title}」`;}
      else if(body.operation==='restoreNote') {const noteId=id(body.noteId);if(!base.some(n=>n.id===noteId))return json({error:'批阅原始建议不存在；个人笔记可选择暂不采纳'},400);const before=data.notes[noteId];delete data.notes[noteId];changes=curationChanges(before,base.find(n=>n.id===noteId) as any);label='恢复单条自动解析';}
      else if(body.operation==='reset') {changes=[{field:'人工整理',before:`${Object.keys(data.notes).length} 条`,after:'恢复自动解析，历史记录保留'}];data={notes:{}};label='恢复自动解析';}
      else if(body.operation==='restoreVersion') {const versionId=id(body.versionId);let target:CurationData;if(versionId==='initial')target={notes:{}};else{if(!current?.history.some(h=>h.id===versionId))return json({error:'批阅整理版本不存在'},404);const saved=await find(versionId);if(!saved||saved.kind!=='curationVersion')return json({error:'批阅整理版本不存在'},404);const version=decode<CurationVersion>(saved);if(version.reviewId!==r.id||version.writingId!==r.writingId)return json({error:'批阅整理版本不匹配'},400);target=version.data;}
        data={notes:{}};try{for(const [key,note] of Object.entries(target.notes)){if(key!==note.id)throw new Error('批阅整理版本格式不正确');data.notes[key]=validateCuratedNote(note,original.text,base,note);}}catch(e){return json({error:(e as Error).message},400);}changes=[{field:'整理稿',before:`版本 ${current?.revision||0}`,after:versionId==='initial'?'自动解析初始版':`历史版本 ${versionId}`}];label='恢复历史整理稿';}
      else return json({error:'批阅整理操作不正确'},400);
      try{validateCurationSize(data);}catch(e){return json({error:(e as Error).message},400);}
      if(JSON.stringify(data.notes)===JSON.stringify(current?.notes||{}))return json({review:analyzedReview(r),unchanged:true});
      const createdAt=new Date().toISOString(),version=(current?.revision||0)+1,versionId=`curation-${crypto.randomUUID()}`;
      const info={id:versionId,version,createdAt,label};const snapshot:CurationVersion={...info,writingId:r.writingId,reviewId:r.id,data,changes};
      const curation:ReviewCuration={...data,revision:version,updatedAt:createdAt,history:[...(current?.history||[]),info]};const next={...r,curation};if(new TextEncoder().encode(JSON.stringify(next)).length>370000)return json({error:'批阅整理与原始文件合计过大，请缩短说明后保存'},400);await put(versionId,'curationVersion',snapshot);await put(r.id,'review',next,row);return json({review:analyzedReview(next)});
    }
    if(action==='saveReviewLayout') {
      const row=await find(id(body.reviewId));if(!row||row.kind!=='review')return json({error:'批阅不存在'},404);
      const r=decode<Review>(row);const writingRow=await find(r.writingId);if(!writingRow||writingRow.kind!=='writing')return json({error:'记录不存在'},404);
      const current=r.study;if(Number(body.baseRevision)!==(current?.revision||0))return json({error:'批阅复习记录已更新，请重新打开本稿后再操作。'},409);
      const versionRow=r.revisionId?await find(r.revisionId):null;const version=versionRow?.kind==='revision'?decode<{writingId:string;text:string}>(versionRow):null;if(!version||version.writingId!==r.writingId)return json({error:'批阅对应正文为 not given，无法设置分组'},400);
      let layout;try{layout=validateReadingLayout(body.layout,version.text);}catch(e){return json({error:(e as Error).message},400);}
      const study:ReviewStudy={...current,revision:(current?.revision||0)+1,updatedAt:new Date().toISOString(),entries:current?.entries||{},layout};const next={...r,study};await put(r.id,'review',next,row);return json({review:analyzedReview(next)});
    }
    if(action==='saveReviewStudy') {
      const row=await find(id(body.reviewId));if(!row||row.kind!=='review')return json({error:'批阅不存在'},404);
      const r=decode<Review>(row);const writingRow=await find(r.writingId);if(!writingRow||writingRow.kind!=='writing')return json({error:'记录不存在'},404);
      const current=r.study;if(Number(body.baseRevision)!==(current?.revision||0))return json({error:'批阅复习记录已更新，请重新打开本稿后再操作。'},409);
      const noteId=id(body.noteId);if(!curatedNotes(parseReview(r.markdown),r.curation).some(n=>n.id===noteId))return json({error:'批阅建议编号不正确'},400);
      const versionRow=r.revisionId?await find(r.revisionId):null;const version=versionRow?.kind==='revision'?decode<{writingId:string;text:string}>(versionRow):null;
      let entry;try{entry=validateStudyEntry(body.entry,version?.writingId===r.writingId?version.text:'');}catch(e){return json({error:(e as Error).message},400);}
      const study:ReviewStudy={...current,revision:(current?.revision||0)+1,updatedAt:new Date().toISOString(),entries:{...current?.entries,[noteId]:entry}};
      const next={...r,study};await put(r.id,'review',next,row);return json({review:analyzedReview(next)});
    }
    if(action==='addReviewExpression') {
      const row=await find(id(body.reviewId));if(!row||row.kind!=='review')return json({error:'批阅不存在'},404);const r=decode<Review>(row);
      const a=parseReview(r.markdown);const index=Number(body.expressionIndex);if(!Number.isSafeInteger(index)||index<0||index>=a.expressions.length)return json({error:'批阅表达编号不正确'},400);
      const expression=a.expressions[index],kind=body.kind;if(kind!=='sentence'&&kind!=='word')return json({error:'表达库类型不正确'},400);
      const existing=await find('expression-library');const previous=existing?decode<ExpressionLibrary>(existing):DEFAULT_EXPRESSIONS;
      if(Number(body.baseRevision)!==previous.revision)return json({error:'表达库已更新，请重新加载后再添加。'},409);
      const value=str(body.value,kind==='sentence'?1800:220).trim();const entryId=interactionId('reviewexpr',kind+'-'+value.toLowerCase());
      const normalize=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
      const duplicate=kind==='sentence'?previous.sentences.some(s=>normalize(s.template)===normalize(value)):previous.words.some(w=>normalize(w.term)===normalize(value));
      if(duplicate)return json({library:previous,duplicate:true});
      const source=`来自批阅「${r.label}」；记录 ${r.writingId}。\n用法：${str(body.meaning||'',500)}`;
      const next={...previous,sentences:kind==='sentence'?[...previous.sentences,{id:entryId,category:'批阅积累',title:str(body.title||value.slice(0,80),120),template:value,notes:source,substitutions:'',enabled:true}]:previous.sentences,words:kind==='word'?[...previous.words,{id:entryId,term:value,meaning:str(body.meaning||'',500),forms:[],enabled:true}]:previous.words};
      const library:ExpressionLibrary={...validateExpressions(next),revision:previous.revision+1,updatedAt:new Date().toISOString()};await put('expression-library','expressions',library,existing);return json({library});
    }
    if(action==='saveIssueCategories') {
      const row=await find(id(body.reviewId));if(!row||row.kind!=='review')return json({error:'批阅不存在'},404);
      const r=decode<Review>(row);if((body.baseUpdatedAt||'')!==(r.analysisUpdatedAt||''))return json({error:'批阅分类已更新，请刷新后重试'},409);
      const issueId=str(body.issueId,100);const parsed=parseReview(r.markdown);if(!parsed.issues.some(i=>i.id===issueId))throw new Error('批阅问题编号不正确');
      if(!Array.isArray(body.categories)||body.categories.length>ISSUE_CATEGORIES.length||body.categories.some((x:unknown)=>!ISSUE_CATEGORIES.includes(x as IssueCategory)))throw new Error('批阅分类不正确');
      const next={...r,issueOverrides:{...r.issueOverrides,[issueId]:[...new Set(body.categories)] as IssueCategory[]},analysisUpdatedAt:new Date().toISOString()};await put(r.id,'review',next,row);return json({review:analyzedReview(next)});
    }
    if(action==='analytics') {const [ws,rs]=await Promise.all([all('writing'),all('review')]);return json({writings:ws.map(r=>{const w=decode<Writing>(r);return {id:w.id,questionId:w.questionId,status:w.status,createdAt:w.createdAt,submittedAt:w.submittedAt};}),reviews:rs.map(r=>analyzedReview(decode<Review>(r)))});}
    if(action==='export') {
      await migrateHistory();
      const [ws,rs,vs,cs]=await Promise.all([all('writing'),all('review'),all('revision'),all('curationVersion')]);
      // Strict allowlist: no prompts, settings, notices or secrets leave the archive.
      const writings=ws.map(row=>{const w=decode<Writing>(row);return {id:w.id,questionId:w.questionId,text:w.text,status:w.status,createdAt:w.createdAt,updatedAt:w.updatedAt,submittedAt:w.submittedAt,parentId:w.parentId,revision:w.revision||1,lastEditedAt:w.lastEditedAt,versions:vs.filter(v=>v.writingId===w.id).map(v=>decode<any>(v)).sort((a,b)=>a.version-b.version)};});
      const reviews=rs.map(row=>{const r=analyzedReview(decode<Review>(row));return {id:r.id,writingId:r.writingId,questionId:r.questionId,filename:r.filename,markdown:r.markdown,createdAt:r.createdAt,label:r.label,writingRevision:r.writingRevision,revisionId:r.revisionId,binding:r.binding,analysis:r.analysis,issueOverrides:r.issueOverrides,analysisUpdatedAt:r.analysisUpdatedAt,study:r.study,curation:r.curation,curationHistory:cs.filter(c=>c.writingId===r.writingId).map(c=>decode<CurationVersion>(c)).filter(c=>c.reviewId===r.id&&r.curation?.history.some(h=>h.id===c.id)).sort((a,b)=>a.version-b.version)};});
      return json({questions:questionsJson,writings,reviews});
    }
    return json({error:'不支持的操作'},400);
  } catch(e) { console.error('Folio request failed:',e instanceof Error?e.name:'Error');return json({error:e instanceof Error&&/^(输入|记录|请选择|请先|已提交|找不到|提醒|文件|批阅|两份|所有|单条|表达库)/.test(e.message)?e.message:'云端操作未成功，请稍后重试；尚未确认保存的内容请保留。'},500); }
};
