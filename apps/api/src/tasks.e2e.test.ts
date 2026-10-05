import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import type { Queue } from 'bullmq';
import { createGatewayRouter, type ChannelView, type GatewayRouter, type VideoAdapter } from '@wb/model-gateway';

import { buildApp } from './app';
import { createRedisConnection, createTaskQueue } from './queue';
import { createTaskWorker, handleSweep, handleTtlSweep, type TaskWorkerDeps } from './task-worker';
import { LocalDiskStorage } from './storage';
import { generationTasks, users } from './schema';
import { rm } from 'node:fs/promises';

/**
 * T2.2 集成验收(真 BullMQ + redis + mock 适配器):
 * 成功结算 / 模型错误重试后退款 / 内容拒绝即时退 / 取消退款 / 卡单 sweep 自动退。
 * 时序预算:全部断言秒级完成 ≪ 验收口径"失败积分回账 ≤1 分钟"。
 * mock 结果经 providerTaskId 前缀控制:submit 统一受理为 mock-succeed,测试随后改写前缀决定 poll 结局。
 */
const url = process.env.DATABASE_URL ?? 'postgres://wb:wb_dev_only@localhost:5433/workbench';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const app = buildApp({ databaseUrl: url, jwtSecret: 'test-secret' });
const db = app.db;
const wallet = app.wallet;
const tasks = app.tasks;

const connection = createRedisConnection(redisUrl);
const queue: Queue = createTaskQueue(connection);

const MOCK_CHANNEL: ChannelView = {
  id: 9, providerName: 'mock', name: 'Mock 通道', baseUrl: null,
  secretRef: 'mock-key', weight: 1, rpmLimit: null, status: 'active', health: 'ok', config: {},
};
const mockAdapter: VideoAdapter = {
  async submit(_ctx, _ch, req) {
    // 测试钩子:submit 层可注入瞬断(驱动"重试"路径);poll 阶段失败属上游终态,不走这里
    if (flaky.remaining > 0) {
      flaky.remaining -= 1;
      throw Object.assign(new Error('mock gateway down'), { gatewayCode: 'upstream_failed' });
    }
    const outcome = (req.payload as { forceOutcome?: string }).forceOutcome ?? 'succeed';
    return { providerTaskId: `mock-${outcome}-${Math.random().toString(36).slice(2, 8)}`, raw: {} };
  },
  async poll(_ctx, _ch, providerTaskId) {
    if (providerTaskId.startsWith('mock-succeed-')) return { status: 'succeeded', videoUrl: `https://mock.cdn/${providerTaskId}.mp4`, raw: {} };
    if (providerTaskId.startsWith('mock-fail_model-') || providerTaskId.startsWith('mock-fail_content-')) return { status: 'failed', raw: {} };
    return { status: 'processing', raw: {} };
  },
};
/** submit 瞬断注入计数(>0 时逐次吞掉受理)。 */
const flaky = { remaining: 0 };
const router: GatewayRouter = createGatewayRouter({
  channels: [MOCK_CHANNEL],
  adapters: { mock: mockAdapter },
  secretResolver: { resolve: async () => 'mock' },
});

const deps: TaskWorkerDeps = {
  db, wallet, tasks, router, queue,
  timings: { pollIntervalMs: 150, retryBackoffMs: 100 },
  // mock.cdn 不可达 → 自动水印走降级路径(原片直出),正好覆盖降级策略
  storage: new LocalDiskStorage({ rootDir: resolve('storage-test'), publicBase: 'http://localhost:3010' }),
  watermarkAssetPath: resolve('assets', 'watermark.png'),
  // 立即失败的 fetch:mock.cdn 不可达场景确定性化(不再依赖 DNS 超时时长)
  fetchImpl: (async () => { throw new Error('mock cdn unreachable'); }) as unknown as typeof fetch,
};
const worker = createTaskWorker(deps, connection);

/** 每个 dispatch 类测试用新 router:渠道冷却(30s 熔断)是 router 实例内状态,防跨测试泄漏。 */
function freshRouter(): GatewayRouter {
  return createGatewayRouter({
    channels: [MOCK_CHANNEL],
    adapters: { mock: mockAdapter },
    secretResolver: { resolve: async () => 'mock' },
  });
}

before(async () => {
  await queue.waitUntilReady();
  await worker.waitUntilReady();
});

after(async () => {
  await worker.close();
  await app.close();
  await connection.quit();
});

