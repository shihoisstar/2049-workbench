import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { ErrorCode, GenerationList, GenerationQuote, GenerationView, GuestSession, generationQuoteVersion } from '@wb/contracts';
import { createServices } from '@wb/server';
import { createApplication } from './application';
import type { ObjectStore } from '@wb/media';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const appPromise = createApplication({ config: { databaseUrl, port: 3011 }, services, generationAvailable: true });
before(async () => {
  const app = await appPromise;
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
after(async () => { await (await appPromise).close(); });
const settings = { resolution: '480p', aspectRatio: '9:16', durationSec: 5 } as const;
const input = () => ({ ...settings, requestKey: randomUUID(), prompt: '清晨咖啡店的暖光', quoteVersion: generationQuoteVersion(settings) });

test('owner-only paginated works survive new inserts and exclude internal fields', async () => {
  const app = await appPromise;
  const a = await login(); const b = await login();
  const list = (suffix = '', headers = a.headers) => app.inject({ method: 'GET', url: `/v2/generation${suffix}`, headers });
  assert.equal((await app.inject({ method: 'GET', url: '/v2/generation' })).statusCode, 401);
  assert.deepEqual(GenerationList.parse((await list()).json()), { items: [], nextCursor: null });
  const ids = new Set<string>();
  for (let i = 0; i < 22; i++) {
    const job = await services.generation.create({ ...settings, requestKey: randomUUID(), prompt: `作品 ${i}`, userId: a.userId });
    ids.add(job.id);
    await services.generation.fail({ userId: a.userId, jobId: job.id, failureCode: 'TEST_FAILURE' });
  }
  const firstResponse = await list(); assert.equal(firstResponse.statusCode, 200);
  const first = GenerationList.parse(firstResponse.json());
  assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  assert.equal('userId' in firstResponse.json().items[0], false);
  assert.equal('outputRef' in firstResponse.json().items[0], false);
  await services.generation.create({ ...settings, requestKey: randomUUID(), prompt: '分页期间的新任务', userId: a.userId });
  const second = GenerationList.parse((await list(`?cursor=${first.nextCursor}`)).json());
  assert.equal(second.items.length, 2); assert.equal(second.nextCursor, null);
  assert.deepEqual(new Set([...first.items, ...second.items].map(item => item.id)), ids);
  assert.equal((await list(`?cursor=${first.nextCursor}`, b.headers)).statusCode, 404);
  assert.equal(GenerationList.parse((await list('', b.headers)).json()).items.length, 0);
  for (const query of ['?cursor=bad', `?userId=${b.userId}`, '?limit=999']) assert.equal((await list(query)).statusCode, 400);
});
async function login() {
  const app = await appPromise;
  const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } });
  assert.equal(response.statusCode, 200);
  const session = GuestSession.parse(response.json());
  return { ...session, headers: { authorization: `Bearer ${session.token}` } };
}

test('quote validates supported settings and never reserves credits', async () => {
  const app = await appPromise;
  const a = await login();
  for (const [resolution, credits] of [['480p', 77], ['720p', 368]] as const) {
    const response = await app.inject({ method: 'POST', url: '/v2/generation/quote', payload: { ...settings, resolution } });
    assert.equal(response.statusCode, 200);
    assert.equal(GenerationQuote.parse(response.json()).credits, credits);
  }
  for (const payload of [{ ...settings, durationSec: 10 }, { ...settings, resolution: '1080p' }, { ...settings, credits: 1 }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/v2/generation/quote', payload })).statusCode, 400);
  }
  assert.equal((await services.billing.summary(a.userId)).balance, 80);
});

test('20 simultaneous HTTP submissions create one job and one reservation; changed payload conflicts', async () => {
  const app = await appPromise;
  const a = await login();
  const payload = input();
  const responses = await Promise.all(Array.from({ length: 20 }, () => app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload })));
  for (const response of responses) assert.equal(response.statusCode, 200, response.body);
  const jobs = responses.map(response => GenerationView.parse(response.json()));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  const wallet = await services.billing.summary(a.userId);
  assert.equal(wallet.balance, 3);
  assert.equal(wallet.entries.filter(entry => entry.type === 'hold').length, 1);
  const changed = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload: { ...payload, prompt: 'different' } });
  assert.equal(changed.statusCode, 409);
});

