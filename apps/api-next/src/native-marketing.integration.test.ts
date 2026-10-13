import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { NativeMarketingQuote, GenerationView, GuestSession, NativeCaptionReview } from '@wb/contracts';
import type { ObjectStore } from '@wb/media';
import { createServices, nativeMarketingBinding } from '@wb/server';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const signed: { key: string; ttl: number }[] = [];
const objectStore = { access: async (key: string, ttl: number) => { signed.push({ key, ttl }); return 'https://media.invalid/private-preview'; } } as ObjectStore;
const appPromise = createApplication({ config: { databaseUrl, port: 3011 }, services, generationAvailable: true, nativeMarketingMockAvailable: true, objectStore });
const closedPromise = createApplication({ config: { databaseUrl, port: 3011 } });
const formalPromise = createApplication({ config: { databaseUrl, port: 3011, nativeMarketingOffer: { binding: nativeMarketingBinding('https://atlas.invalid'), credits: 7 } } });
const repricedPromise = createApplication({ config: { databaseUrl, port: 3011, nativeMarketingOffer: { binding: nativeMarketingBinding('https://atlas.invalid'), credits: 9 } } });
before(async () => { for (const app of await Promise.all([appPromise, closedPromise, formalPromise, repricedPromise])) { await app.init(); await app.getHttpAdapter().getInstance().ready(); } });
after(async () => { await (await appPromise).close(); await (await closedPromise).close(); await (await formalPromise).close(); await (await repricedPromise).close(); });
const input = () => ({ category: 'commerce' as const, prompt: '口播：带上小猫，一起出门。\n画面：保持帆布袋和猫咪图案。', durationSec: 10 as const, resolution: '720p' as const, aspectRatio: '9:16' as const, materialIds: [] as string[] });
async function login() { const session = GuestSession.parse((await (await appPromise).inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } })).json()); return { userId: session.userId, headers: { authorization: `Bearer ${session.token}` } }; }
async function quote(owner: Awaited<ReturnType<typeof login>>, body = input()) { const response = await (await appPromise).inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: body }); assert.equal(response.statusCode, 200); return NativeMarketingQuote.parse(response.json()); }
async function material(owner: Awaited<ReturnType<typeof login>>, expired = false, ttlMs = 3600000) {
  const sha256 = randomBytes(32).toString('hex'); const item = await services.materials.register({ userId: owner.userId, objectKey: `materials/${owner.userId}/${sha256}.png`, sha256, byteLength: 100, contentType: 'image/png', width: 400, height: 600, expiresAt: new Date(Date.now() + (expired ? 1000 : ttlMs)).toISOString() });
  if (expired) await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(item.expiresAt) - Date.now() + 30)));
  return item;
}

test('native quote requires identity, strict 10-second settings and closed admission has no fabricated price', async () => {
  const app = await appPromise; const owner = await login();
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', payload: input() })).statusCode, 401);
  for (const change of [{ durationSec: 5 }, { durationSec: 15 }, { resolution: '480p' }, { model: 'cheap' }, { credits: 1 }]) assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: { ...input(), ...change } })).statusCode, 400);
  const closed = NativeMarketingQuote.parse((await (await closedPromise).inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: input() })).json());
  assert.equal(closed.mode, 'disabled'); assert.equal(closed.credits, null); assert.equal(closed.version, null); assert.equal(closed.available, false);
  assert.equal((await services.billing.summary(owner.userId)).balance, 80);
});

test('native quote binds owner, prompt, category and ordered material contents without reserving', async () => {
  const owner = await login(); const other = await login(); const a = await material(owner), b = await material(owner);
  const first = await quote(owner); assert.equal(first.credits, 7); assert.equal(first.mode, 'mock');
  assert.notEqual(first.version, (await quote(other)).version);
  assert.notEqual(first.version, (await quote(owner, { ...input(), prompt: '改过的故事' })).version);
  const category = await (await appPromise).inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: { ...input(), category: 'store_visit' } }); assert.notEqual(first.version, category.json().version);
  assert.notEqual((await quote(owner, { ...input(), materialIds: [a.id, b.id] })).version, (await quote(owner, { ...input(), materialIds: [b.id, a.id] })).version);
  assert.equal((await services.billing.summary(owner.userId)).balance, 80);
});

