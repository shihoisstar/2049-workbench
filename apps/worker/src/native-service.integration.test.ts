import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServices, nativeMarketingBinding, NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from '@wb/server';
import { atlasVideoAdapter, createGatewayRouter } from '@wb/model-gateway';
import type { ChannelView } from '@wb/model-gateway';
import type { ObjectStore } from '@wb/media';
import { createVideoSubmissionActivity, createVideoPollingActivity } from './video-submission';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
after(() => services.close());
const baseUrl = 'https://atlas.invalid'; const binding = nativeMarketingBinding(baseUrl);
const channel: ChannelView = { id: 2, providerName: 'atlas', name: 'native-fixture', baseUrl, secretRef: 'fixture', weight: 1, rpmLimit: null, status: 'active', health: 'ok', config: { model: NATIVE_VIDEO_TEXT_MODEL, modelI2v: NATIVE_VIDEO_REFERENCE_MODEL, videoModels: { '720p': NATIVE_VIDEO_TEXT_MODEL } } };
async function fixture(images: boolean) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const materialIds: string[] = []; const referenceBytes = new Map<string, Buffer>();
  if (images) for (let i = 0; i < 2; i++) { const bytes = Buffer.from(`fixture-image-${i}`); const sha256 = createHash('sha256').update(bytes).digest('hex'); const m = await services.materials.register({ userId, objectKey: `materials/${userId}/${sha256}.png`, sha256, byteLength: bytes.length, width: 720, height: 1280, contentType: 'image/png', expiresAt: new Date(Date.now() + 3600000).toISOString() }); materialIds.push(m.id); referenceBytes.set(m.objectKey, bytes); }
  const request = { category: images ? 'commerce' as const : 'store_visit' as const, prompt: '口播：带上小猫，一起出门。\n画面：保持用户提供的资料。', materialIds, durationSec: 10 as const, resolution: '720p' as const, aspectRatio: '9:16' as const };
  const offer = { binding, credits: 7 }; const quote = await services.nativeMarketing.quote({ userId, request, offer, mockAvailable: false });
  const job = await services.nativeMarketing.create({ userId, request: { ...request, requestKey: randomUUID(), quoteVersion: quote.version! }, offer, mockAvailable: false });
  return { userId, jobId: job.id, referenceBytes };
}
function client(reply: (url: string, init: RequestInit) => Promise<Response>) {
  return createGatewayRouter({ channels: [channel], adapters: { atlas: atlasVideoAdapter }, secretResolver: { resolve: async () => 'fixture-only' }, maxAttempts: 1,
    fetchImpl: (async (url, init) => { assert.ok(String(url).startsWith(baseUrl + '/api/v1/model/')); return reply(String(url), init!); }) as typeof fetch });
}
test('formal native jobs serialize the accepted audio settings and preserve reference order, one POST after restart', async () => {
  for (const images of [false, true]) {
    const input = await fixture(images); const posts: Record<string, unknown>[] = []; let gets = 0;
    const gateway = client(async (_url, init) => { if (init.method === 'POST') { posts.push(JSON.parse(String(init.body))); return Response.json({ data: { id: 'native-receipt' } }); } gets++; return Response.json({ data: { status: 'completed', outputs: ['https://media.invalid/source.mp4'] } }); });
    const references: string[] = []; const store: ObjectStore = { access: async (key: string) => { references.push(key); return `https://media.invalid/${key}`; }, probe: async () => {}, close: () => {}, put: async () => { throw new Error('Unexpected write'); }, read: async (key: string) => { references.push(key); const bytes = input.referenceBytes.get(key); assert.ok(bytes); return bytes; }, remove: async () => { throw new Error('Unexpected delete'); } };
    const options = { services, gateway, channel, nativeBinding: binding, objectStore: store };
    await Promise.all(Array.from({ length: 8 }, () => createVideoSubmissionActivity(options)(input)));
    const restarted = createServices(databaseUrl!); try { assert.equal((await createVideoSubmissionActivity({ ...options, services: restarted })(input)).status, 'submitted'); } finally { await restarted.close(); }
    assert.equal(posts.length, 1); const payload = posts[0]; assert.equal(payload.model, images ? NATIVE_VIDEO_REFERENCE_MODEL : NATIVE_VIDEO_TEXT_MODEL); assert.equal(payload.duration, 10); assert.equal(payload.resolution, '720p'); assert.equal(payload.ratio, '9:16'); assert.equal(payload.generate_audio, true); assert.equal(payload.bitrate_mode, 'high'); assert.equal('aspect_ratio' in payload, false);
    assert.match(String(payload.prompt), /不编造价格/); assert.match(String(payload.prompt), /标准普通话/); assert.match(String(payload.prompt), /字幕在后期/);
    if (images) { assert.match(String(payload.prompt), /必须由画面中的同一位成年女主人公亲口说出/); assert.match(String(payload.prompt), /不能使用画外旁白/); assert.match(String(payload.prompt), /一句说完再切商品特写/); }
    else assert.doesNotMatch(String(payload.prompt), /本片是人物现场对白型剧情/);
    if (images) assert.deepEqual(payload.reference_images, references.map(key => `data:image/png;base64,${input.referenceBytes.get(key)!.toString('base64')}`)); else assert.equal('reference_images' in payload, false);
    assert.equal((await createVideoPollingActivity(options)(input)).status, 'ready_for_media'); assert.equal(gets, 1); assert.equal((await services.billing.summary(input.userId)).balance, 73);
  }
});
test('native configuration mismatch cannot obtain submission rights or send a request', async () => {
  const input = await fixture(false); let calls = 0; const gateway = client(async () => { calls++; throw new Error('Must not call'); });
  for (const changed of [undefined, nativeMarketingBinding('https://other.invalid')]) await assert.rejects(createVideoSubmissionActivity({ services, gateway, channel, nativeBinding: changed })(input));
  assert.equal(calls, 0); assert.equal(await services.providerSubmissions.get(input), null);
});

test('changed reference bytes reject before paid networking and return the reservation', async () => {
  const input = await fixture(true); let posts = 0; const gateway = client(async () => { posts++; throw new Error('Must not call'); });
  const store: ObjectStore = { probe: async () => {}, close: () => {}, access: async () => { throw new Error('Must not sign native references'); }, read: async () => Buffer.from('changed'), put: async () => {}, remove: async () => {} };
  assert.equal((await createVideoSubmissionActivity({ services, gateway, channel, nativeBinding: binding, objectStore: store })(input)).status, 'rejected');
  assert.equal(posts, 0); assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
test('native response loss retains exactly one submission and held funds, explicit rejection refunds once', async () => {
  for (const code of [0, 422]) {
    const input = await fixture(false); let posts = 0;
    const gateway = client(async () => { posts++; if (!code) throw new Error('Response lost after acceptance'); return Response.json({ error: 'fixture rejection' }, { status: code }); });
    const options = { services, gateway, channel, nativeBinding: binding };
    await createVideoSubmissionActivity(options)(input); await createVideoSubmissionActivity(options)(input); assert.equal(posts, 1);
    assert.equal((await services.providerSubmissions.get(input))?.status, code ? 'rejected' : 'unknown');
    const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, code ? 80 : 73); assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, code ? 1 : 0);
  }
});
