import { test } from 'node:test';
import assert from 'node:assert/strict';

import { atlasVideoAdapter } from './atlas';
import type { AdapterContext, ChannelView, GatewayRequest } from '../types';

const CHANNEL: ChannelView = {
  id: 2, providerName: 'atlas', name: 'Atlas', baseUrl: 'https://atlas.fake',
  secretRef: 'atlas-key', weight: 5, rpmLimit: null, status: 'active', health: 'ok',
  config: { model: 'kling-v1' },
};

function ctxWith(routes: Record<string, Array<{ status: number; body: unknown }>>, calls: Array<{ url: string; init?: RequestInit }> = []): AdapterContext {
  return {
    secret: 'sk-atlas',
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, init });
      const queue = routes[key] ?? [];
      const next = queue.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    timeoutMs: 3000,
  };
}

const REQ: GatewayRequest = {
  modelName: 'kling-v1',
  modelType: 'video',
  payload: { prompt: '测试', aspectRatio: '9:16', resolution: '480p', durationSec: 5 },
  taskOperation: 'submit',
};

test('submit:POST generateVideo,duration 为数字(真机验证结论),返回任务 id', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const ctx = ctxWith({ 'https://atlas.fake/api/v1/model/generateVideo': [{ status: 200, body: { data: { id: 'atlas-1' } } }] }, calls);
  const res = await atlasVideoAdapter.submit(ctx, CHANNEL, REQ);
  assert.equal(res.providerTaskId, 'atlas-1');
  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.model, 'kling-v1');
  assert.equal(body.duration, 5, '必须数字,字符串会被上游拒(2049-agent 真机验证)');
  assert.equal(body.aspect_ratio, '9:16');
  assert.ok(String(calls[0]?.url).includes('/api/v1/model/generateVideo'));
});

test('poll:completed 取 outputs[0];failed → failed;pending → queued', async () => {
  const done = ctxWith({ 'https://atlas.fake/api/v1/model/prediction/a1': [{ status: 200, body: { data: { status: 'completed', outputs: ['https://cdn/a.mp4'] } } }] });
  const doneRes = await atlasVideoAdapter.poll(done, CHANNEL, 'a1', REQ);
  assert.equal(doneRes.status, 'succeeded');
  assert.equal(doneRes.videoUrl, 'https://cdn/a.mp4');

  const failed = ctxWith({ 'https://atlas.fake/api/v1/model/prediction/a2': [{ status: 200, body: { data: { status: 'failed', error: 'x' } } }] });
  assert.equal((await atlasVideoAdapter.poll(failed, CHANNEL, 'a2', REQ)).status, 'failed');

  const pending = ctxWith({ 'https://atlas.fake/api/v1/model/prediction/a3': [{ status: 200, body: { data: { status: 'pending' } } }] });
  assert.equal((await atlasVideoAdapter.poll(pending, CHANNEL, 'a3', REQ)).status, 'queued');
});

test('submit:4xx/无 id 抛错(带 status,供 router 分类)', async () => {
  const e1 = ctxWith({ 'https://atlas.fake/api/v1/model/generateVideo': [{ status: 400, body: { error: 'bad' } }] });
  await assert.rejects(() => atlasVideoAdapter.submit(e1, CHANNEL, REQ), (e: { status?: number }) => e.status === 400);

  const e2 = ctxWith({ 'https://atlas.fake/api/v1/model/generateVideo': [{ status: 200, body: { data: {} } }] });
  await assert.rejects(() => atlasVideoAdapter.submit(e2, CHANNEL, REQ), (e: { status?: number }) => e.status === 502);
});
