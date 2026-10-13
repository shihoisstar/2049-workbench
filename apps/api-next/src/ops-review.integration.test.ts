import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { GuestSession, OpsReviewActionResult, OpsReviewList } from '@wb/contracts';
import { createServices } from '@wb/server';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const appPromise = createApplication({ config: { databaseUrl, port: 3012 }, services, generationAvailable: true });
const opsToken = 'test-ops-token';
const opsServices = createServices(databaseUrl);
const opsAppPromise = createApplication({ config: { databaseUrl, port: 3013, opsToken }, services: opsServices, generationAvailable: true });
before(async () => {
  for (const app of [await appPromise, await opsAppPromise]) {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
});
after(async () => {
  await (await appPromise).close();
  await (await opsAppPromise).close();
});
const settings = { resolution: '480p', aspectRatio: '9:16', durationSec: 5 } as const;
const opsHeaders = { 'x-ops-token': opsToken };

async function login() {
  const app = await appPromise;
  const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } });
  assert.equal(response.statusCode, 200);
  const session = GuestSession.parse(response.json());
  return { ...session, headers: { authorization: `Bearer ${session.token}` } };
}

/** 走一遍真实受理链路后由提交前失败转入 unknown,与 worker 素材过期分支落库结果一致。 */
async function unknownJob() {
  const user = await login();
  await services.billing.grant({ userId: user.userId, billingKey: `grant:${randomUUID()}`, amount: 1000 });
  const balanceBefore = (await services.billing.summary(user.userId)).balance;
  const job = await services.generation.create({ userId: user.userId, requestKey: randomUUID(), prompt: '素材近过期,提交前转人工', ...settings, materialIds: [] });
  const claim = await services.providerSubmissions.begin({ userId: user.userId, jobId: job.id, providerKey: 'mock' });
  assert.equal(claim.claimed, true);
  await services.providerSubmissions.unknown({ userId: user.userId, jobId: job.id, token: claim.token });
  return { user, job, balanceBefore };
}

test('ops review stays closed without a configured token and demands an exact match otherwise', async () => {
  const app = await appPromise;
  assert.equal((await app.inject({ method: 'GET', url: '/v2/ops/review/generations' })).statusCode, 503);
  assert.equal((await app.inject({ method: 'GET', url: '/v2/ops/review/generations', headers: { 'x-ops-token': 'anything' } })).statusCode, 503);
  const ops = await opsAppPromise;
  assert.equal((await ops.inject({ method: 'GET', url: '/v2/ops/review/generations' })).statusCode, 401);
  assert.equal((await ops.inject({ method: 'GET', url: '/v2/ops/review/generations', headers: { 'x-ops-token': 'wrong' } })).statusCode, 401);
  const list = await ops.inject({ method: 'GET', url: '/v2/ops/review/generations', headers: opsHeaders });
  assert.equal(list.statusCode, 200);
  const parsed = OpsReviewList.parse(list.json());
  assert.ok(Array.isArray(parsed.items), '受理队列是全局运营面,只校验结构,不假设为空');
});

test('ops receipt registers a late provider task and resumes; duplicate receipt conflicts', async () => {
  const ops = await opsAppPromise;
  const { job } = await unknownJob();
  const listed = OpsReviewList.parse((await ops.inject({ method: 'GET', url: '/v2/ops/review/generations', headers: opsHeaders })).json());
  const found = listed.items.filter(item => item.jobId === job.id);
  assert.equal(found.length, 1, '新转入人工的任务应出现在受理队列中');
  assert.equal(found[0].prompt, '素材近过期,提交前转人工');
  assert.ok(found[0].reservedCredits > 0);
  assert.equal((await ops.inject({ method: 'POST', url: '/v2/ops/review/generations/not-a-uuid/receipt', payload: { providerTaskId: 'task-1' }, headers: opsHeaders })).statusCode, 400);
  assert.equal((await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/receipt`, payload: {}, headers: opsHeaders })).statusCode, 400);
  const receipt = await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/receipt`, payload: { providerTaskId: 'task-1' }, headers: opsHeaders });
  assert.equal(receipt.statusCode, 200);
  assert.deepEqual(OpsReviewActionResult.parse(receipt.json()), { jobId: job.id, action: 'receipt', status: 'accepted' });
  const after = OpsReviewList.parse((await ops.inject({ method: 'GET', url: '/v2/ops/review/generations', headers: opsHeaders })).json());
  assert.ok(!after.items.some(item => item.jobId === job.id), '受理后任务应出队');
  assert.equal((await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/receipt`, payload: { providerTaskId: 'task-2' }, headers: opsHeaders })).statusCode, 409);
});

test('ops reject refunds the reservation exactly once and fails the job', async () => {
  const ops = await opsAppPromise;
  const { user, job, balanceBefore } = await unknownJob();
  const balanceReserved = (await services.billing.summary(user.userId)).balance;
  assert.ok(balanceReserved < balanceBefore, '创建任务应预留积分');
  const rejected = await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/reject`, headers: opsHeaders });
  assert.equal(rejected.statusCode, 200);
  assert.deepEqual(OpsReviewActionResult.parse(rejected.json()), { jobId: job.id, action: 'reject', status: 'failed' });
  assert.equal((await services.billing.summary(user.userId)).balance, balanceBefore, '拒收应退还全部预留积分');
  assert.equal((await services.generation.get({ userId: user.userId, jobId: job.id })).status, 'failed');
  assert.equal((await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/reject`, headers: opsHeaders })).statusCode, 409);
});

test('ops actions on jobs without an unknown submission are not found', async () => {
  const ops = await opsAppPromise;
  const user = await login();
  await services.billing.grant({ userId: user.userId, billingKey: `grant:${randomUUID()}`, amount: 1000 });
  const job = await services.generation.create({ userId: user.userId, requestKey: randomUUID(), prompt: '未提交过受理', ...settings, materialIds: [] });
  assert.equal((await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/reject`, headers: opsHeaders })).statusCode, 404);
  assert.equal((await ops.inject({ method: 'POST', url: `/v2/ops/review/generations/${job.id}/receipt`, payload: { providerTaskId: 'task-1' }, headers: opsHeaders })).statusCode, 404);
});
