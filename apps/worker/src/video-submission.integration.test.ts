import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DRAMA_IMAGE_PRICING, SIGNUP_GRANT_CREDITS } from '@wb/contracts';
import { createServices } from '@wb/server';
import { createGatewayRouter } from '@wb/model-gateway';
import type { ChannelView, VideoAdapter } from '@wb/model-gateway';
import { createCandidateImageFailActivity, createCandidateImagePublishingActivity, createCandidateImageSubmissionActivity } from './candidate-image';
import { createVideoPollingActivity, createVideoSubmissionActivity } from './video-submission';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
after(() => services.close());
const channel: ChannelView = { id: 1, providerName: 'fake', name: 'fake', baseUrl: 'https://provider.fake',
  secretRef: 'test', weight: 1, rpmLimit: null, status: 'active', health: 'ok', config: { model: 'test-model' } };
function gateway(adapter: VideoAdapter) {
  return createGatewayRouter({ channels: [channel, { ...channel, id: 2, name: 'backup' }],
    adapters: { fake: adapter }, secretResolver: { resolve: async () => 'test-only' }, random: () => 0 });
}
async function job(category?: 'commerce' | 'store_visit') {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const created = await services.generation.create({ userId, requestKey: randomUUID(), prompt: 'A shop', category, resolution: '480p', aspectRatio: '9:16', durationSec: 5, materialIds: [] });
  return { userId, jobId: created.id };
}

test('native admission previews cannot reach an actual supplier before the media pipeline is enabled', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const request = { category: 'store_visit', prompt: '店铺内容确认', durationSec: 10, resolution: '720p', aspectRatio: '9:16', materialIds: [] } as const;
  const content = { ...request, materialIds: [] };
  const quote = await services.nativeMarketing.quote({ userId, request: content, mockAvailable: true });
  const created = await services.nativeMarketing.create({ userId, request: { ...content, requestKey: randomUUID(), quoteVersion: quote.version! }, mockAvailable: true });
  let posts = 0; const client = gateway({ async submit() { posts++; throw new Error('Must not submit'); }, async poll() { throw new Error('Must not poll'); } });
  const locator = { userId, jobId: created.id };
  await assert.rejects(createVideoSubmissionActivity({ services, gateway: client, channel })(locator));
  assert.equal(posts, 0); assert.equal(await services.providerSubmissions.get(locator), null);
  await services.generation.fail({ ...locator, failureCode: 'MOCK_ADMISSION_REVIEW_FINISHED' });
});

test('marketing submissions carry category-specific context and retain old generic prompts', async () => {
  for (const category of ['commerce', 'store_visit', undefined] as const) {
    const input = await job(category); let prompt: unknown; let posts = 0;
    const client = gateway({ async submit(_ctx, _channel, request) { posts++; prompt = request.payload.prompt; return { providerTaskId: randomUUID(), raw: {} }; }, async poll() { throw new Error('unexpected poll'); } });
    const submit = createVideoSubmissionActivity({ services, gateway: client, channel });
    await submit(input); await submit(input); assert.equal(posts, 1);
    if (!category) assert.equal(prompt, 'A shop');
    else {
      assert.equal(typeof prompt, 'string'); assert.match(String(prompt), category === 'commerce' ? /剧情带货/ : /探店/);
      assert.match(String(prompt), /不编造价格/); assert.ok(String(prompt).endsWith('A shop'));
    }
  }
});

