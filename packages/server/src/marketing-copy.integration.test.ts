import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { buildMarketingCopyRequest, createServices, DomainError, marketingCopyBinding, parseMarketingCopy } from './index';
import type { CopyAdmission } from './index';
import type { MarketingCategoryValue, TextGenerationReceiptValue } from '@wb/contracts';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const binding = marketingCopyBinding({ model: 'fixture-copy', baseUrl: 'https://text.invalid' });
const admission: CopyAdmission = { offer: { binding, credits: 3, estimatedCostCents: null }, mockAvailable: false };
const closed: CopyAdmission = { offer: null, mockAvailable: false };
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const output = '口播：让喜欢陪你出门。\n画面：展示帆布袋的猫咪图案。';

test('copy duration belongs to the quote and frozen request, with legacy input remaining five seconds', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); const request = { category: 'commerce' as const, text: '猫咪帆布袋。' };
  const old = await services.marketingCopies.quote({ userId, request, admission });
  const native = await services.marketingCopies.quote({ userId, request: { ...request, durationSec: 10 }, admission }); assert.notEqual(native.version, old.version);
  const submission = { ...request, durationSec: 10 as const, requestKey: randomUUID(), quoteVersion: native.version! };
  const job = await services.marketingCopies.create({ userId, request: submission, admission }); assert.equal(job.durationSec, 10);
  const snapshot = await services.marketingCopies.snapshot({ userId, jobId: job.id }); assert.equal(snapshot.durationSec, 10); assert.equal(JSON.parse(buildMarketingCopyRequest(snapshot, binding).user).durationSec, 10);
  const copyRequest = buildMarketingCopyRequest(snapshot, binding); assert.match(copyRequest.system, /当category为commerce且durationSec为10/); assert.match(copyRequest.system, /不能写成画外旁白/); assert.match(copyRequest.system, /画面明确对应每句台词的说话人/);
  await assert.rejects(services.marketingCopies.create({ userId, request: { ...submission, durationSec: 5 }, admission }), error => error instanceof DomainError && error.statusCode === 409);
  assert.equal(JSON.parse(buildMarketingCopyRequest(request, binding).user).durationSec, 5);
  const locator = { userId, jobId: job.id };
  const claim = await services.marketingCopies.begin({ ...locator, binding, request: buildMarketingCopyRequest(snapshot, binding) }); assert.ok(claim);
  const text = '口播：' + '字'.repeat(40) + '\n画面：展示帆布袋。';
  const response = receipt(JSON.stringify({ text, usedFacts: ['帆布袋'] }));
  await services.marketingCopies.record({ ...locator, token: claim.token, response });
  const complete = await services.marketingCopies.receive({ ...locator, response }); assert.equal(complete.status, 'succeeded'); assert.equal(complete.result?.text, text);
  assert.equal(parseMarketingCopy(JSON.stringify({ text, usedFacts: [] }), request.text), null);
  assert.equal(parseMarketingCopy(JSON.stringify({ text: text.replace('口播：', '口播：字'), usedFacts: [] }), request.text, 10), null);
});
const receipt = (text = JSON.stringify({ text: output, usedFacts: ['帆布袋'] })): TextGenerationReceiptValue => ({ provider: 'atlas', model: binding.model, responseId: randomUUID(), finishReason: 'stop', text, textTruncated: false, usage: { inputTokens: 100, outputTokens: 60, cachedInputTokens: null, reasoningTokens: 0 } });
async function fixture(category: MarketingCategoryValue = 'commerce') {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const request = { category, text: category === 'commerce' ? '橘猫图案的帆布袋，展示图案。' : '咖啡店有木桌和窗边座位。' };
  const quote = await services.marketingCopies.quote({ userId, request, admission }); assert.ok(quote.version);
  return { userId, admission, request: { ...request, requestKey: randomUUID(), quoteVersion: quote.version } };
}
async function claim(input: Awaited<ReturnType<typeof fixture>>, jobId: string) {
  const locator = { userId: input.userId, jobId };
  const claim = await services.marketingCopies.begin({ ...locator, binding, request: buildMarketingCopyRequest(await services.marketingCopies.snapshot(locator), binding) }); assert.ok(claim);
  return { ...locator, token: claim.token };
}

