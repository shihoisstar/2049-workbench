import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPilotFetch, pilotAllowance } from './pilot-spending';
const directories: string[] = [];
after(() => { for (const directory of directories) { assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()), 'wb-pilot-budget-'))); rmSync(directory, { recursive: true, force: true }); } });
function setup(change = {}) { const directory = mkdtempSync(join(tmpdir(), 'wb-pilot-budget-')); directories.push(directory); const file = join(directory, 'approval.json'); writeFileSync(file, JSON.stringify({ approved: true, approvalId: 'isolated-fixture-not-real-authorization', chatModel: 'text-fixture', maxVideoCalls: 2, maxTextCalls: 2, maximumUsdEstimate: 2.1, ...change })); return { file, directory }; }
const video = { model: 'bytedance/seedance-2.0-fast/text-to-video', prompt: 'fixture', duration: 10, resolution: '720p', ratio: '9:16', generate_audio: true, bitrate_mode: 'high' };
const videoUrl = 'https://api.atlascloud.ai/api/v1/model/generateVideo'; const textUrl = 'https://api.atlascloud.ai/v1/chat/completions';
const request = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
test('recovery mode blocks paid video and text before changing the journal but can query an existing receipt', async () => {
  const scope = setup(); const journal = join(scope.directory, 'spending.json');
  writeFileSync(journal, JSON.stringify({ approvalId: 'isolated-fixture-not-real-authorization', attempts: [] }));
  const before = readFileSync(journal, 'utf8'); let posts = 0, gets = 0;
  const network: typeof fetch = async (_url, init) => { if (init?.method === 'POST') posts++; else gets++; return Response.json({ data: { id: 'saved-id', status: 'completed' } }); };
  assert.equal(pilotAllowance(scope.file, 'video'), true);
  for (let restart = 0; restart < 2; restart++) {
    const client = createPilotFetch(scope.file, network, false);
    await assert.rejects(client(videoUrl, request(video)));
    await assert.rejects(client(textUrl, request({ model: 'text-fixture', max_tokens: 1000 })));
    await client('https://api.atlascloud.ai/api/v1/model/prediction/saved-id', { method: 'GET' });
  }
  assert.equal(posts, 0); assert.equal(gets, 2); assert.equal(readFileSync(journal, 'utf8'), before);
  assert.equal(pilotAllowance(scope.file, 'video'), true);
});
test('pilot refuses missing approval and unsupported requests without calling a provider', async () => {
  let calls = 0; const network: typeof fetch = async () => { calls++; return Response.json({ id: 'fixture' }); };
  const denied = setup({ approved: false }); await assert.rejects(createPilotFetch(denied.file, network)(videoUrl, request(video))); assert.equal(pilotAllowance(denied.file, 'video'), false);
  const scope = setup(); const client = createPilotFetch(scope.file, network);
  await assert.rejects(client('https://other.invalid/api/v1/model/generateVideo', request(video)));
  await assert.rejects(client(videoUrl, request({ ...video, duration: 15 })));
  await assert.rejects(client(textUrl, request({ model: 'unapproved-model', max_tokens: 1000 })));
  assert.equal(calls, 0);
});
test('pilot serializes four allowed POSTs, records before network, and restart cannot reset quotas', async () => {
  const scope = setup(); let calls = 0, active = 0, maximumActive = 0;
  const network: typeof fetch = async () => { calls++; active++; maximumActive = Math.max(active, maximumActive); const journal = JSON.parse(readFileSync(join(scope.directory, 'spending.json'), 'utf8')); assert.equal(journal.attempts.at(-1).state, 'pending'); await new Promise(done => setTimeout(done, 10)); active--; return Response.json({ data: { id: `fixture-${calls}` } }); };
  const client = createPilotFetch(scope.file, network);
  await Promise.all([client(videoUrl, request(video)), client(textUrl, request({ model: 'text-fixture', max_tokens: 1000 })), client(videoUrl, request(video)), client(textUrl, request({ model: 'text-fixture', max_tokens: 1000 }))]);
  assert.equal(calls, 4); assert.equal(maximumActive, 1); assert.equal(pilotAllowance(scope.file, 'video'), false); assert.equal(pilotAllowance(scope.file, 'text'), false);
  await assert.rejects(createPilotFetch(scope.file, network)(videoUrl, request(video))); assert.equal(calls, 4);
});
test('uncertain paid result blocks all later POSTs across restarts, but original-ID GET remains possible', async () => {
  const scope = setup(); let posts = 0, gets = 0;
  const network: typeof fetch = async (_url, init) => { if (init?.method === 'POST') { posts++; throw new Error('Lost receipt'); } gets++; return Response.json({ data: { id: 'saved-id', status: 'processing' } }); };
  const client = createPilotFetch(scope.file, network); await assert.rejects(client(videoUrl, request(video)));
  await assert.rejects(createPilotFetch(scope.file, network)(textUrl, request({ model: 'text-fixture', max_tokens: 1000 })));
  await client('https://api.atlascloud.ai/api/v1/model/prediction/saved-id', { method: 'GET' });
  assert.equal(posts, 1); assert.equal(gets, 1); assert.equal(JSON.parse(readFileSync(join(scope.directory, 'spending.json'), 'utf8')).attempts[0].state, 'unknown');
});
test('estimate cap and cancelled queued request stop before a second charge', async () => {
  const scope = setup({ maximumUsdEstimate: 1 }); let calls = 0; const client = createPilotFetch(scope.file, async () => { calls++; return Response.json({ id: 'fixture' }); });
  await client(videoUrl, request(video)); await assert.rejects(client(textUrl, request({ model: 'text-fixture', max_tokens: 1000 }))); assert.equal(calls, 1);
  const cancelled = setup(); const abort = new AbortController(); abort.abort(); await assert.rejects(createPilotFetch(cancelled.file, async () => { calls++; return Response.json({ id: 'never' }); })(videoUrl, { ...request(video), signal: abort.signal })); assert.equal(calls, 1);
});
