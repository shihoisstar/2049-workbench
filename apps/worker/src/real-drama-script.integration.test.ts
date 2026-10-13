import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createServices, scriptProviderBinding } from '@wb/server';
import { createRealScriptActivity } from './real-drama-script';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); after(() => services.close());
const config = { secret: 'fake-only', model: 'fixture-text', baseUrl: 'https://script.invalid' };
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'idea', title: '真实分支注入', content: '橘猫寻找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
  const admission = { offer: { binding: scriptProviderBinding(config), credits: 7, estimatedCostCents: null }, mockAvailable: false };
  const quote = await services.dramaScripts.quote({ userId, projectId: project.id, admission }); assert.ok(quote.version);
  const job = await services.dramaScripts.create({ userId, projectId: project.id, requestKey: randomUUID(), quoteVersion: quote.version, admission });
  return { userId, jobId: job.id };
}
const payload = { id: 'fake-response', choices: [{ finish_reason: 'stop', message: { content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。' } }], usage: { prompt_tokens: 50, completion_tokens: 80 } };
test('concurrent real script activities send one injected POST and publish one charged draft', async () => {
  const input = await fixture(); let calls = 0;
  const activity = createRealScriptActivity(services, config, async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body)); assert.equal(body.model, config.model); assert.equal(body.thinking.type, 'disabled');
    return Response.json(payload);
  });
  await Promise.all(Array.from({ length: 6 }, () => activity(input)));
  assert.equal(calls, 1); assert.equal(await activity(input), 'terminal'); assert.equal(calls, 1);
  const job = await services.dramaScripts.get(input); assert.equal(job.billingStatus, 'settled'); assert.equal(job.draftVersion?.source, 'ai_generated');
});
test('network uncertainty keeps hold and does not POST on activity restart', async () => {
  const input = await fixture(); let calls = 0;
  const activity = createRealScriptActivity(services, config, async () => { calls++; throw new Error('fake response lost'); });
  assert.equal(await activity(input), 'review_required'); assert.equal(await activity(input), 'review_required'); assert.equal(calls, 1);
  assert.equal((await services.dramaScripts.get(input)).submissionStatus, 'unknown'); assert.equal((await services.billing.summary(input.userId)).balance, 73);
});
test('temporary receipt persistence failure retries only the known database result', async () => {
  const input = await fixture(); let calls = 0; let writes = 0;
  const scoped = { dramaScripts: { ...services.dramaScripts, recordResponse: async (value: Parameters<typeof services.dramaScripts.recordResponse>[0]) => {
    writes++; if (writes === 1) throw new Error('temporary database failure'); await services.dramaScripts.recordResponse(value);
  } } };
  const activity = createRealScriptActivity(scoped, config, async () => { calls++; return Response.json(payload); });
  assert.equal(await activity(input), 'terminal'); assert.equal(calls, 1); assert.equal(writes, 2);
  assert.equal((await services.dramaScripts.get(input)).billingStatus, 'settled');
});
test('known HTTP rejection refunds while disabled text configuration sends nothing', async () => {
  const input = await fixture(); let calls = 0;
  const disabled = createRealScriptActivity(services, null, async () => { assert.fail('disabled provider called'); });
  assert.equal(await disabled(input), 'review_required');
  const activity = createRealScriptActivity(services, config, async () => { calls++; return new Response('', { status: 429 }); });
  assert.equal(await activity(input), 'terminal'); assert.equal(await activity(input), 'terminal'); assert.equal(calls, 1);
  assert.equal((await services.dramaScripts.get(input)).billingStatus, 'refunded'); assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