test('copy quote is free; concurrent admission has one job, hold and outbox and replays when closed', async () => {
  const input = await fixture(); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  const jobs = await Promise.all(Array.from({ length: 12 }, () => services.marketingCopies.create(input))); assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  const [count] = await sql`select count(*)::int as n from wb_next.marketing_copy_outbox where job_id = ${jobs[0].id}`; assert.equal(count.n, 1);
  assert.equal((await services.billing.summary(input.userId)).balance, 77);
  assert.equal((await services.marketingCopies.create({ ...input, admission: closed })).id, jobs[0].id);
  await assert.rejects(services.marketingCopies.create({ ...input, request: { ...input.request, text: '另一商品资料' } }), status(409));
  assert.equal('binding' in jobs[0], false); assert.equal('token' in jobs[0], false); assert.equal('response' in jobs[0], false);
});

test('one paid claim survives concurrent attempts, saves receipt before publication and settles exactly once', async () => {
  const input = await fixture(); const job = await services.marketingCopies.create(input); const locator = { userId: input.userId, jobId: job.id };
  const request = buildMarketingCopyRequest(await services.marketingCopies.snapshot(locator), binding);
  const claims = await Promise.all(Array.from({ length: 10 }, () => services.marketingCopies.begin({ ...locator, binding, request })));
  assert.equal(claims.filter(Boolean).length, 1); const claimed = claims.find(Boolean)!; const response = receipt();
  await services.marketingCopies.record({ ...locator, token: claimed.token, response });
  assert.equal((await services.marketingCopies.get(locator)).status, 'accepted');
  const results = await Promise.all(Array.from({ length: 8 }, () => services.marketingCopies.receive({ ...locator, response })));
  assert.ok(results.every(result => result.status === 'succeeded')); assert.equal(results[0].result?.text, output);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 77); assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 1);
  const restarted = createServices(databaseUrl);
  try { assert.equal((await restarted.marketingCopies.latest({ userId: input.userId, category: 'commerce' }))?.result?.text, output); } finally { await restarted.close(); }
});

test('invented facts and invalid structure preserve usage and refund without replacing input', async () => {
  for (const text of [JSON.stringify({ text: '口播：只要十九元。\n画面：到店免费体验。', usedFacts: ['不存在的商家信息'] }), JSON.stringify({ text: '口播：只要19元。\n画面：展示帆布袋。', usedFacts: [] }), JSON.stringify({ text: '口播：橘猫帆布袋，棉布超软萌。\n画面：展示图案。', usedFacts: ['帆布袋'] }), 'not-json']) {
    const input = await fixture(); const job = await services.marketingCopies.create(input); const token = await claim(input, job.id); const response = receipt(text);
    await services.marketingCopies.record({ ...token, response }); const result = await services.marketingCopies.receive({ ...token, response });
    assert.equal(result.status, 'failed'); assert.equal(result.result, null); assert.equal(result.sourceText, input.request.text); assert.equal(result.billingStatus, 'refunded');
    assert.deepEqual(await services.marketingCopies.response(token), response); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  }
});

test('copy unknown never refunds or reclaims a POST, audited rejection refunds once', async () => {
  const input = await fixture(); const job = await services.marketingCopies.create(input); const token = await claim(input, job.id);
  await services.marketingCopies.unknown(token);
  assert.equal(await services.marketingCopies.begin({ ...token, binding, request: buildMarketingCopyRequest(await services.marketingCopies.snapshot(token), binding) }), null);
  assert.equal((await services.billing.summary(input.userId)).balance, 77);
  assert.ok((await services.opsCopyReview.list()).some(item => item.jobId === job.id));
  const request = { action: 'reject' as const, requestKey: randomUUID(), reason: 'fixture provider proves rejection', evidenceReference: 'fixture:copy-rejected', confirmedNotAccepted: true as const };
  await services.opsCopyReview.resolve({ jobId: job.id, request }); await services.opsCopyReview.resolve({ jobId: job.id, request });
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
  await assert.rejects(services.opsCopyReview.resolve({ jobId: job.id, request: { ...request, reason: 'changed fixture reason' } }), status(409));
  const [counts] = await sql`select count(*)::int as n from wb_next.marketing_copy_reviews where job_id = ${job.id}`; assert.equal(counts.n, 1);
});