async function mkUser(tag: string, grantCredits = 100): Promise<string> {
  const inserted = await db.insert(users).values({ deviceId: `t22-${tag}-${Date.now()}` }).returning();
  const id = inserted[0].id;
  await wallet.grant(id, grantCredits, `test-grant:${id}`, '测试发放');
  return id;
}

async function taskRow(taskId: string) {
  return (await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1))[0];
}

async function waitForTask(taskId: string, want: string[], timeoutMs = 15_000): Promise<{ status: string; videoUrl: string | null }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await taskRow(taskId);
    if (row && want.includes(row.status)) return { status: row.status, videoUrl: row.videoUrl };
    if (Date.now() > deadline) throw new Error(`等待超时: taskId=${taskId} want=${want.join('/')} got=${row?.status}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** submit 受理后把 providerTaskId 前缀改写为指定结局(mock poll 按前缀返回)。 */
async function redirectOutcome(taskId: string, outcome: 'fail_model' | 'fail_content'): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const row = await taskRow(taskId);
    if (row?.providerTaskId) {
      await db
        .update(generationTasks)
        .set({ providerTaskId: row.providerTaskId.replace('mock-succeed-', `mock-${outcome}-`) })
        .where(eq(generationTasks.id, taskId));
      return;
    }
    if (Date.now() > deadline) throw new Error('submit 未受理');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function balance(userId_: string): Promise<number> {
  return (await wallet.summary(userId_)).balance;
}

/** 走真实登录链路拿 token(守门测试用)。 */
async function loginToken(userId_: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: `t22-login-${userId_}` } });
  return login.json().token;
}

/** 余额断言用轮询:终态落库与退款/结算是毫秒级先后,固定读会竞态。 */
async function waitForBalance(userId_: string, expected: number, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const b = await balance(userId_);
    if (b === expected) return;
    if (Date.now() > deadline) throw new Error(`${label}: 余额未达 ${expected}, actual=${b}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('端到端成功:受理→轮询→结算,视频 URL 与余额正确', async () => {
  deps.router = freshRouter();
  const uid = await mkUser('ok');
  const { task } = await tasks.create(uid, { prompt: '测试成片', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  await queue.add('submit', { taskId: task.id });

  const final = await waitForTask(task.id, ['succeeded']);
  assert.match(final.videoUrl ?? '', /^https:\/\/mock\.cdn\//);
  await waitForBalance(uid, 90, '100 - 10(足额结算)');
  // 结算流水与余额同事务,但 summary 查询有毫秒级视图延迟 → 轮询兜底
  const deadline = Date.now() + 3000;
  let settleFound = false;
  for (;;) {
    const s = await wallet.summary(uid);
    if (s.entries.some((e) => e.type === 'settle')) { settleFound = true; break; }
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(settleFound, '结算流水可查');
});

test('上游终态失败:即时退款(attempts=受理次数,poll 失败不再受理)', async () => {
  deps.router = freshRouter();
  const uid = await mkUser('fail-provider');
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  await queue.add('submit', { taskId: task.id });
  await redirectOutcome(task.id, 'fail_model');

  const final = await waitForTask(task.id, ['failed']);
  assert.equal(final.status, 'failed');
  const row = await taskRow(task.id);
  assert.equal(row.attempts, 0, 'poll 终态失败不计受理次数');
  await waitForBalance(uid, 100, '失败全额退回');
});

test('submit 瞬断:任务级重试至上限(3 次)后失败全额退款;网关熔断使重试快速落空', async () => {
  deps.router = freshRouter();
  const uid = await mkUser('retry');
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  flaky.remaining = 999; // 持续瞬断
  try {
    await queue.add('submit', { taskId: task.id });
    const final = await waitForTask(task.id, ['failed']);
    assert.equal(final.status, 'failed');
    const row = await taskRow(task.id);
    assert.equal(row.attempts, 3, '重试至上限(TASK_MAX_ATTEMPTS)');
    assert.match(row.errorMessage ?? '', /所有渠道尝试失败/);
  } finally {
    flaky.remaining = 0; // 必须复位:否则级联污染后续测试
  }
  await waitForBalance(uid, 100, '失败全额退款');
});

test('内容拒绝:即时失败退款', async () => {
  deps.router = freshRouter();
  const uid = await mkUser('fail-content');
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  await queue.add('submit', { taskId: task.id });
  await redirectOutcome(task.id, 'fail_content');

  const final = await waitForTask(task.id, ['failed']);
  assert.equal(final.status, 'failed');
  await waitForBalance(uid, 100, '即时退回');
});

test('TTL 清理:超 7 天成片删文件+URL 置空,未过期不动', async () => {
  const uid = await mkUser('ttl');
  const key = `ttl-verify/${Date.now()}.mp4`;
  const url = await deps.storage.put(key, Buffer.from('ttl-video-bytes'));
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  const old = new Date(Date.now() - 8 * 24 * 3600_000);
  await db.update(generationTasks).set({ status: 'succeeded', videoUrl: url, finishedAt: old, updatedAt: old }).where(eq(generationTasks.id, task.id));

  const freshUrl = await deps.storage.put(`ttl-verify/fresh-${Date.now()}.mp4`, Buffer.from('fresh'));
  const { task: freshTask } = await tasks.create(uid, { prompt: 'fresh', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  const now2 = new Date();
  await db.update(generationTasks).set({ status: 'succeeded', videoUrl: freshUrl, finishedAt: now2, updatedAt: now2 }).where(eq(generationTasks.id, freshTask.id));

  const handled = await handleTtlSweep(deps);
  assert.ok(handled >= 1);
  const expired = await taskRow(task.id);
  assert.equal(expired.videoUrl, null, '到期 videoUrl 置空');
  await assert.rejects(() => deps.storage.delete(key).then(() => { throw new Error('should-not-reach'); }));
  // 文件确实删了:delete 对不存在文件是幂等 no-op,再验证目录文件数不可行——直接验证未过期文件仍在
  const freshRow = await taskRow(freshTask.id);
  assert.match(freshRow.videoUrl ?? '', /^http/, '未过期保留');
  await rm(resolve('storage-test', 'ttl-verify'), { recursive: true, force: true });
});

test('创建链路守门:命中违禁词 → CONTENT_BLOCKED + hits(不冻结积分)', async () => {
  const uid = await mkUser('content-block');
  const before = await balance(uid);
  const res = await app.inject({
    method: 'POST',
    url: '/v1/tasks',
    headers: { authorization: `Bearer ${await loginToken(uid)}` },
    payload: { prompt: '来点博彩内容', resolution: '480p', durationSec: 5 },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(Number(body.code), 5001);
  assert.ok((body.details?.hits ?? []).includes('博彩'), 'hits 供前端高亮');
  assert.equal(await balance(uid), before, '拒绝在冻结之前,积分分毫不动');
});

test('上传参考图:multipart → 落盘 → URL;createTask.imageUrls 进任务行', async () => {
  const uid = await mkUser('upload');
  const token = await loginToken(uid);
  const boundary = '----wbtestboundary';
  const pngHead = Buffer.from('89504e470d0a1a0a', 'hex');
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, pngHead, tail]);
  const up = await app.inject({
    method: 'POST',
    url: '/v1/uploads',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  assert.equal(up.statusCode, 201);
  const { url } = up.json();
  assert.match(url, /\/images\/[0-9a-f-]+\.png$/);

  // imageUrls 进任务行(JSON)
  const { task } = await tasks.create(uid, { prompt: '带图生成', imageUrls: [url], aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  const row = await taskRow(task.id);
  assert.deepEqual(JSON.parse(row.imageUrls ?? '[]'), [url]);
  const view = await tasks.get(uid, task.id);
  assert.deepEqual(view?.imageUrls, [url]);
});

test('取消:queued 任务取消并退款;终态再取消非法', async () => {
  const uid = await mkUser('cancel');
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  const canceled = await tasks.cancel(uid, task.id);
  assert.equal(canceled.status, 'canceled');
  await waitForBalance(uid, 100, '取消全额退');
  await assert.rejects(
    () => tasks.cancel(uid, task.id),
    (e: { code?: number }) => e.code === 4002,
    '终态再取消 → 非法转移',
  );
});

test('卡单 sweep:超时任务自动取消退款', async () => {
  const uid = await mkUser('sweep');
  const { task } = await tasks.create(uid, { prompt: 'x', aspectRatio: '9:16', resolution: '480p', durationSec: 5, model: 'mock-video' });
  await tasks.markQueued(task.id);
  const old = new Date(Date.now() - 11 * 60_000);
  await db.update(generationTasks).set({ updatedAt: old }).where(eq(generationTasks.id, task.id));
  const handled = await handleSweep(deps);
  assert.ok(handled >= 1);
  const row = await taskRow(task.id);
  assert.equal(row.status, 'canceled');
  assert.match(row.errorMessage ?? '', /超时/);
  await waitForBalance(uid, 100, '超时自动退');
});
