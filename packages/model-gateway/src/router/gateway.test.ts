import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGatewayRouter,
  createEnvSecretResolver,
  createMemoryRateLimiter,
  GatewayError,
  type ChannelView,
  type GatewayResponse,
  type GatewayRouter,
  type VideoAdapter,
} from '../index';

/** 可编程 fake fetch:按 host 返回预设响应,记录调用。 */
function fakeFetch(routes: Record<string, Array<{ status: number; body?: unknown }>>, calls: string[] = []) {
  return (async (url: RequestInfo | URL): Promise<Response> => {
    const key = String(url);
    calls.push(key);
    const host = key.includes('volc.fake') ? 'volc' : 'atlas';
    const queue = routes[host] ?? [];
    const next = queue.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

/** 构造一个走 fake REST 的 adapter(POST 建 task 拿 id;GET 查状态)。 */
function restAdapter(host: string): VideoAdapter {
  return {
    async submit(ctx) {
      const res = await ctx.fetchImpl(`https://${host}/api/tasks`, { method: 'POST' });
      const body = (await res.json()) as { id: string };
      if (res.status >= 400) throw Object.assign(new Error(`${host} ${res.status}`), { status: res.status });
      return { providerTaskId: body.id, raw: body };
    },
    async poll(ctx, _channel, providerTaskId) {
      const res = await ctx.fetchImpl(`https://${host}/api/tasks/${providerTaskId}`, { method: 'GET' });
      const body = (await res.json()) as { status: string; content?: { video_url?: string } };
      return {
        status: body.status === 'succeeded' ? 'succeeded' : body.status === 'failed' ? 'failed' : 'processing',
        videoUrl: body.content?.video_url,
        raw: body,
      };
    },
  };
}

const VOLC: ChannelView = {
  id: 1, providerName: 'volcengine', name: '火山主通道', baseUrl: 'https://volc.fake',
  secretRef: 'volc-key', weight: 10, rpmLimit: null, status: 'active', health: 'ok',
  config: { model: 'doubao-seedance-2-0-fast' },
};
const ATLAS: ChannelView = {
  id: 2, providerName: 'atlas', name: 'Atlas 备用', baseUrl: 'https://atlas.fake',
  secretRef: 'atlas-key', weight: 5, rpmLimit: null, status: 'active', health: 'ok',
  config: {},
};

const RESOLVER = createEnvSecretResolver({
  refToEnv: { 'volc-key': 'VOLC_KEY', 'atlas-key': 'ATLAS_KEY' },
  env: { VOLC_KEY: 'sk-volc', ATLAS_KEY: 'sk-atlas' },
});

test('主通道 submit 成功:受理返回 providerTaskId,attempts 一次成功', async () => {
  const router = createGatewayRouter({
    channels: [VOLC],
    adapters: { volcengine: restAdapter('volc.fake') },
    secretResolver: RESOLVER,
    fetchImpl: fakeFetch({ volc: [{ status: 200, body: { id: 'task-001' } }] }),
  });

  const res = await router.dispatch({ modelName: 'seedance-2.0-fast', modelType: 'video', payload: { prompt: '测试' }, taskOperation: 'submit' });
  assert.equal(res.ok, true);
  assert.equal(res.providerTaskId, 'task-001');
  assert.equal(res.attempts.length, 1);
  assert.equal(res.attempts[0]?.ok, true);
  assert.equal(res.channelName, '火山主通道');
});

test('failover:主通道 5xx → 冷却换备用接住;下轮 dispatch 直达备用', async () => {
  let clock = 1_000_000;
  const router = createGatewayRouter({
    channels: [VOLC, { ...ATLAS, providerName: 'volcengine-backup' }],
    adapters: { volcengine: restAdapter('volc.fake'), 'volcengine-backup': restAdapter('atlas.fake') },
    secretResolver: RESOLVER,
    fetchImpl: fakeFetch({
      volc: [
        { status: 502 },
        { status: 200, body: { id: 'v-2' } }, // 冷却过期后主通道恢复
      ],
      atlas: [
        { status: 200, body: { id: 'a-1' } }, // 第一次 dispatch:failover 接住
        { status: 200, body: { id: 'a-2' } }, // 第二次 dispatch:主仍在冷却,备用再接
      ],
    }),
    now: () => clock,
    random: () => 0, // 稳定选第一个可用(主通道)
  });

  const res = await router.dispatch({ modelName: 'x', modelType: 'video', payload: {}, taskOperation: 'submit' });
  assert.equal(res.ok, true);
  assert.equal(res.channelName, 'Atlas 备用');
  assert.equal(res.attempts.filter((a) => !a.ok).length, 1, '主通道失败被记录');

  clock += 1;
  const res2 = await router.dispatch({ modelName: 'x', modelType: 'video', payload: {}, taskOperation: 'submit' });
  assert.equal(res2.attempts.length, 1);
  assert.equal(res2.channelName, 'Atlas 备用');
});

test('限流器单测:窗口内第二次消费被拒,过窗恢复', () => {
  const limiter = createMemoryRateLimiter();
  assert.deepEqual(limiter.consume('k', 1, { limit: 1, windowMs: 60000 }, 2000000), { ok: true });
  assert.equal(limiter.consume('k', 1, { limit: 1, windowMs: 60000 }, 2000000).ok, false, '窗口内超限拒绝');
  assert.ok(limiter.consume('k', 1, { limit: 1, windowMs: 60000 }, 2060001).ok, '过窗恢复');
});

test('限流:RPM 超限记 rate_limited 并 failover', async () => {
  const clock = 2_000_000;
  const router = createGatewayRouter({
    channels: [{ ...VOLC, rpmLimit: 1 }, { ...ATLAS, providerName: 'backup' }],
    adapters: { volcengine: restAdapter('volc.fake'), backup: restAdapter('atlas.fake') },
    secretResolver: RESOLVER,
    fetchImpl: fakeFetch({ volc: [{ status: 200, body: { id: 'a' } }], atlas: [{ status: 200, body: { id: 'c' } }] }),
    now: () => clock,
    random: () => 0,
  });

  const req = { modelName: 'x', modelType: 'video' as const, payload: {}, taskOperation: 'submit' as const };
  assert.equal((await router.dispatch(req)).ok, true);
  const second = await router.dispatch(req);
  assert.equal(second.channelName, 'Atlas 备用');
  assert.equal(second.attempts[0]?.errorCode, 'rate_limited');
});

test('切换演练(验收):火山主 vs Atlas 主,业务层同一调用点零改动', async () => {
  /** 业务层唯一调用点(切换时这行代码不变) */
  const submitVia = async (router: GatewayRouter): Promise<GatewayResponse> =>
    router.dispatch({ modelName: 'seedance-2.0-fast', modelType: 'video', payload: { prompt: 'p' }, taskOperation: 'submit' });

  const primaryVolc = createGatewayRouter({
    channels: [VOLC], adapters: { volcengine: restAdapter('volc.fake') }, secretResolver: RESOLVER,
    fetchImpl: fakeFetch({ volc: [{ status: 200, body: { id: 'v-1' } }] }),
  });
  const primaryAtlas = createGatewayRouter({
    channels: [{ ...ATLAS, weight: 10 }, VOLC], adapters: { atlas: restAdapter('atlas.fake') }, secretResolver: RESOLVER,
    fetchImpl: fakeFetch({ atlas: [{ status: 200, body: { id: 'a-1' } }] }), random: () => 0,
  });

  const r1 = await submitVia(primaryVolc);
  const r2 = await submitVia(primaryAtlas);
  assert.deepEqual(Object.keys(r1).sort(), Object.keys(r2).sort(), '返回形状一致');
  assert.equal(r1.ok, r2.ok);
  assert.equal(r1.providerTaskId, 'v-1');
  assert.equal(r2.providerTaskId, 'a-1');
});

test('poll 复用受理 channel;4xx 客户端错误不 failover', async () => {
  const calls: string[] = [];
  const router = createGatewayRouter({
    channels: [VOLC, ATLAS],
    adapters: { volcengine: restAdapter('volc.fake'), atlas: restAdapter('atlas.fake') },
    secretResolver: RESOLVER,
    fetchImpl: fakeFetch({
      volc: [
        { status: 200, body: { id: 't-9' } },
        { status: 200, body: { status: 'succeeded', content: { video_url: 'https://cdn/x.mp4' } } },
      ],
    }, calls),
    random: () => 0,
  });

  const submitted = await router.dispatch({ modelName: 'x', modelType: 'video', payload: {}, taskOperation: 'submit' });
  const polled = await router.dispatch({
    modelName: 'x', modelType: 'video', payload: { providerTaskId: submitted.providerTaskId },
    taskOperation: 'poll', channelId: submitted.channelId,
  });
  const body = polled.body as { status: string; videoUrl?: string };
  assert.equal(body.status, 'succeeded');
  assert.equal(body.videoUrl, 'https://cdn/x.mp4');
  assert.ok(calls.every((c) => c.includes('volc.fake')), 'poll 只打受理 channel');

  const strict = createGatewayRouter({
    channels: [VOLC, ATLAS], adapters: { volcengine: restAdapter('volc.fake'), atlas: restAdapter('atlas.fake') }, secretResolver: RESOLVER,
    fetchImpl: fakeFetch({ volc: [{ status: 400, body: { error: 'bad prompt' } }] }),
  });
  await assert.rejects(
    () => strict.dispatch({ modelName: 'x', modelType: 'video', payload: {}, taskOperation: 'submit' }),
    (e: GatewayError) => e.code === 'upstream_failed',
  );
});

test('凭证缺失:secret_missing 渠道被冷却,failover 到有凭证的', async () => {
  const resolver = createEnvSecretResolver({ refToEnv: { 'volc-key': 'MISSING_ENV', 'atlas-key': 'ATLAS_KEY' }, env: { ATLAS_KEY: 'sk' } });
  const adapter: VideoAdapter = {
    submit: async () => ({ providerTaskId: 'ok', raw: {} }),
    poll: async () => ({ status: 'queued', raw: {} }),
  };
  const router = createGatewayRouter({
    channels: [VOLC, { ...ATLAS, providerName: 'volcengine' }],
    adapters: { volcengine: adapter }, secretResolver: resolver, random: () => 0,
  });
  const res = await router.dispatch({ modelName: 'x', modelType: 'video', payload: {}, taskOperation: 'submit' });
  assert.equal(res.ok, true);
  assert.equal(res.channelName, 'Atlas 备用');
});