test('foreign or expired materials and mismatched quotes cannot charge the wallet', async () => {
  const owner = await login(); const stranger = await login(); const foreign = await material(stranger), expired = await material(owner, true); const app = await appPromise;
  for (const [id, status] of [[foreign.id, 404], [expired.id, 409]] as const) assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: { ...input(), materialIds: [id] } })).statusCode, status);
  const offer = await quote(owner); const submission = { ...input(), requestKey: randomUUID(), quoteVersion: offer.version! };
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: { ...submission, prompt: '新内容' } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: '/v2/generation', headers: owner.headers, payload: submission })).statusCode, 400);
  await assert.rejects(services.generation.create({ ...input(), requestKey: randomUUID(), userId: owner.userId }));
  assert.equal((await services.billing.summary(owner.userId)).balance, 80);
});

test('concurrent identical submissions reserve once and survive closed admission, expiry and page reload', async () => {
  const owner = await login(); const app = await appPromise; const item = await material(owner, false, 5000); const content = { ...input(), materialIds: [item.id] }; const offer = await quote(owner, content);
  const request = { ...content, requestKey: randomUUID(), quoteVersion: offer.version! };
  const responses = await Promise.all(Array.from({ length: 12 }, () => app.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: request })));
  responses.forEach(r => assert.equal(r.statusCode, 200)); const jobs = responses.map(r => GenerationView.parse(r.json())); assert.equal(new Set(jobs.map(j => j.id)).size, 1);
  assert.equal(jobs[0].provider, 'mock'); assert.equal(jobs[0].durationSec, 10); assert.equal('nativeQuoteVersion' in responses[0].json(), false); assert.equal('model' in responses[0].json(), false);
  assert.equal((await services.billing.summary(owner.userId)).balance, 73);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(item.expiresAt) - Date.now() + 30)));
  const replay = await (await closedPromise).inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: request }); assert.equal(replay.statusCode, 200); assert.equal(replay.json().id, jobs[0].id);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/generation/${jobs[0].id}`, headers: owner.headers })).json().durationSec, 10);
  const stranger = await login(); assert.equal((await app.inject({ method: 'GET', url: `/v2/generation/${jobs[0].id}`, headers: stranger.headers })).statusCode, 404);
  const conflicting = await app.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: { ...request, quoteVersion: 'a'.repeat(64) } }); assert.equal(conflicting.statusCode, 409);
  await services.generation.fail({ userId: owner.userId, jobId: jobs[0].id, failureCode: 'MOCK_ADMISSION_REVIEW_FINISHED' });
  assert.equal((await services.billing.summary(owner.userId)).balance, 80);
});

test('native caption endpoints authorize source access, strip private fields and replay exact confirmation', async () => {
  const owner = await login(), stranger = await login(); const app = await appPromise; const offer = await quote(owner);
  const job = GenerationView.parse((await app.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: { ...input(), requestKey: randomUUID(), quoteVersion: offer.version! } })).json());
  const locator = { userId: owner.userId, jobId: job.id }; const url = `/v2/marketing/video/${job.id}`;
  const empty = await app.inject({ method: 'GET', url: `${url}/review`, headers: owner.headers }); assert.equal(empty.statusCode, 200); assert.equal(empty.json(), null);
  const receipt = await services.providerSubmissions.begin({ ...locator, providerKey: 'http-fixture' }); assert.ok(receipt.claimed);
  await services.providerSubmissions.accepted({ ...locator, token: receipt.token, providerTaskId: 'native-http-fixture' });
  const sha256 = 'a'.repeat(64); const objectKey = `native-marketing-source/${job.id}/${sha256}.mp4`;
  await services.nativeMedia.capture({ ...locator, sha256, objectKey, byteLength: 100, width: 720, height: 1280, durationMs: 10000 });
  const cues = [{ startMs: 500, endMs: 2000, text: '一起出门。' }]; await services.nativeMedia.recognize({ ...locator, sourceSha256: sha256, transcript: '一起出门。', cues });
  const before = signed.length;
  for (const suffix of ['source', 'review']) assert.equal((await app.inject({ method: 'GET', url: `${url}/${suffix}`, headers: stranger.headers })).statusCode, 404);
  assert.equal(signed.length, before, 'foreign access must not sign a URL');
  const access = await app.inject({ method: 'GET', url: `${url}/source`, headers: owner.headers }); assert.equal(access.statusCode, 200); assert.equal(signed.at(-1)?.key, objectKey); assert.ok(signed.at(-1)!.ttl <= 600); assert.equal('objectKey' in access.json(), false);
  const view = (await app.inject({ method: 'GET', url: `${url}/review`, headers: owner.headers })).json(); assert.equal(NativeCaptionReview.parse(view).state, 'review'); assert.equal('objectKey' in view, false); assert.equal('sha256' in view, false);
  const payload = { requestKey: randomUUID(), revision: 1, cues };
  assert.equal((await app.inject({ method: 'POST', url: `${url}/review`, headers: owner.headers, payload: { ...payload, userId: stranger.userId } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `${url}/review`, headers: stranger.headers, payload })).statusCode, 404);
  for (let i = 0; i < 2; i++) { const response = await app.inject({ method: 'POST', url: `${url}/review`, headers: owner.headers, payload }); assert.equal(response.statusCode, 200); assert.equal(response.json().confirmationRequestKey, payload.requestKey); }
  assert.equal((await app.inject({ method: 'POST', url: `${url}/resume`, headers: owner.headers, payload: { sourceUrl: 'https://attacker.invalid' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `${url}/resume`, headers: owner.headers, payload: {} })).statusCode, 204);
  assert.equal((await services.billing.summary(owner.userId)).balance, 73);
});

test('formal native HTTP quote freezes price, hides binding, rejects invalid references before hold and restores after closure', async () => {
  const owner = await login(); const app = await formalPromise; const changed = await repricedPromise;
  const quoted = await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: input() }); assert.equal(quoted.statusCode, 200);
  const offer = NativeMarketingQuote.parse(quoted.json()); assert.equal(offer.mode, 'atlas'); assert.equal(offer.credits, 7);
  const submission = { ...input(), requestKey: randomUUID(), quoteVersion: offer.version! };
  assert.equal((await changed.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: submission })).statusCode, 409);
  const sha256 = randomBytes(32).toString('hex'); const small = await services.materials.register({ userId: owner.userId, objectKey: `materials/${owner.userId}/${sha256}.png`, sha256, byteLength: 100, contentType: 'image/png', width: 128, height: 128, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const invalid = await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: { ...input(), materialIds: [small.id] } }); assert.equal(invalid.statusCode, 400); assert.equal(invalid.json().code, 4009);
  const nearExpiry = await material(owner, false, 60000);
  assert.equal((await app.inject({ method: 'POST', url: '/v2/marketing/video/quote', headers: owner.headers, payload: { ...input(), materialIds: [nearExpiry.id] } })).statusCode, 409);
  assert.equal((await services.billing.summary(owner.userId)).balance, 80);
  const admitted = await app.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: submission }); assert.equal(admitted.statusCode, 200);
  const job = GenerationView.parse(admitted.json()); assert.equal(job.provider, 'atlas'); assert.equal('nativeBinding' in admitted.json(), false);
  for (const reopened of [changed, await closedPromise]) { const replay = await reopened.inject({ method: 'POST', url: '/v2/marketing/video', headers: owner.headers, payload: submission }); assert.equal(replay.statusCode, 200); assert.equal(replay.json().id, job.id); assert.equal(replay.json().reservedCredits, 7); }
  assert.equal((await services.billing.summary(owner.userId)).balance, 73);
  const view = await services.generation.get({ userId: owner.userId, jobId: job.id }); assert.equal(view.nativeBinding, nativeMarketingBinding('https://atlas.invalid')); assert.equal(view.model, 'bytedance/seedance-2.0-fast/text-to-video');
});
