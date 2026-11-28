import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {after, test} from 'node:test';

const dir = await mkdtemp(join(tmpdir(), 'folio-records-'));
after(() => rm(dir, {recursive: true, force: true}));
await build({entryPoints: ['src/lib/practice-records.ts', 'src/lib/review-interactions.ts', 'src/lib/review-analysis.ts'],
  bundle: true, platform: 'node', format: 'esm', outdir: dir});
const {summarizePracticeRecords: summarize} = await import(join(dir, 'practice-records.js'));
const {reviewNotes} = await import(join(dir, 'review-interactions.js'));
const {parseReview} = await import(join(dir, 'review-analysis.js'));
const original = 'In a larger sense, parks serves as a catalyst for public well-being.';
const question = {id: '2024-large', year: 2024, type: 'large', title: '公园', topicCategories: ['环境保护']};
const writing = {id: 'w', questionId: question.id, text: original, status: 'reviewed', revision: 1, createdAt: '2026-11-20', updatedAt: '2026-11-21'};
const version = {id: 'w-v1', writingId: 'w', questionId: question.id, text: original, version: 1};
const library = {revision: 1, tolerance: 'balanced', sentences: [{id: 'catalyst', category: '大作文 / 结尾', title: 'catalyst', notes: '', substitutions: '', template: 'In a larger sense, {{subject}} serves as a catalyst for {{result}}.', enabled: true}], words: []};
const markdown = `## 1. 题目要求与完成情况\n是否完成全部任务：是\n## 3. 逐句批改\n【原句】：${original}\n【修改与说明】\n修改为：${original.replace('parks serves', 'parks serve')}\n说明：主谓一致错误，复数主语应用 serve。`;
const review = {id: 'r', writingId: 'w', questionId: question.id, revisionId: version.id, createdAt: '2026-11-21', markdown};
const notes = reviewNotes(parseReview(markdown));
const correction = notes.find(n => n.kind === 'correction');
const task = notes.find(n => n.kind === 'task');
const run = (r = review, w = writing, vs = [version]) => summarize([w], [r], vs, [question], library).w;

test('latest review only, visible current notes, revisit/mastered and stale study IDs', () => {
  const current = {...review, study: {entries: {[correction.id]: {status: 'revisit'}, [task.id]: {status: 'mastered'}, stale: {status: 'mastered'}}}};
  assert.deepEqual(run(current).progress, {reviewed: 2, total: 2, percent: 100});
  assert.deepEqual(run({...current, study: {entries: {[correction.id]: {status: 'revisit'}}}}).progress, {reviewed: 1, total: 2, percent: 50});
  const hidden = {...current, curation: {notes: {[task.id]: {...task, hidden: true}}}};
  assert.deepEqual(run(hidden).progress, {reviewed: 1, total: 1, percent: 100});
  const latest = {...review, id: 'latest', createdAt: '2026-11-22'};
  assert.equal(summarize([writing], [latest, current], [version], [question], library).w.progress.reviewed, 0);
  const empty = {...review, markdown: '', study: current.study};
  assert.deepEqual(run(empty).progress, {reviewed: 0, total: 0, percent: 0});
});

test('template counts reuse curated error rules and retain navigation IDs', () => {
  const result = run();
  assert.equal(result.templateErrors.length, 1);
  assert.equal(result.templateErrors[0].noteId, correction.id);
  assert.equal(result.templateErrors[0].reviewId, review.id);
  for (const patch of [{kind: 'keep'}, {kind: 'optimization'}, {hidden: true}, {categories: ['不计入问题']}]) {
    assert.equal(run({...review, curation: {notes: {[correction.id]: {...correction, ...patch}}}}).templateErrors.length, 0);
  }
  assert.equal(run(review, {...writing, text: original.replace('parks serves', 'parks serve')}).templateErrors.length, 0);
  assert.equal(run({...review, revisionId: 'missing'}).templateErrors, null);
  assert.equal(run(review, writing, [{...version, writingId: 'another'}]).templateErrors, null);
  assert.equal(run({...review, questionId: 'another'}).progress, null);
});

