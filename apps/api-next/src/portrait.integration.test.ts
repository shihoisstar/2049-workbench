import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createServices, portraitBinding } from '@wb/server';
import { SaveDramaPreparation } from '@wb/contracts';
import { createApplication } from './application';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); let app: Awaited<ReturnType<typeof createApplication>>;
const opsToken = `fixture-${randomUUID()}`;
before(async () => { app = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011, opsToken }, services }); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
after(() => app.close());
test('portrait HTTP is disabled by default, strict and owner scoped; internal fields and legacy routes stay private', async () => {
  const user = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); const userId = user.userId;
  const other = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const headers = { authorization: `Bearer ${user.token}` };
  const project = await services.drama.create({ userId, mode: 'script', title: '形象HTTP', content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const draft = await services.drama.getPreparation(input);
  const saved = await services.drama.savePreparation({ ...input, draft: SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
    roles: draft.roles.map(({ key, name, usage }) => ({ key, name, usage, description: '橘猫' })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) }) });
  const request = { roleKey: saved.roles[0].key, preparationRevision: saved.revision }; const url = `/v2/drama/projects/${project.id}/portrait-quote`;
  assert.equal((await app.inject({ method: 'POST', url, payload: request })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url, payload: request, headers: { authorization: `Bearer ${other.token}` } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url, payload: { ...request, credits: 0 }, headers })).statusCode, 400);
  const quote = await app.inject({ method: 'POST', url, payload: request, headers }); assert.equal(quote.statusCode, 200); assert.equal(quote.json().mode, 'disabled');
  const offer = { binding: portraitBinding('mock'), credits: 7 }; const internalQuote = await services.rolePortraits.quote({ ...input, request, offer }); assert.ok(internalQuote.version);
  const submission = { ...request, requestKey: randomUUID(), quoteVersion: internalQuote.version };
  assert.equal((await app.inject({ method: 'POST', url: url.replace('portrait-quote', 'portrait-jobs'), payload: submission, headers })).statusCode, 503);
  const job = await services.rolePortraits.create({ ...input, request: submission, offer });
  const detail = await app.inject({ method: 'GET', url: `/v2/drama/portrait-jobs/${job.id}`, headers }); assert.equal(detail.statusCode, 200);
  for (const hidden of ['providerKey', 'providerTaskId', 'prompt', 'objectKey', 'actualCostCents']) assert.equal(hidden in detail.json(), false);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/portrait-jobs/${job.id}`, headers: { authorization: `Bearer ${other.token}` } })).statusCode, 404);
  for (const suffix of ['', '/media']) assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/image-jobs/${job.id}${suffix}`, headers })).statusCode, 404);
  const replay = await app.inject({ method: 'POST', url: url.replace('portrait-quote', 'portrait-jobs'), payload: submission, headers }); assert.equal(replay.statusCode, 201); assert.equal(replay.json().id, job.id);
  assert.equal((await app.inject({ method: 'GET', url: `${url.replace('portrait-quote', 'portrait-jobs')}?roleKey=${request.roleKey}`, headers })).json().items.length, 1);
  assert.equal((await app.inject({ method: 'POST', url: `/v2/drama/portrait-jobs/${job.id}/select`, headers, payload: { preparationRevision: saved.revision, materialId: randomUUID() } })).statusCode, 400);
  const reviewUrl = '/v2/ops/review/portraits'; const opsHeaders = { 'x-ops-token': opsToken };
  assert.equal((await app.inject({ method: 'GET', url: reviewUrl, headers })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: reviewUrl, headers: { 'x-ops-token': 'wrong' } })).statusCode, 401);
  const claim = await services.dramaImageSubmissions.begin({ userId, jobId: job.id, providerKey: offer.binding.providerKey }); assert.ok(claim.claimed);
  await services.dramaImageSubmissions.unknown({ userId, jobId: job.id, token: claim.token });
  const queue = await app.inject({ method: 'GET', url: reviewUrl, headers: opsHeaders }); assert.equal(queue.statusCode, 200); assert.ok(queue.json().items.some((item: { jobId: string }) => item.jobId === job.id)); assert.equal(queue.body.includes(claim.token), false);
  const decision = { action: 'reject', requestKey: randomUUID(), reason: '供应商人工核对明确没有受理', evidenceReference: 'fixture-ticket', confirmedNotAccepted: true };
  assert.equal((await app.inject({ method: 'POST', url: `${reviewUrl}/${job.id}`, headers: opsHeaders, payload: { ...decision, confirmedNotAccepted: false } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `${reviewUrl}/${job.id}`, headers: opsHeaders, payload: { ...decision, userId } })).statusCode, 400);
  const resolved = await app.inject({ method: 'POST', url: `${reviewUrl}/${job.id}`, headers: opsHeaders, payload: decision }); assert.equal(resolved.statusCode, 200); assert.equal(resolved.json().job.status, 'failed'); assert.equal((await services.billing.summary(userId)).balance, 80);
});

test('portrait ops disabled without explicit credential', async () => {
  const disabled = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011 } });
  try { await disabled.init(); await disabled.getHttpAdapter().getInstance().ready(); assert.equal((await disabled.inject({ method: 'GET', url: '/v2/ops/review/portraits', headers: { 'x-ops-token': opsToken } })).statusCode, 503); }
  finally { await disabled.close(); }
});

test('storyboard HTTP creates a free empty-cast draft, rejects forged source and isolates owners', async () => {
  const user = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); const other = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const headers = { authorization: `Bearer ${user.token}` }; const input = { userId: user.userId };
  const project = await services.drama.create({ ...input, mode: 'script', title: '空镜草稿', content: '## 第1集\n**场景1：云海 日/外**\n（云层散开。）', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const owner = { ...input, projectId: project.id }; await services.dramaScripts.confirm({ ...owner, versionId: project.activeVersionId! });
  const initial = await services.drama.getPreparation(owner);
  const prepared = await services.drama.savePreparation({ ...owner, draft: { scriptVersionId: initial.scriptVersionId, baseRevision: 0, roles: [], scenes: initial.scenes.map(({ key, description }) => ({ key, description })) } });
  const url = `/v2/drama/projects/${project.id}/storyboard-plan`; const request = { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision };
  assert.equal((await app.inject({ method: 'GET', url, headers })).json(), null);
  assert.equal((await app.inject({ method: 'POST', url, headers, payload: { ...request, shots: [] } })).statusCode, 400);
  const result = await app.inject({ method: 'POST', url, headers, payload: request }); assert.equal(result.statusCode, 200); const plan = result.json(); assert.equal(plan.shots.length, 1); assert.equal(plan.roles.length, 0);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/storyboard-plans/${plan.id}`, headers: { authorization: `Bearer ${other.token}` } })).statusCode, 404);
  const change = { baseRevision: plan.revision, shotKey: plan.shots[0].key, content: '云海空镜', roleKeys: [], reviewed: true };
  assert.equal((await app.inject({ method: 'POST', url: `/v2/drama/storyboard-plans/${plan.id}`, headers, payload: { ...change, sourceText: '伪造' } })).statusCode, 400);
  const saved = await app.inject({ method: 'POST', url: `/v2/drama/storyboard-plans/${plan.id}`, headers, payload: change }); assert.equal(saved.statusCode, 200); assert.equal(saved.json().revision, 2); assert.equal(saved.json().shots[0].sourceText, '（云层散开。）');
  assert.equal((await services.billing.summary(user.userId)).balance, 80);
});
