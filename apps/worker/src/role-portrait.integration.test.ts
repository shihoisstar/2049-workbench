import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { SaveDramaPreparation } from '@wb/contracts';
import { createServices, portraitBinding } from '@wb/server';
import type { ObjectStore } from '@wb/media';
import { createPortraitActivity } from './role-portrait';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); after(() => services.close());
const config = { mode: 'atlas' as const, baseUrl: 'https://portrait.invalid', secret: 'fixture-only' };
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '候选 worker', content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const draft = await services.drama.getPreparation(input);
  const saved = await services.drama.savePreparation({ ...input, draft: SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
    roles: draft.roles.map(({ key, name, usage }) => ({ key, name, usage, description: '橘猫，蓝围巾' })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) }) });
  const offer = { binding: portraitBinding(config.mode, config.baseUrl), credits: 7 }; const request = { roleKey: saved.roles[0].key, preparationRevision: saved.revision };
  const quote = await services.rolePortraits.quote({ ...input, request, offer }); assert.ok(quote.version);
  const job = await services.rolePortraits.create({ ...input, offer, request: { ...request, requestKey: randomUUID(), quoteVersion: quote.version } });
  return { userId, jobId: job.id };
}
function storage() {
  const writes: { key: string; bytes: Buffer; sha: string }[] = [];
  const objectStore: ObjectStore = { probe: async () => {}, close() {}, remove: async () => {}, access: async () => '', read: async () => Buffer.alloc(0),
    put: async (key, bytes, sha) => { writes.push({ key, bytes, sha }); } };
  return { objectStore, writes };
}
const bytes = Buffer.from('injected decoded image');
const image = { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), width: 768, height: 1024 };
test('portrait retries only GET after uncertainty and publishes identical private candidate/reference bytes once', async () => {
  const input = await fixture(); const store = storage(); let posts = 0; let gets = 0;
  const advance = createPortraitActivity({ services, config, objectStore: store.objectStore, readImage: async () => image, fetchImpl: async (_url, init) => {
    if (init?.method === 'POST') { posts++; return Response.json({ data: { id: 'fixture-task' } }); }
    gets++; if (gets === 1) return new Response('', { status: 503 });
    return Response.json({ data: { status: 'completed', outputs: ['https://output.invalid/image.png'] } });
  } });
  assert.equal(await advance(input), 'pending'); assert.equal(await advance(input), 'terminal'); assert.equal(await advance(input), 'terminal');
  assert.equal(posts, 1); assert.equal(gets, 2); assert.equal(store.writes.length, 2); assert.deepEqual(store.writes[0].bytes, store.writes[1].bytes);
  assert.equal(store.writes[0].sha, store.writes[1].sha); assert.ok(store.writes[1].key.includes(`/generated/${input.jobId}/`));
  assert.equal((await services.rolePortraits.get(input)).status, 'succeeded');
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 73); assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 1);
});
test('portrait unknown submission stays held across retries while known rejection refunds', async () => {
  const input = await fixture(); let calls = 0; const store = storage();
  const advance = createPortraitActivity({ services, config, objectStore: store.objectStore, fetchImpl: async () => { calls++; throw new Error('response lost'); } });
  assert.equal(await advance(input), 'review_required'); assert.equal(await advance(input), 'review_required'); assert.equal(calls, 1);
  assert.equal((await services.rolePortraits.get(input)).submissionStatus, 'unknown'); assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const rejected = await fixture(); const reject = createPortraitActivity({ services, config, objectStore: store.objectStore, fetchImpl: async () => new Response('', { status: 429 }) });
  assert.equal(await reject(rejected), 'terminal'); assert.equal((await services.billing.summary(rejected.userId)).balance, 80);
  assert.equal(store.writes.length, 0);
});
test('completed without outputs is a terminal refunded failure, invalid decoded media cannot settle', async () => {
  const store = storage();
  for (const output of [[], ['https://output.invalid/corrupt.png']]) {
    const input = await fixture(); let posts = 0;
    const advance = createPortraitActivity({ services, config, objectStore: store.objectStore, readImage: async () => { throw new Error('invalid PNG'); }, fetchImpl: async (_url, init) => {
      if (init?.method === 'POST') { posts++; return Response.json({ data: { id: randomUUID() } }); }
      return Response.json({ data: { status: 'completed', outputs: output } });
    } });
    assert.equal(await advance(input), 'terminal'); assert.equal(posts, 1); assert.equal((await services.rolePortraits.get(input)).status, 'failed');
    const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, 1);
  }
  assert.equal(store.writes.length, 0);
});
test('disabled or mismatched portrait configuration never submits', async () => {
  const input = await fixture(); const store = storage();
  for (const provider of [null, { ...config, baseUrl: 'https://different.invalid' }]) {
    const advance = createPortraitActivity({ services, config: provider, objectStore: store.objectStore, fetchImpl: async () => { assert.fail('provider called'); } });
    assert.equal(await advance(input), 'review_required');
  }
  assert.equal(await services.dramaImageSubmissions.get(input), null); assert.equal(store.writes.length, 0);
});