test('drafts, pending reviews and incomplete history have honest empty states; computation does not mutate', () => {
  const before = JSON.stringify({writing, review, version, library});
  assert.equal(run(review, {...writing, status: 'draft'}).progress, null);
  assert.equal(summarize([{...writing, status: 'submitted'}], [], [], [question], library).w.reviewId, null);
  const missing = run(review, writing, []);
  assert.equal(missing.templateErrors, null);
  assert.equal(missing.progress.total, 2);
  assert.equal(JSON.stringify({writing, review, version, library}), before);
});

test('the authenticated listing API reads only, preserves filters/paging and never repairs history', async () => {
  const archive = `
    export const db=new Map(); export const decode=r=>JSON.parse(r.payload);
    export async function find(id){return db.get(id)||null;}
    export async function all(kind){return [...db.values()].filter(r=>r.kind===kind);}
    export async function list(kind,{offset=0,limit=30,status='',questionId=''}={}){
      const rows=[...db.values()].filter(r=>r.kind===kind&&(!status||r.status===status)&&(!questionId||r.questionId===questionId));
      return {rows:rows.slice(offset,offset+limit),total:rows.length,hasNext:offset+limit<rows.length};
    }
    export const put=()=>{throw Error('Unexpected write')}; export const deleteRow=put;
  `;
  await build({stdin: {contents: "export {POST} from './src/pages/api/folio'; export {db} from './src/server/archive';", resolveDir: process.cwd()},
    bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'), plugins: [{name: 'read-only-storage', setup(b) {
      b.onResolve({filter: /server\/archive$|^\.\/archive$/}, () => ({path: 'archive', namespace: 'qa'}));
      b.onResolve({filter: /server\/session$/}, () => ({path: 'session', namespace: 'qa'}));
      b.onLoad({filter: /.*/, namespace: 'qa'}, ({path}) => ({loader: 'js', contents: path === 'archive' ? archive : `
        export const authorized=async()=>globalThis.qaRecordsAuth!==false,sameOrigin=()=>true,equal=(a,b)=>a===b,
        makeSession=async()=>'',accessConfig=async()=>({}),secret=async()=>{throw Error('External calls prohibited')},SITE_ORIGIN='https://test.invalid';
      `}));
    }}]});
  const {POST, db} = await import(join(dir, 'api.mjs'));
  const set = (id, kind, p) => db.set(id, {_id: id, kind, writingId: p.writingId || '', questionId: p.questionId || '', status: p.status || '', payload: JSON.stringify(p)});
  set('w', 'writing', writing); set('r', 'review', review); set('w-v1', 'revision', version); set('expression-library', 'expressions', library);
  const call = async (extra = {}) => {
    const r = await POST({request: new Request('https://test.invalid/api/folio', {method: 'POST', body: JSON.stringify({action: 'practiceRecords', ...extra})})});
    return {status: r.status, ...await r.json()};
  };
  const before = JSON.stringify([...db]);
  const result = await call(); assert.equal(result.status, 200); assert.equal(result.summaries.w.templateErrors.length, 1);
  assert.equal((await call({status: 'draft'})).total, 0);
  assert.equal((await call({questionId: 'different'})).items.length, 0);
  assert.equal((await call({offset: 30})).items.length, 0);
  assert.equal((await call({action: 'list'})).summaries, undefined);
  assert.equal(JSON.stringify([...db]), before);
  db.delete('w-v1'); const noVersion = JSON.stringify([...db]);
  assert.equal((await call()).summaries.w.templateErrors, null);
  assert.equal(JSON.stringify([...db]), noVersion);
  globalThis.qaRecordsAuth = false; assert.equal((await call()).status, 401); delete globalThis.qaRecordsAuth;
});
