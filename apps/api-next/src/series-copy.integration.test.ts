import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createServices } from '@wb/server';
import { createApplication } from './application';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); let app: Awaited<ReturnType<typeof createApplication>>;
before(async () => { app = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011 }, services, dramaScriptMockAvailable: true, marketingCopyMockAvailable: true }); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
after(() => app.close());
async function guest() { const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } }); const session = response.json(); return { session, headers: { authorization: `Bearer ${session.token}` } }; }
test('marketing production plan is authenticated, free, bounded to supported durations and does not create a task', async () => {
  const owner = await guest(); const before = await services.billing.summary(owner.session.userId); const payload = { category: 'commerce', text: '口播：带上小猫，一起出门。\n画面：展示帆布袋。', durationSec: 5 };
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/production-plan', payload })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/production-plan', headers: owner.headers, payload: { ...payload, durationSec: 15 } })).statusCode, 400);
  const native = await app.inject({ method: 'POST', url: '/v2/marketing/production-plan', headers: owner.headers, payload: { ...payload, durationSec: 10 } });
  assert.equal(native.statusCode, 200); assert.equal(native.json().durationSec, 10); assert.equal(native.json().voiceover, payload.text.split('\n')[0].replace('口播：', '')); assert.equal(native.json().canGenerate, false);
  const result = await app.inject({ method: 'POST', url: '/v2/marketing/production-plan', headers: owner.headers, payload }); assert.equal(result.statusCode, 200); assert.equal(result.json().voiceover, '带上小猫，一起出门。'); assert.equal(result.json().canGenerate, false);
  assert.deepEqual(await services.billing.summary(owner.session.userId), before); assert.equal(await services.marketingCopies.latest({ userId: owner.session.userId, category: 'commerce' }), null);
});

test('batch HTTP requires owner and quoted scope, resumes one batch and returns a five-episode draft', async () => {
  const owner = await guest(); const other = await guest();
  const created = await app.inject({ method: 'POST', url: '/v2/drama/projects', headers: owner.headers, payload: { mode: 'idea', title: '五集HTTP', content: '橘猫驾驶飞船寻找月亮，共五站。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' } }); assert.equal(created.statusCode, 201);
  const project = created.json(); const url = `/v2/drama/projects/${project.id}`;
  assert.equal((await app.inject({ method: 'GET', url: `${url}/script-batch-quote` })).statusCode, 401);
  const quoted = await app.inject({ method: 'GET', url: `${url}/script-batch-quote`, headers: owner.headers }); assert.equal(quoted.statusCode, 200); assert.equal(quoted.json().credits, 0); assert.equal(quoted.json().toGenerate.length, 5);
  const body = { requestKey: randomUUID(), quoteVersion: quoted.json().version };
  assert.equal((await app.inject({ method: 'POST', url: `${url}/script-batches`, headers: owner.headers, payload: { ...body, credits: 0 } })).statusCode, 400);
  const response = await app.inject({ method: 'POST', url: `${url}/script-batches`, headers: owner.headers, payload: body }); assert.equal(response.statusCode, 201); const batch = response.json();
  assert.equal((await app.inject({ method: 'POST', url: `${url}/script-batches`, headers: owner.headers, payload: body })).json().id, batch.id);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/script-batches/${batch.id}`, headers: other.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `${url}/script-batches/latest`, headers: other.headers })).statusCode, 404);
  for (const episode of batch.episodes) await services.dramaScripts.receive({ userId: owner.session.userId, jobId: episode.jobId, response: { provider: 'mock', model: 'script-fixture-v1', responseId: randomUUID(), finishReason: 'stop', text: `## 第${episode.number}集\n**场景1：飞船 日/内**\n橘猫：出发。`, textTruncated: false, usage: null } });
  const result = (await app.inject({ method: 'GET', url: `${url}/script-batches/latest`, headers: owner.headers })).json(); assert.equal(result.status, 'succeeded'); assert.equal(result.draftVersion.parse.episodes.length, 5);
  assert.equal('binding' in result, false); assert.equal('userId' in result, false); assert.equal((await services.billing.summary(owner.session.userId)).balance, 80);
});

test('copy HTTP isolates categories and ownership, accepts only server-priced input and preserves the original source', async () => {
  const owner = await guest(); const other = await guest(); const input = { category: 'commerce', text: '橘猫图案的帆布袋。' };
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/copy/quote', payload: input })).statusCode, 401);
  const quote = (await app.inject({ method: 'POST', url: '/v2/marketing/copy/quote', headers: owner.headers, payload: input })).json(); assert.equal(quote.mode, 'mock');
  const body = { ...input, requestKey: randomUUID(), quoteVersion: quote.version };
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/copy/jobs', headers: owner.headers, payload: { ...body, model: 'forged' } })).statusCode, 400);
  const response = await app.inject({ method: 'POST', url: '/v2/marketing/copy/jobs', headers: owner.headers, payload: body }); assert.equal(response.statusCode, 201); const job = response.json();
  assert.equal((await app.inject({ method: 'GET', url: `/v2/marketing/copy/jobs/${job.id}`, headers: other.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/v2/marketing/copy/jobs/latest?category=store_visit', headers: owner.headers })).json(), null);
  await services.marketingCopies.receive({ userId: owner.session.userId, jobId: job.id, response: { provider: 'mock', model: 'marketing-copy-fixture-v1', responseId: randomUUID(), finishReason: 'stop', text: JSON.stringify({ text: '口播：让喜欢陪你出门。\n画面：展示帆布袋。', usedFacts: ['帆布袋'] }), textTruncated: false, usage: null } });
  const result = (await app.inject({ method: 'GET', url: `/v2/marketing/copy/jobs/${job.id}`, headers: owner.headers })).json(); assert.equal(result.status, 'succeeded'); assert.equal(result.sourceText, input.text); assert.equal('response' in result, false);
});

test('new real text admissions and copy ops stay closed without explicit configuration', async () => {
  const closed = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011 }, services: createServices(databaseUrl!) });
  try {
    await closed.init(); await closed.getHttpAdapter().getInstance().ready(); const user = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); const headers = { authorization: `Bearer ${user.token}` };
    const response = await closed.inject({ method: 'POST', url: '/v2/marketing/copy/quote', headers, payload: { category: 'store_visit', text: '木桌和窗边座位的咖啡店。' } }); assert.equal(response.json().mode, 'disabled');
    assert.equal((await closed.inject({ method: 'GET', url: '/v2/ops/review/marketing-copy', headers })).statusCode, 503);
    assert.equal((await services.billing.summary(user.userId)).balance, 80);
  } finally { await closed.close(); }
});