async function candidateImageJob() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '候选图', content: '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const sourceHash = randomBytes(32).toString('hex');
  const material = await services.materials.register({ userId, objectKey: `materials/${userId}/${sourceHash}.jpg`, sha256: sourceHash, byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString() });
  const role = await services.drama.createRole({ userId, projectId: project.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: material.id });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜站台。' });
  const shot = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
  const candidate = await services.drama.createCandidate({ userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。' });
  await services.billing.grant({ userId, billingKey: `test:${userId}`, amount: 300 });
  const job = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
  return { userId, jobId: job.id };
}

test('candidate image mock writes one private PNG and settles once', async () => {
  const input = await candidateImageJob();
  const written: { key?: string; bytes?: Buffer } = {};
  const objectStore = { put: async (key: string, bytes: Buffer) => { written.key = key; written.bytes = bytes; } } as never;
  const submit = createCandidateImageSubmissionActivity({ services });
  await Promise.all(Array.from({ length: 20 }, () => submit(input)));
  assert.equal((await services.dramaImageSubmissions.get(input))?.status, 'submitted');
  const publish = createCandidateImagePublishingActivity({ services, objectStore });
  assert.equal((await publish(input)).status, 'published');
  assert.equal((await publish(input)).status, 'terminal');
  assert.match(written.key ?? '', new RegExp(`^drama-image-jobs/${input.jobId}/[a-f0-9]{64}\\.png$`));
  assert.ok(written.bytes?.length);
  assert.equal((await services.dramaImages.get(input)).status, 'succeeded');
  assert.equal((await services.billing.summary(input.userId)).entries.filter(entry => entry.type === 'settle').length, 1);
});

test('50 concurrent activity calls and a restarted service submit to the provider once', async () => {
  const input = await job();
  let posts = 0;
  const client = gateway({
    async submit(_ctx, selected) { posts++; assert.equal(selected.id, 1); return { providerTaskId: 'receipt-1', raw: {} }; },
    async poll() { return { status: 'processing', raw: {} }; },
  });
  const submit = createVideoSubmissionActivity({ services, gateway: client, channel });
  await Promise.all(Array.from({ length: 50 }, () => submit(input)));
  assert.equal(posts, 1);
  assert.equal((await services.providerSubmissions.get(input))?.status, 'submitted');
  const restarted = createServices(databaseUrl);
  try {
    assert.equal((await createVideoSubmissionActivity({ services: restarted, gateway: client, channel })(input)).status, 'submitted');
  } finally { await restarted.close(); }
  assert.equal(posts, 1);
});

test('response loss and 502 never fail over or resubmit; unknown acceptance does not auto-refund', async () => {
  for (const failure of [new Error('response lost'), Object.assign(new Error('bad gateway'), { status: 502 })]) {
    const input = await job();
    let posts = 0;
    const client = gateway({ async submit() { posts++; throw failure; }, async poll() { throw new Error('unexpected poll'); } });
    const submit = createVideoSubmissionActivity({ services, gateway: client, channel });
    assert.equal((await submit(input)).status, 'unknown');
    assert.equal((await submit(input)).status, 'unknown');
    assert.equal(posts, 1);
    assert.equal((await services.generation.get(input)).status, 'accepted');
    assert.equal((await services.billing.summary(input.userId)).balance, 3);
  }
});

test('invalid submission receipt is retained as unknown, never treated as safe rejection', async () => {
  const input = await job();
  let posts = 0;
  const client = gateway({ async submit() { posts++; return { providerTaskId: '', raw: {} }; }, async poll() { throw new Error('unexpected'); } });
  const submit = createVideoSubmissionActivity({ services, gateway: client, channel });
  assert.equal((await submit(input)).status, 'unknown');
  await submit(input);
  assert.equal(posts, 1);
});

test('explicit provider rejection atomically fails and refunds; terminal replay makes no POST', async () => {
  const input = await job();
  let posts = 0;
  const client = gateway({ async submit() { posts++; throw Object.assign(new Error('invalid request'), { status: 400 }); }, async poll() { throw new Error('unexpected'); } });
  const submit = createVideoSubmissionActivity({ services, gateway: client, channel });
  assert.equal((await submit(input)).status, 'rejected');
  assert.equal((await submit(input)).status, 'terminal');
  assert.equal(posts, 1);
  assert.equal((await services.generation.get(input)).status, 'failed');
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});

test('poll retries reuse the stored receipt and provider; output awaits media rather than settling', async () => {
  const input = await job();
  let posts = 0;
  let polls = 0;
  const client = gateway({
    async submit() { posts++; return { providerTaskId: 'receipt-2', raw: {} }; },
    async poll(_ctx, selected, id) {
      polls++; assert.equal(selected.id, 1); assert.equal(id, 'receipt-2');
      if (polls === 1) throw new Error('temporary network failure');
      return { status: 'succeeded', videoUrl: 'https://media.fake/result.mp4', raw: {} };
    },
  });
  await createVideoSubmissionActivity({ services, gateway: client, channel })(input);
  const poll = createVideoPollingActivity({ services, gateway: client, channel });
  await assert.rejects(poll(input));
  assert.equal((await poll(input)).status, 'ready_for_media');
  assert.equal(posts, 1);
  assert.equal(polls, 2);
  assert.equal((await services.generation.get(input)).status, 'accepted');
  assert.equal((await services.billing.summary(input.userId)).balance, 3);
  await assert.rejects(createVideoPollingActivity({ services, gateway: client, channel: { ...channel, baseUrl: 'https://changed.fake' } })(input));
  assert.equal(polls, 2);
});

test('provider terminal failure refunds once; polling before submit never claims a submission', async () => {
  const input = await job();
  let polls = 0;
  const client = gateway({ async submit() { return { providerTaskId: 'receipt-3', raw: {} }; }, async poll() { polls++; return { status: 'failed', raw: {} }; } });
  const poll = createVideoPollingActivity({ services, gateway: client, channel });
  assert.equal((await poll(input)).status, 'awaiting_receipt');
  assert.equal(await services.providerSubmissions.get(input), null);
  await createVideoSubmissionActivity({ services, gateway: client, channel })(input);
  assert.equal((await poll(input)).status, 'failed');
  assert.equal((await poll(input)).status, 'terminal');
  assert.equal(polls, 1);
  const wallet = await services.billing.summary(input.userId);
  assert.equal(wallet.balance, 80);
  assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, 1);
});

test('candidate image failure activity refunds an accepted job exactly once and never touches a settled one', async () => {
  const input = await candidateImageJob();
  assert.equal((await services.billing.summary(input.userId)).balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits);
  const fail = createCandidateImageFailActivity({ services });
  await fail(input);
  const job = await services.dramaImages.get(input);
  assert.equal(job.status, 'failed');
  assert.equal(job.failureCode, 'CANDIDATE_IMAGE_PUBLISH_FAILED');
  const wallet = await services.billing.summary(input.userId);
  assert.equal(wallet.balance, SIGNUP_GRANT_CREDITS + 300);
  assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, 1);
  await fail(input);
  assert.equal((await services.billing.summary(input.userId)).entries.filter(entry => entry.type === 'refund').length, 1);
  const settled = await candidateImageJob();
  const objectStore = { put: async () => {} } as never;
  await createCandidateImageSubmissionActivity({ services })(settled);
  assert.equal((await createCandidateImagePublishingActivity({ services, objectStore })(settled)).status, 'published');
  await fail(settled);
  assert.equal((await services.dramaImages.get(settled)).status, 'succeeded');
  assert.equal((await services.billing.summary(settled.userId)).entries.filter(entry => entry.type === 'refund').length, 0);
});