test('audited receipt resumes the original copy and never exposes the submission token', async () => {
  const input = await fixture(); const job = await services.marketingCopies.create(input); const token = await claim(input, job.id); await services.marketingCopies.unknown(token);
  const response = receipt(); const reviewed = await services.opsCopyReview.resolve({ jobId: job.id, request: { action: 'receipt', requestKey: randomUUID(), reason: 'fixture receipt recovered', evidenceReference: 'fixture:copy-receipt', response } });
  assert.equal(reviewed.submissionStatus, 'received'); assert.equal('token' in reviewed, false);
  const [count] = await sql`select count(*)::int as n from wb_next.marketing_copy_outbox where job_id = ${job.id} and type = 'resume'`; assert.equal(count.n, 1);
  assert.equal((await services.marketingCopies.receive({ ...token, response })).status, 'succeeded'); assert.equal((await services.billing.summary(input.userId)).balance, 77);
});

test('video adoption preserves original facts, requires the owner and matching category, and cannot change on replay', async () => {
  const input = await fixture(); const copy = await services.marketingCopies.create(input); const token = await claim(input, copy.id); const response = receipt();
  await services.marketingCopies.record({ ...token, response }); await services.marketingCopies.receive({ ...token, response });
  await services.billing.grant({ userId: input.userId, billingKey: randomUUID(), amount: 100 });
  const video = { userId: input.userId, requestKey: randomUUID(), prompt: output, category: 'commerce' as const, copyJobId: copy.id, resolution: '480p' as const, aspectRatio: '9:16' as const, durationSec: 5 as const, materialIds: [] };
  const job = await services.generation.create(video); assert.equal((await services.generation.get({ userId: input.userId, jobId: job.id })).sourceFacts, input.request.text);
  await assert.rejects(services.generation.create({ ...video, copyJobId: undefined }), status(409));
  const before = await services.billing.summary(input.userId);
  await assert.rejects(services.generation.create({ ...video, requestKey: randomUUID(), category: 'store_visit' }), status(409));
  assert.deepEqual(await services.billing.summary(input.userId), before);
  const other = await fixture(); await assert.rejects(services.marketingCopies.get({ userId: other.userId, jobId: copy.id }), status(404));
  await assert.rejects(services.generation.create({ ...video, userId: other.userId, requestKey: randomUUID() }), status(404)); assert.equal((await services.billing.summary(other.userId)).balance, 80);
});

test('copy quote, owner and current model are validated before any new reservation', async () => {
  const input = await fixture(); await assert.rejects(services.marketingCopies.create({ ...input, admission: closed }), status(503));
  await assert.rejects(services.marketingCopies.create({ ...input, admission: { ...admission, offer: { ...admission.offer!, credits: 81 } } }), status(409));
  const quote = await services.marketingCopies.quote({ userId: input.userId, request: { category: input.request.category, text: input.request.text }, admission: { ...admission, offer: { ...admission.offer!, credits: 81 } } });
  await assert.rejects(services.marketingCopies.create({ ...input, request: { ...input.request, quoteVersion: quote.version! }, admission: { ...admission, offer: { ...admission.offer!, credits: 81 } } }), status(402));
  assert.equal(await services.marketingCopies.latest({ userId: input.userId, category: 'commerce' }), null); assert.equal((await services.billing.summary(input.userId)).balance, 80);
});

test('copy checks are conservative checks, reject long voiceovers and require quoted facts from the input', () => {
  assert.equal(parseMarketingCopy(JSON.stringify({ text: output, usedFacts: ['帆布袋'] }), '橘猫帆布袋')?.text, output);
  assert.equal(parseMarketingCopy(JSON.stringify({ text: '口播：' + '字'.repeat(21) + '\n画面：帆布袋。', usedFacts: [] }), '帆布袋'), null);
  assert.equal(parseMarketingCopy(JSON.stringify({ text: output, usedFacts: ['假事实'] }), '帆布袋'), null);
  const soft = { text: '口播：柔软帆布袋，一起出门。\n画面：展示图案。', usedFacts: ['柔软'] };
  assert.equal(parseMarketingCopy(JSON.stringify(soft), '柔软的帆布袋')?.text, soft.text);
  assert.equal(parseMarketingCopy(JSON.stringify({ ...soft, usedFacts: ['没有提供柔软参数'] }), '没有提供柔软参数'), null);
  assert.equal(parseMarketingCopy(JSON.stringify({ ...soft, usedFacts: ['棉布'] }), '棉布帆布袋'), null);
});
