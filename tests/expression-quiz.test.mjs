import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'folio-quiz-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({ stdin: { contents: "export {GET,POST} from './src/pages/api/expression-quiz';export {GET as home} from './src/pages/api/laboratory-home';export {POST as feedback} from './src/pages/api/laboratory-feedback';export {gradeQuiz,quizScore,quizTokens} from './src/lib/expression-quiz';export {db,put,failures} from './src/server/archive';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'), plugins: [{ name: 'isolate', setup(b) {
 b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({ path: 'archive', namespace: 'test' }));
 b.onResolve({ filter: /server\/session$/ }, () => ({ path: 'session', namespace: 'test' }));
 b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ loader: 'js', contents: path === 'archive' ? archive : "export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');" }));
} }] });
const m = await import(join(dir, 'api.mjs'));
after(() => rm(dir, { recursive: true, force: true }));
const id = 'lab-quiz-12345678-1234-1234-1234-123456789abc';
const word = { id: 'p', term: 'perseverance', meaning: '坚持不懈', forms: ['persistence'], enabled: true };
const sentence = { id: 'reason-heart', category: '原因', title: '核心所在', template: 'At its heart lies {{C}}', notes: '', substitutions: '', enabled: true };
beforeEach(async () => { m.db.clear(); m.failures.clear(); await m.put('expression-library', 'expressions', { revision: 1, sentences: [sentence], words: [word, { ...word, id: 'mutual', term: 'mutual support', meaning: '相互支持', forms: [] }], tolerance: 'loose', sourceText: '' }); await m.put('formal', 'writing', { text: 'unchanged' }); });
async function get(query = '', handler = m.GET, headers = { 'x-auth': '1' }) { const r = await handler({ request: new Request('https://test.invalid/api/expression-quiz' + query, { headers }) }); return { status: r.status, ...await r.json() }; }
async function post(body, handler = m.POST, headers = { 'x-auth': '1' }) { const r = await handler({ request: new Request('https://test.invalid/api/expression-quiz', { method: 'POST', headers, body: JSON.stringify(body) }) }); return { status: r.status, ...await r.json() }; }
async function start(extra = {}) { const overview = await get(); return post({ action: 'start', id, scope: 'word', mode: 'meaning', count: 1, signature: overview.signature, ...extra }); }
const answer = (text, index = 0, extra = {}) => post({ action: 'answer', id, index, answer: text, skipped: false, ...extra });
const snapshot = () => JSON.stringify([...m.db].filter(([, r]) => ['writing', 'expressions'].includes(r.kind)));
test('auth, origin, malformed payload, limits and unknown sessions are enforced', async () => {
 assert.equal((await get('', m.GET, {})).status, 401); assert.equal((await post({}, m.POST, {})).status, 401);
 assert.equal((await post({}, m.POST, { 'x-auth': '1', 'x-foreign': '1' })).status, 403);
 for (const value of [null, [], {}, { action: 'start', id, count: 0 }, { action: 'start', id, count: 51 }]) assert.equal((await post(value)).status, 400);
 assert.equal((await get('?session=missing')).status, 404); assert.equal((await get('?offset=-1')).status, 400);
});
test('both prompt modes have clear Chinese cues; random draws do not repeat and unrevealed responses expose no English', async () => {
 const overview = await get(); assert.deepEqual(overview.counts.meaning, { all: 3, word: 2, sentence: 1 }); assert.equal(overview.counts.scenario.all, 3);
 const s = await start({ scope: 'all', count: 3, mode: 'scenario' }); assert.equal(s.status, 200); assert.equal(new Set(s.progress.questions.map(q => q.prompt)).size, 3);
 assert.equal(JSON.stringify(s.progress).includes('perseverance'), false); assert.equal(JSON.stringify(s.progress).includes('heart'), false);
 assert.equal((await start({ scope: 'all', count: 3, mode: 'scenario' })).progress.session.createdAt, s.progress.session.createdAt);
 assert.equal((await start({ count: 2 })).status, 409); assert.equal((await start({ id: id.replace('12345678', '22345678'), signature: 'stale' })).status, 409);
});
test('format tolerance is separate from typo tolerance, template slots are explicit and accepted variants are exact', async () => {
 const q = { kind: 'word', slots: 0, prompt: '坚持', sources: [{ key: 'word:p', text: 'perseverance', answers: ['perseverance', 'persistence'] }] };
 assert.equal(m.gradeQuiz(q, '  PERSEVERANCE.  ').verdict, 'correct'); assert.equal(m.gradeQuiz(q, 'persistence').verdict, 'correct');
 for (const bad of ['perseverence', 'persevere', 'good perseverance']) assert.equal(m.gradeQuiz(q, bad).verdict, 'incorrect');
 const t = { kind: 'sentence', slots: 1, sources: [{ key: 's', text: sentence.template, answers: [sentence.template] }] };
 assert.equal(m.gradeQuiz(t, 'at its heart lies ___!').verdict, 'correct'); assert.equal(m.gradeQuiz(t, 'At its heart lie ___').verdict, 'incorrect');
 assert.equal(m.gradeQuiz(t, 'At its heart lies determination').verdict, 'incorrect');
});
test('first answer and score survive retry, lost response, report failure and reload; cannot overwrite first input', async () => {
 const before = snapshot(); await start(); const source = JSON.parse(m.db.get(id).payload).questions[0].sources[0].text;
 m.failures.add('labQuizAnswer'); assert.equal((await answer(source)).status, 503); assert.equal((await get('?session=' + id)).progress.results.length, 0);
 m.failures.add('labQuizReport'); assert.equal((await answer(source)).status, 503);
 const retry = await answer(source); assert.equal(retry.status, 200); assert.equal(retry.progress.score.accuracy, 100); assert.equal(retry.progress.results.length, 1);
 assert.equal((await answer('different')).status, 409); assert.equal((await get('?session=' + id)).progress.score.correct, 1);
 assert.equal([...m.db.values()].filter(r => r.kind === 'labQuizReport').length, 1); assert.equal(snapshot(), before);
});
test('sequential answers, skipping and durable pending queue retain the correct denominator', async () => {
 await start({ count: 2 }); assert.equal((await answer('wrong', 1)).status, 400);
 let p = (await answer('', 0, { skipped: true })).progress; assert.equal(p.score.accuracy, 0); assert.equal(p.score.skipped, 1);
 assert.equal((await post({ action: 'review', id, index: 0 })).status, 400);
 assert.equal((await get('', m.home)).items[0].route.view, 'quiz');
 p = (await answer('wrong', 1)).progress; assert.equal(p.score.answered, 2); assert.equal(p.score.graded, 2); assert.equal(p.score.complete, true);
 assert.equal((await get('', m.home)).items.length, 0);
});
test('same-prompt aliases are accepted and attributed to the actual recalled entry', async () => {
 const row = m.db.get('expression-library'), lib = JSON.parse(row.payload); lib.words.push({ ...word, id: 'alias', term: 'tenacity', forms: [] }); row.payload = JSON.stringify(lib);
 const s = await start({ count: 2 }); assert.equal(s.progress.questions.length, 2);
 const state = JSON.parse(m.db.get(id).payload), index = state.questions.findIndex(q => q.sources.length === 2);
 for (let i = 0; i < index; i++) await answer('', i, { skipped: true });
 const p = (await answer('tenacity', index)).progress; assert.equal(p.results.find(r => r.index === index).matchedKey, 'word:alias');
});
test('reviews and one-time manual correction retain original result and exclude unresolved items', async () => {
 await start(); await answer('something');
 let p = (await post({ action: 'review', id, index: 0 })).progress; assert.equal(p.score.pending, 1); assert.equal(p.score.graded, 0); assert.equal(p.score.accuracy, null);
 assert.equal((await get('', m.home)).items[0].status, 'revisit');
 assert.equal((await post({ action: 'correct', id, index: 0, verdict: 'correct', reason: '可接受的同义表达', confirmed: false })).status, 400);
 p = (await post({ action: 'correct', id, index: 0, verdict: 'correct', reason: '可接受的同义表达', confirmed: true })).progress;
 assert.equal(p.score.accuracy, 100); assert.equal(p.score.corrected, 1); assert.equal(p.results[0].verdict, 'incorrect'); assert.equal(p.results[0].answer, 'something');
 assert.equal((await post({ action: 'correct', id, index: 0, verdict: 'incorrect', reason: '原判定正确，保留结果', confirmed: true })).status, 409);
});
test('supplementary practice is separately persisted without changing the first accuracy', async () => {
 await start(); await answer('wrong'); const target = JSON.parse(m.db.get(id).payload).questions[0].sources[0].text;
 const body = { action: 'practice', id, index: 0, answer: target, skipped: false, operationId: 'lab-quiz-practice-12345678-1234-1234-1234-123456789abc' };
 const p = (await post(body)).progress; assert.equal(p.score.accuracy, 0); assert.equal(p.practices[0].verdict, 'correct');
 assert.equal((await post(body)).status, 200); assert.equal((await post({ ...body, answer: 'other' })).status, 409);
});
test('cue customization uses revision checks, rejects leaked English and leaves the source library intact', async () => {
 const before = snapshot(); const entries = (await get('?cues=1')).entries, e = entries.find(e => e.key === 'word:p');
 const body = { action: 'cue', key: e.key, sourceSignature: e.sourceSignature, baseRevision: e.revision, meaning: '面对困难坚持到底的品质。', scenario: '描述始终不放弃的品质。', answers: ['tenacity'], operationId: 'lab-quiz-cue-save-12345678-1234-1234-1234-123456789abc' };
 assert.equal((await post({ ...body, meaning: '记起 perseverance' })).status, 400); assert.equal((await post({ ...body, sourceSignature: 'stale' })).status, 409);
 assert.equal((await post(body)).status, 200); assert.equal((await post(body)).status, 200); assert.equal(snapshot(), before);
 const sourceRow = m.db.get('expression-library'), lib = JSON.parse(sourceRow.payload); lib.words[0].term = 'changed'; lib.revision++; sourceRow.payload = JSON.stringify(lib);
 const changed = (await get('?cues=1')).entries.find(e => e.key === 'word:p'); assert.equal(changed.stale, true); assert.deepEqual(changed.answers, []); assert.notEqual(changed.meaning, body.meaning);
});
test('changing or disabling the library never changes old questions; new wrong-only rounds filter stale sources', async () => {
 await start(); await answer('wrong'); const old = await get('?session=' + id), row = m.db.get('expression-library'), lib = JSON.parse(row.payload);
 for (const w of lib.words) w.enabled = false; row.payload = JSON.stringify(lib);
 assert.deepEqual((await get('?session=' + id)).progress.results, old.progress.results);
 const overview = await get(); assert.equal(overview.counts.meaning.word, 0);
 assert.equal((await start({ id: id.replace('12345678', '33333333'), retryOf: id, count: 1 })).status, 400);
});
test('new wrong-only round has separate identity and keeps old immutable records', async () => {
 await start({ count: 2 }); await answer('wrong', 0); const state = JSON.parse(m.db.get(id).payload); await answer(state.questions[1].sources[0].text, 1);
 const original = JSON.stringify(m.db.get(id)); const next = await start({ id: id.replace('12345678', '44444444'), retryOf: id, count: 1 });
 assert.equal(next.status, 200); assert.equal(next.progress.session.retryOf, id); assert.equal(next.progress.questions[0].prompt, state.questions[0].prompt); assert.equal(JSON.stringify(m.db.get(id)), original);
});
test('feedback uses the correct experiment session and history paginates', async () => {
 await start(); const r = await post({ id: 'lab-feedback-12345678-1234-1234-1234-123456789abc', feature: 'quiz', contextId: id, phase: 'practice', ease: 'smooth', value: 'helpful', factors: ['grading'] }, m.feedback); assert.equal(r.status, 200);
 for (let i = 0; i < 11; i++) await m.put('extra-' + i, 'labQuizSession', { ...JSON.parse(m.db.get(id).payload), id: 'extra-' + i });
 assert.equal((await get()).sessions.length, 10); assert.equal((await get('?offset=10')).sessions.length, 2);
});
test('imported Chinese meanings keep usable text after filename annotations while actual English leaks stay excluded', async () => {
 const row = m.db.get('expression-library'), lib = JSON.parse(row.payload);
 lib.sentences = [];
 lib.words = [{ ...word, id: 'a', term: 'recover', meaning: '恢复（来源：个人笔记.docx）' }, { ...word, id: 'b', term: 'respond', meaning: '回应（来源：应用文 (1).docx）' }, { ...word, id: 'c', term: 'hello', meaning: '请写 hello（来源：个人笔记.docx）' }];
 row.payload = JSON.stringify(lib);
 const overview = await get(); assert.equal(overview.coverage.enabled.word, 3); assert.equal(overview.coverage.covered.meaning.word, 2);
 const cues = (await get('?cues=1')).entries; assert.equal(cues.find(e => e.key === 'word:a').meaning, '恢复'); assert.equal(cues.find(e => e.key === 'word:b').meaning, '回应'); assert.equal(cues.find(e => e.key === 'word:c').meaning, '');
});
test('private reviewed cues cover 174 imported sentence entries and 72 words in both modes without requiring default seed IDs', async () => {
 const row = m.db.get('expression-library'), lib = JSON.parse(row.payload);
 lib.sentences = Array.from({length:174},(_,i)=>({ ...sentence, id:'import-s-'+i, title:'自定义句式'+i, template:'Structure '+i+' includes {{内容}}.' }));
 lib.words = Array.from({length:72},(_,i)=>({ ...word, id:'import-w-'+i, term:'word'+i, meaning:'分类选项（来源：私人文件.docx）' }));
 row.payload = JSON.stringify(lib); const original = snapshot();
 const entries = [...lib.sentences.map((s,i)=>({ key:'sentence:'+s.id, text:s.template, meaning:'第'+i+'个结构的完整中文含义。', scenario:'需要使用第'+i+'种结构完成一个具体表达。' })), ...lib.words.map((w,i)=>({ key:'word:'+w.id, text:w.term, sourceMeaning:w.meaning, meaning:'第'+i+'个词的具体中文含义。', scenario:'在明确的第'+i+'种情景中使用这个词。' }))];
 await m.put('lab-quiz-cue-pack', 'labQuizCuePack', {version:1,sourceRevision:1,entries});
 const overview=await get();
 for (const mode of ['meaning','scenario']) { assert.deepEqual(overview.counts[mode],{all:246,word:72,sentence:174}); assert.deepEqual(overview.coverage.covered[mode],{all:246,word:72,sentence:174}); }
 const s=await start({scope:'all',mode:'scenario',count:50});assert.equal(s.status,200);assert.equal(s.progress.questions.length,50);assert.equal(new Set(s.progress.questions.map(q=>q.prompt)).size,50);assert.equal(snapshot(),original);
});
test('reviewed pack follows source text; custom cue overrides remain authoritative; snapshots survive edits', async () => {
 await m.put('lab-quiz-cue-pack', 'labQuizCuePack', {version:1,sourceRevision:1,entries:[{key:'sentence:'+sentence.id,text:sentence.template,meaning:'经核对的中文含义。',scenario:'经核对的具体情景。'}]});
 const first=(await get('?cues=1')).entries.find(e=>e.kind==='sentence');assert.equal(first.meaning,'经核对的中文含义。');
 await start({scope:'sentence'});await answer('At its heart lies ___');const old=await get('?session='+id);
 const body={action:'cue',key:first.key,sourceSignature:first.sourceSignature,baseRevision:0,meaning:'我的自定义含义。',scenario:'',answers:[],operationId:'lab-quiz-cue-save-22222222-1234-1234-1234-123456789abc'};
 await post(body);assert.equal((await get()).coverage.covered.scenario.sentence,0);
 const row=m.db.get('expression-library'),lib=JSON.parse(row.payload);lib.sentences[0].template='Newly changed structure {{内容}}.';row.payload=JSON.stringify(lib);
 assert.equal((await get()).coverage.covered.meaning.sentence,0);assert.deepEqual((await get('?session='+id)).progress.results,old.progress.results);
});
