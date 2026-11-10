import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'short-review-'));
const archive = (await readFile('tests/archive-consistency.test.mjs', 'utf8')).match(/const archive = `([\s\S]*?)`;/)[1];
await build({
  stdin: { contents: "export {GET,POST} from './src/pages/api/short-review';export {db,put,failures} from './src/server/archive';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs'),
  plugins: [{ name: 'isolated', setup(b) {
    b.onResolve({ filter: /server\/archive$|^\.\/archive$/ }, () => ({ path: 'archive', namespace: 'test' }));
    b.onResolve({ filter: /server\/session$/ }, () => ({ path: 'session', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ loader: 'js', contents: path === 'archive' ? archive : "export const authorized=async request=>request.headers.has('x-auth'),sameOrigin=request=>!request.headers.has('x-foreign');" }));
  } }],
});
const { GET, POST, db, put, failures } = await import(join(dir, 'api.mjs'));
after(() => rm(dir, { recursive: true, force: true }));
beforeEach(async () => {
  db.clear(); failures.clear();
  await put('writing', 'writing', { id: 'writing', questionId: '2024-large', revision: 2, text: 'Changed later.', status: 'reviewed' });
  await put('version', 'revision', { writingId: 'writing', text: 'Parks serves residents. Trees grows tall.', version: 1 });
  await put('review', 'review', { id: 'review', writingId: 'writing', questionId: '2024-large', revisionId: 'version', writingRevision: 1, createdAt: '2026-11-01', label: 'Test', markdown: '3. 逐句批改\n【原句】：Parks serves residents.\n【修改与说明】\n修改为：Parks serve residents.\n说明：主谓一致。\n【原句】：Trees grows tall.\n【修改与说明】\n修改为：Trees grow tall.\n说明：主谓一致。' });
});
async function call(data, headers = { 'x-auth': '1' }) {
  const response = await POST({ request: new Request('https://test.invalid/api/short-review', { method: 'POST', headers, body: JSON.stringify(data) }) });
  return { status: response.status, ...await response.json() };
}
async function get(query = '') {
  return (await GET({ request: new Request('https://test.invalid/api/short-review' + query, { headers: { 'x-auth': '1' } }) })).json();
}
async function start() {
  const { source } = await get('?review=review');
  assert.equal(source.items.length, 2);
  const data = { action: 'start', id: 'lab-short-12345678-1234-1234-1234-123456789abc', reviewId: 'review', revision: source.revision, noteIds: source.items.map(item => item.noteId), confirmed: true };
  const response = await call(data);
  assert.equal(response.status, 200);
  return { data, progress: response.progress };
}
test('sources use the bound historical body without writing into formal records', async () => {
  const before = JSON.stringify([...db]);
  const { source } = await get('?review=review');
  assert.equal(source.items[0].original, 'Parks serves residents.');
  assert.equal(JSON.stringify([...db]), before);
  const invalid = await call({ action: 'start', id: 'lab-short-12345678-1234-1234-1234-123456789abc', reviewId: 'review', noteIds: [], confirmed: true });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.stringify([...db]), before);
});
test('session snapshots, answer retries and assessments survive reloading independently of the original', async () => {
  const before = JSON.stringify([...db]);
  const { data, progress } = await start();
  assert.equal(db.size, 4);
  assert.equal((await call(data)).progress.session.createdAt, progress.session.createdAt);
  assert.equal((await call({action:'assess', id:data.id, index:0, assessment:'understood'})).status, 400);
  const answer = { action: 'answer', id: data.id, index: 0, answer: 'Parks serve residents.', unable: false };
  failures.add('labShortAttempt');
  assert.equal((await call(answer)).status, 503);
  assert.equal((await call(answer)).status, 200);
  await Promise.all([call(answer), call(answer)]);
  assert.equal(db.size, 5);
  await call({ action: 'assess', id: data.id, index: 0, assessment: 'uncertain' });
  const stored = await get('?session=' + data.id);
  assert.equal(stored.progress.results[0].assessment, 'uncertain');
  assert.equal(JSON.stringify([...db].filter(([,row])=>!row.kind.startsWith('labShort'))), before);
  db.delete('review');
  assert.equal((await get('?session=' + data.id)).progress.session.items[0].reference, 'Parks serve residents.');
});
test('authentication, origin, source confirmation, indices and choices are enforced', async () => {
  assert.equal((await call({ action: 'start' }, {})).status, 401);
  assert.equal((await call({ action: 'start' }, { 'x-auth': '1', 'x-foreign': '1' })).status, 403);
  const { data } = await start();
  assert.equal((await call({ action: 'answer', id: data.id, index: -1, answer: 'x', unable: false })).status, 400);
  assert.equal((await call({ action: 'answer', id: data.id, index: 0, answer: '', unable: false })).status, 400);
  assert.equal((await call({ action: 'answer', id: data.id, index: 0, answer: '', unable: true })).status, 200);
  assert.equal((await call({ action: 'assess', id: data.id, index: 0, assessment: 'mastered' })).status, 400);
});
