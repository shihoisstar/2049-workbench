import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createServices, marketingCopyBinding, seriesScriptProviderBinding } from '@wb/server';
import { createRealScriptActivity } from './real-drama-script';
import { createMarketingCopyActivity } from './marketing-copy';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); after(() => services.close());
const config = { secret: 'fake-only', model: 'fixture-text', baseUrl: 'https://text.invalid' };
const answer = (content: string) => Response.json({ id: randomUUID(), choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 80 } });
async function copyFixture(category: 'commerce' | 'store_visit' = 'commerce') {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const admission = { offer: { binding: marketingCopyBinding(config), credits: 3, estimatedCostCents: null }, mockAvailable: false };
  const source = { category, text: category === 'commerce' ? '橘猫帆布袋，图案清晰。' : '咖啡店，木桌和窗边座位。' };
  const quote = await services.marketingCopies.quote({ userId, request: source, admission });
  const job = await services.marketingCopies.create({ userId, request: { ...source, requestKey: randomUUID(), quoteVersion: quote.version! }, admission });
  return { userId, jobId: job.id };
}
test('five episode activities issue exactly five injected POSTs, recover on restart and produce a full series', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'idea', title: '五集真实分支注入', content: '橘猫驾驶飞船寻找月亮，共五站。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
  const admission = { offer: { binding: seriesScriptProviderBinding(config), credits: 7, estimatedCostCents: null }, mockAvailable: false };
  const quote = await services.scriptBatches.quote({ userId, projectId: project.id, admission });
  const batch = await services.scriptBatches.create({ userId, projectId: project.id, admission, request: { requestKey: randomUUID(), quoteVersion: quote.version! } });
  const calls: number[] = [];
  const fetchImpl: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body)); const text = body.messages.find((message: { role: string }) => message.role === 'user').content;
    const snapshot = JSON.parse(text.slice(text.indexOf('\n') + 1)); calls.push(snapshot.episodeNumber); assert.equal(body.max_tokens, 1800); assert.equal(body.thinking.type, 'disabled');
    return answer(`## 第${snapshot.episodeNumber}集\n**场景1：飞船 日/内**\n橘猫：第${snapshot.episodeNumber}站，出发。`);
  };
  const activity = createRealScriptActivity(services, config, fetchImpl);
  for (const episode of batch.episodes) {
    const input = { userId, jobId: episode.jobId! }; assert.equal(await activity(input), 'terminal');
    const restarted = createServices(databaseUrl);
    try { assert.equal(await createRealScriptActivity(restarted, config, fetchImpl)(input), 'terminal'); } finally { await restarted.close(); }
  }
  assert.deepEqual(calls, [1, 2, 3, 4, 5]);
  const complete = await services.scriptBatches.get({ userId, batchId: batch.id }); assert.equal(complete.status, 'succeeded'); assert.equal(complete.draftVersion?.parse.episodes.length, 5);
});
test('copy activities generate category-specific suggestions with one injected POST under concurrent execution', async () => {
  for (const category of ['commerce', 'store_visit'] as const) {
    const input = await copyFixture(category); let calls = 0;
    const activity = createMarketingCopyActivity(services, config, async (_url, options) => {
      calls++; const body = JSON.parse(String(options?.body)); const user = JSON.parse(body.messages.find((message: { role: string }) => message.role === 'user').content);
      assert.equal(user.category, category); assert.equal(body.max_tokens, 1000);
      return answer(JSON.stringify({ text: category === 'commerce' ? '口播：让喜欢陪你出门。\n画面：展示帆布袋。' : '口播：把片刻留给自己。\n画面：展示木桌和窗边座位。', usedFacts: [category === 'commerce' ? '帆布袋' : '木桌'] }));
    });
    await Promise.all(Array.from({ length: 6 }, () => activity(input))); assert.equal(calls, 1); assert.equal((await services.marketingCopies.get(input)).status, 'succeeded');
    assert.equal(await activity(input), 'terminal'); assert.equal(calls, 1);
  }
});
test('copy network uncertainty does not repeat POST after an activity or service restart', async () => {
  const input = await copyFixture(); let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; throw new Error('fixture response lost'); };
  const activity = createMarketingCopyActivity(services, config, fetchImpl);
  assert.equal(await activity(input), 'review_required'); assert.equal(await activity(input), 'review_required');
  const restarted = createServices(databaseUrl);
  try { assert.equal(await createMarketingCopyActivity(restarted, config, fetchImpl)(input), 'review_required'); } finally { await restarted.close(); }
  assert.equal(calls, 1); assert.equal((await services.billing.summary(input.userId)).balance, 77);
});
test('copy known rejection refunds and disabled text configuration sends no POST', async () => {
  const input = await copyFixture(); let calls = 0;
  assert.equal(await createMarketingCopyActivity(services, null, async () => { assert.fail('disabled provider called'); })(input), 'review_required');
  const activity = createMarketingCopyActivity(services, config, async () => { calls++; return new Response('', { status: 400 }); });
  assert.equal(await activity(input), 'terminal'); assert.equal(await activity(input), 'terminal'); assert.equal(calls, 1);
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