test('ownership comes from session; invalid IDs and extra fields never reach persistence', async () => {
  const app = await appPromise;
  const a = await login();
  const b = await login();
  for (const extra of [{ userId: b.userId }, { credits: 1 }, { imageUrls: ['https://example.com/private'] }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload: { ...input(), ...extra } })).statusCode, 400);
  }
  const response = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload: input() });
  const job = GenerationView.parse(response.json());
  assert.equal((await app.inject({ method: 'GET', url: `/v2/generation/${job.id}`, headers: b.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/v2/generation/not-uuid', headers: a.headers })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/generation/${job.id}` })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v2/generation', payload: input() })).statusCode, 401);
  assert.equal((await services.billing.summary(b.userId)).balance, 80);
  for (const key of ['userId', 'outputRef', 'actualCostCents', 'model']) assert.equal(key in response.json(), false);
});

test('stale quote and insufficient funds leave the wallet unchanged', async () => {
  const app = await appPromise;
  const a = await login();
  const stale = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload: { ...input(), quoteVersion: 'stale' } });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, ErrorCode.QUOTE_CHANGED);
  const high = { ...settings, resolution: '720p' } as const;
  const denied = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers,
    payload: { ...input(), ...high, quoteVersion: generationQuoteVersion(high) } });
  assert.equal(denied.statusCode, 402);
  assert.equal(denied.json().code, ErrorCode.INSUFFICIENT_CREDITS);
  assert.equal((await services.billing.summary(a.userId)).balance, 80);
});

test('terminal failure is visible and replay does not reserve again after refund', async () => {
  const app = await appPromise;
  const a = await login();
  const payload = input();
  const submitted = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload });
  const job = GenerationView.parse(submitted.json());
  await services.generation.fail({ userId: a.userId, jobId: job.id, failureCode: 'test-provider-failed' });
  const replay = await app.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload });
  assert.equal(replay.statusCode, 200);
  assert.equal(GenerationView.parse(replay.json()).status, 'failed');
  assert.equal((await services.billing.summary(a.userId)).balance, 80);
});

test('default bootstrap rejects generation before reserving any credits', async () => {
  const closed = await createApplication({ config: { databaseUrl, port: 3011 } });
  await closed.init();
  await closed.getHttpAdapter().getInstance().ready();
  try {
    const a = await login();
    const quote = await closed.inject({ method: 'POST', url: '/v2/generation/quote', payload: settings });
    assert.equal(GenerationQuote.parse(quote.json()).available, false);
    const response = await closed.inject({ method: 'POST', url: '/v2/generation', headers: a.headers, payload: input() });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().code, ErrorCode.GENERATION_UNAVAILABLE);
    assert.equal((await services.billing.summary(a.userId)).balance, 80);
  } finally { await closed.close(); }
});

test('only the owner of a published asset receives a short-lived media URL', async () => {
  const a = await login();
  const b = await login();
  const accepted = await services.generation.create({ userId: a.userId, requestKey: randomUUID(), prompt: 'Media', ...settings });
  let signed = 0;
  const store: ObjectStore = { probe: async () => {}, put: async () => {}, remove: async () => {}, close() {},
    access: async (_key, seconds) => { signed++; assert.ok(seconds > 0 && seconds <= 600); return 'https://private.invalid/video.mp4?signature=test'; } };
  const mediaServices = createServices(databaseUrl);
  const mediaApp = await createApplication({ config: { databaseUrl, port: 3011 }, services: mediaServices, objectStore: store });
  await mediaApp.init(); await mediaApp.getHttpAdapter().getInstance().ready();
  try {
    const url = `/v2/generation/${accepted.id}/media`;
    assert.equal((await mediaApp.inject({ method: 'GET', url, headers: a.headers })).statusCode, 404);
    const sha256 = 'b'.repeat(64);
    await services.assets.publish({ userId: a.userId, jobId: accepted.id, objectKey: `jobs/${accepted.id}/${sha256}.mp4`, sha256, byteLength: 2048, width: 480, height: 854, durationMs: 5000 });
    assert.equal((await mediaApp.inject({ method: 'GET', url })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'GET', url, headers: b.headers })).statusCode, 404);
    assert.equal(signed, 0);
    const own = await mediaApp.inject({ method: 'GET', url, headers: a.headers });
    assert.equal(own.statusCode, 200);
    assert.equal(own.headers['cache-control'], 'no-store');
    assert.equal(own.json().sha256, sha256);
    assert.equal(signed, 1);
    assert.equal('objectKey' in own.json(), false);
  } finally { await mediaApp.close(); }
});
