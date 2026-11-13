import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'folio-materials-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({
  stdin: { contents: "export {GET,POST} from './src/pages/api/laboratory-materials';export {POST as feedback} from './src/pages/api/laboratory-feedback';export {db,put,failures} from './src/server/archive';export {startShortReview,saveShortReview} from './src/server/short-review';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'),
  plugins: [{ name: 'isolated', setup(b) {
    b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({ path: 'archive', namespace: 'test' }));
    b.onResolve({ filter: /server\/session$/ }, () => ({ path: 'session', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ loader: 'js', contents: path === 'archive' ? archive : "export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');" }));
  } }],
});
const m = await import(join(dir, 'api.mjs'));
after(() => rm(dir, { recursive: true, force: true }));
beforeEach(async () => {
  m.db.clear(); m.failures.clear();
  await m.put('writing', 'writing', { id: 'writing', questionId: '2024-large', revision: 1, text: 'Parks serves residents.', status: 'reviewed' });
  await m.put('version', 'revision', { writingId: 'writing', text: 'Parks serves residents.', version: 1 });
  await m.put('review', 'review', { id: 'review', writingId: 'writing', questionId: '2024-large', revisionId: 'version', createdAt: '2026-11-01', label: 'Test', markdown: '3. 逐句批改\n【原句】：Parks serves residents.\n【修改与说明】\n修改为：Parks serve residents.\n说明：主谓一致。', curation: { revision: 1, notes: { 'manual-personalnote': {id:'manual-personalnote',kind:'personal',title:'个人笔记',original:'Parks serves residents.',explanation:'复数主语搭配动词原形。',scope:'range',anchor:{start:0,end:22},hidden:false} } } });
});
async function get(query = '') {
  const response = await m.GET({ request: new Request('https://test.invalid/api/laboratory-materials' + query, { headers: { 'x-auth': '1' } }) });
  return { status: response.status, ...await response.json() };
}
async function post(body, handler = m.POST, headers = { 'x-auth': '1' }) {
  const response = await handler({ request: new Request('https://test.invalid/api/test', { method: 'POST', headers, body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
}
const packId = 'lab-pack-12345678-1234-1234-1234-123456789abc';
async function requestBody() {
  const { source } = await get('?type=review&source=review');
  return { id:packId,sourceType:'review',sourceId:'review',signature:source.signature,noteId:source.items[0].noteId };
}
test('material packs retain bound context and associated notes with immutable, retryable saves', async () => {
  const before = JSON.stringify([...m.db]);
  const body = await requestBody();
  assert.equal(JSON.stringify([...m.db]), before);
  m.failures.add('labMaterialPack');
  assert.equal((await post(body)).status,503);
  const saved = await post(body);
  assert.equal(saved.status,200);
  assert.deepEqual(saved.pack.item.personalNotes,['复数主语搭配动词原形。']);
  await Promise.all([post(body),post(body)]);
  assert.equal(m.db.size,4);
  assert.equal(JSON.stringify([...m.db].filter(([,row])=>row.kind!=='labMaterialPack')), before);
  m.db.delete('review');
  const reread = await get('?pack='+packId);
  assert.equal(reread.pack.item.reference,'Parks serve residents.');
  assert.equal((await post({...body,noteId:'other-note'})).status,409);
});
test('session materials include the actual independent answer and source changes require rereading', async () => {
  const { source } = await get('?type=review&source=review');
  const session = await m.startShortReview({ id:'lab-short-12345678-1234-1234-1234-123456789abc',reviewId:'review',revision:1,noteIds:[source.items[0].noteId],confirmed:true });
  await m.saveShortReview({action:'answer',id:session.session.id,index:0,answer:'Parks serve local people.',unable:false});
  const result = await get('?type=session&source='+session.session.id);
  const saved = await post({id:packId,sourceType:'session',sourceId:session.session.id,signature:result.source.signature,noteId:source.items[0].noteId});
  assert.equal(saved.pack.attempt.answer,'Parks serve local people.');
  const stale = await requestBody();
  const row = m.db.get('review'), review = JSON.parse(row.payload);
  review.curation.revision++;
  await m.put('review','review',review,row);
  assert.equal((await post({...stale,id:'lab-pack-22222222-1234-1234-1234-123456789abc'})).status,409);
});
test('feedback validates choices and source type, retries without duplicates, and enforces access', async () => {
  const body = {id:'lab-feedback-12345678-1234-1234-1234-123456789abc',feature:'materials',contextId:null,phase:'selection',ease:'effort',value:'helpful',factors:['notes']};
  assert.equal((await post(body,m.feedback,{})).status,401);
  assert.equal((await post(body,m.feedback,{'x-auth':'1','x-foreign':'1'})).status,403);
  assert.equal((await post({...body,factors:['notes','volume','finding']},m.feedback)).status,400);
  assert.equal((await post({...body,contextId:'review'},m.feedback)).status,404);
  assert.equal((await post({...body,feature:'short',factors:['notes']},m.feedback)).status,400);
  m.failures.add('labFeatureFeedback');
  assert.equal((await post(body,m.feedback)).status,503);
  assert.equal((await post(body,m.feedback)).status,200);
  await Promise.all([post(body,m.feedback),post(body,m.feedback)]);
  assert.equal([...m.db.values()].filter(row=>row.kind==='labFeatureFeedback').length,1);
  assert.equal((await post({...body,ease:'blocked'},m.feedback)).status,409);
});
