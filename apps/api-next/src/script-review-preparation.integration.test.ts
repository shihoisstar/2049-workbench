import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { buildScriptRequest, createServices, scriptProviderBinding } from '@wb/server';
import { SaveDramaPreparation } from '@wb/contracts';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const opsToken = `fixture-${randomUUID()}`;
let app: Awaited<ReturnType<typeof createApplication>>;
before(async () => { app = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011, opsToken }, services }); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
after(() => app.close());
async function owner() {
  const session = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  return { userId: session.userId, headers: { authorization: `Bearer ${session.token}` } };
}
test('script ops requires its credential and rejects unverified rejection payloads', async () => {
  const user = await owner(); const url = '/v2/ops/review/drama-scripts';
  assert.equal((await app.inject({ method: 'GET', url, headers: user.headers })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url, headers: { 'x-ops-token': 'incorrect' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url, headers: { 'x-ops-token': opsToken } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: `${url}/${randomUUID()}`, headers: { 'x-ops-token': opsToken }, payload: { action: 'reject', requestKey: randomUUID(), reason: '超时所以想直接退款', evidenceReference: 'timeout' } })).statusCode, 400);
  const disabled = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011 } });
  try { await disabled.init(); await disabled.getHttpAdapter().getInstance().ready(); assert.equal((await disabled.inject({ method: 'GET', url, headers: { 'x-ops-token': opsToken } })).statusCode, 503); }
  finally { await disabled.close(); }
});
test('script ops resolves owner from stored job and returns audited refund without token leakage', async () => {
  const user = await owner(); const project = await services.drama.create({ userId: user.userId, mode: 'idea', title: '核对HTTP', content: '橘猫出发', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
  const binding = scriptProviderBinding({ model: 'fixture', baseUrl: 'https://script.invalid' });
  const admission = { offer: { binding, credits: 7, estimatedCostCents: null }, mockAvailable: false };
  const quote = await services.dramaScripts.quote({ ...user, projectId: project.id, admission }); assert.ok(quote.version);
  const job = await services.dramaScripts.create({ userId: user.userId, projectId: project.id, requestKey: randomUUID(), quoteVersion: quote.version, admission });
  const locator = { userId: user.userId, jobId: job.id };
  const claim = await services.dramaScripts.beginSubmission({ ...locator, binding, request: buildScriptRequest(await services.dramaScripts.snapshot(locator), binding) }); assert.ok(claim.claimed);
  await services.dramaScripts.submissionUnknown({ ...locator, token: claim.token });
  const url = `/v2/ops/review/drama-scripts/${job.id}`;
  const body = { action: 'reject', requestKey: randomUUID(), reason: '供应商工单确认没有受理请求', evidenceReference: 'fixture-ticket', confirmedNotAccepted: true };
  assert.equal((await app.inject({ method: 'POST', url, headers: { 'x-ops-token': opsToken }, payload: { ...body, userId: randomUUID() } })).statusCode, 400);
  const result = await app.inject({ method: 'POST', url, headers: { 'x-ops-token': opsToken }, payload: body });
  assert.equal(result.statusCode, 200); assert.equal(result.json().job.billingStatus, 'refunded'); assert.equal(result.json().review.authSource, 'ops-token');
  assert.equal(result.body.includes(claim.token), false); assert.equal((await services.billing.summary(user.userId)).balance, 80);
});
test('preparation HTTP persists editable fields but not forged evidence or other owners', async () => {
  const user = await owner(); const other = await owner();
  const project = await services.drama.create({ userId: user.userId, mode: 'script', title: '准备HTTP', content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const url = `/v2/drama/projects/${project.id}/preparation`;
  assert.equal((await app.inject({ method: 'GET', url, headers: user.headers })).statusCode, 409);
  await services.dramaScripts.confirm({ userId: user.userId, projectId: project.id, versionId: project.activeVersionId! });
  const read = await app.inject({ method: 'GET', url, headers: user.headers }); assert.equal(read.statusCode, 200);
  const initial = read.json();
  const draft = SaveDramaPreparation.parse({ scriptVersionId: initial.scriptVersionId, baseRevision: 0,
    roles: initial.roles.map((role: { key: string; name: string; usage: string }) => ({ key: role.key, name: role.name, usage: role.usage, description: '蓝围巾' })),
    scenes: initial.scenes.map((scene: { key: string }) => ({ key: scene.key, description: '' })) });
  assert.equal((await app.inject({ method: 'POST', url, headers: other.headers, payload: draft })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url, headers: user.headers, payload: { ...draft, roles: [{ ...draft.roles[0], evidence: ['伪造'] }] } })).statusCode, 400);
  const saved = await app.inject({ method: 'POST', url, headers: user.headers, payload: draft }); assert.equal(saved.statusCode, 200); assert.equal(saved.json().revision, 1);
  assert.equal((await app.inject({ method: 'GET', url, headers: user.headers })).json().roles[0].description, '蓝围巾');
});
