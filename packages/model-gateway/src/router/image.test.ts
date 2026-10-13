import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atlasImageAdapter } from './image';
import type { ChannelView } from './types';

const channel = (config: Record<string, unknown>): ChannelView => ({
  id: 1, providerName: 'atlas', name: 'atlas', baseUrl: 'https://atlas.invalid', secretRef: 'key',
  weight: 1, rpmLimit: null, status: 'active', health: 'ok', config,
});
test('image endpoints accept documented top-level receipts and outputs without another POST', async () => {
  let posts = 0;
  const context = { secret: 'fixture', timeoutMs: 1000, fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => { if (init?.method === 'POST') { posts++; return Response.json({ id: 'image-1' }); } return Response.json({ status: 'completed', outputs: ['https://images.invalid/image.png'] }); } };
  assert.equal((await atlasImageAdapter.submitImage(context, channel({}), { modelName: 'fixture', prompt: 'cat' })).providerTaskId, 'image-1');
  assert.equal((await atlasImageAdapter.pollImage(context, channel({}), 'image-1')).status, 'succeeded'); assert.equal(posts, 1);
});

test('portrait submit pins format and async parameters; poll rejects uncertainty but empty completed output is terminal', async () => {
  let body: Record<string, unknown> | undefined;
  const submit = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)); return Response.json({ data: { id: 'fixture/id' } });
  }) as typeof fetch;
  await atlasImageAdapter.submitImage({ secret: 'fixture', fetchImpl: submit, timeoutMs: 1000 }, channel({}), { modelName: 'fixture', prompt: 'cat', aspectRatio: '3:4', resolution: '1k', outputFormat: 'png' });
  assert.equal(body?.aspect_ratio, '3:4'); assert.equal(body?.resolution, '1k'); assert.equal(body?.output_format, 'png');
  assert.equal(body?.enable_sync_mode, false); assert.equal(body?.enable_base64_output, false);
  for (const payload of [{}, { data: { status: 'unexpected' } }]) {
    await assert.rejects(atlasImageAdapter.pollImage({ secret: 'fixture', timeoutMs: 1000, fetchImpl: async () => Response.json(payload) }, channel({}), 'id'));
  }
  await assert.rejects(atlasImageAdapter.pollImage({ secret: 'fixture', timeoutMs: 1000, fetchImpl: async () => new Response('', { status: 503 }) }, channel({}), 'id'));
  const empty = await atlasImageAdapter.pollImage({ secret: 'fixture', timeoutMs: 1000, fetchImpl: async () => Response.json({ data: { status: 'completed', outputs: [] } }) }, channel({}), 'id');
  assert.equal(empty.status, 'failed');
  const done = await atlasImageAdapter.pollImage({ secret: 'fixture', timeoutMs: 1000, fetchImpl: async url => {
    assert.ok(String(url).endsWith('/fixture%2Fid')); return Response.json({ data: { status: 'completed', outputs: ['https://image.invalid/a.png'] } });
  } }, channel({}), 'fixture/id'); assert.equal(done.status, 'succeeded');
});

test('reference-to-image models receive the documented images array', async () => {
  let body: Record<string, unknown> | undefined;
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: { id: 'task-1' } }), { status: 200 });
  }) as typeof fetch;
  await atlasImageAdapter.submitImage({ secret: 'secret', fetchImpl, timeoutMs: 1000 }, channel({
    modelImageEdit: 'google/nano-banana-2/reference-to-image', imageReferenceField: 'images',
  }), { modelName: 'ignored', prompt: 'same character', imageUrls: ['https://example.test/reference.png'] });
  assert.deepEqual(body?.images, ['https://example.test/reference.png']);
  assert.equal(body?.image_url, undefined);
  assert.equal(body?.image_urls, undefined);
});

test('default image editing keeps the legacy reference fields', async () => {
  let body: Record<string, unknown> | undefined;
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: { id: 'task-1' } }), { status: 200 });
  }) as typeof fetch;
  await atlasImageAdapter.submitImage({ secret: 'secret', fetchImpl, timeoutMs: 1000 }, channel({
    modelImageEdit: 'bytedance/seedream-v4.7/edit',
  }), { modelName: 'ignored', prompt: 'same character', imageUrls: ['https://example.test/reference.png'] });
  assert.equal(body?.image_url, 'https://example.test/reference.png');
  assert.deepEqual(body?.image_urls, ['https://example.test/reference.png']);
  assert.equal(body?.images, undefined);
});
