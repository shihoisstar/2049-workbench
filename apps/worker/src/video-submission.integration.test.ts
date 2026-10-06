import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServices } from '@wb/server';
import { createGatewayRouter } from '@wb/model-gateway';
import type { ChannelView, VideoAdapter } from '@wb/model-gateway';
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
async function job() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const created = await services.generation.create({ userId, requestKey: randomUUID(), prompt: 'A shop', resolution: '480p', aspectRatio: '9:16', durationSec: 5 });
  return { userId, jobId: created.id };
}

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
