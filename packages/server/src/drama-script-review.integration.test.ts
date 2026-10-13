import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { buildScriptRequest, createServices, DomainError, scriptProviderBinding } from './index';
import type { ReviewScriptRequestValue, TextGenerationReceiptValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const binding = scriptProviderBinding({ model: 'review-fixture', baseUrl: 'https://script.invalid' });
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const response = (): TextGenerationReceiptValue => ({ provider: 'atlas', model: binding.model, responseId: randomUUID(), finishReason: 'stop', text: '## 第1集\n**场景1：飞船 日/内**\n橘猫：出发。', textTruncated: false, usage: null });
const review = (receipt?: TextGenerationReceiptValue): ReviewScriptRequestValue => receipt
  ? { action: 'receipt', requestKey: randomUUID(), reason: '供应商记录中找到了完整回执', evidenceReference: 'fixture-provider-log', response: receipt }
  : { action: 'reject', requestKey: randomUUID(), reason: '供应商核对明确确认没有受理', evidenceReference: 'fixture-provider-rejection', confirmedNotAccepted: true };
async function fixture(unknown = true) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'idea', title: '运营核对', content: '橘猫寻找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
  const admission = { offer: { binding, credits: 7, estimatedCostCents: null }, mockAvailable: false };
  const quote = await services.dramaScripts.quote({ userId, projectId: project.id, admission }); assert.ok(quote.version);
  const job = await services.dramaScripts.create({ userId, projectId: project.id, requestKey: randomUUID(), quoteVersion: quote.version, admission });
  const locator = { userId, jobId: job.id }; const request = buildScriptRequest(await services.dramaScripts.snapshot(locator), binding);
  const claim = await services.dramaScripts.beginSubmission({ ...locator, binding, request }); assert.ok(claim.claimed);
  const token = { ...locator, token: claim.token }; if (unknown) await services.dramaScripts.submissionUnknown(token);
  return token;
}
test('script review records receipt and audit atomically then supports current-state replay', async () => {
  const input = await fixture(); const receipt = response(); const request = review(receipt);
  const results = await Promise.all(Array.from({ length: 6 }, () => services.opsScriptReview.resolve({ jobId: input.jobId, request })));
  assert.ok(results.every(result => result.job.submissionStatus === 'received' && result.job.billingStatus === 'held'));
  assert.deepEqual(await services.dramaScripts.response(input), receipt);
  const completed = await services.dramaScripts.receive({ ...input, response: receipt }); assert.equal(completed.billingStatus, 'settled');
  assert.equal((await services.opsScriptReview.resolve({ jobId: input.jobId, request })).job.status, 'succeeded');
  const [count] = await sql`select count(*)::int as n from wb_next.drama_script_reviews where job_id = ${input.jobId}`; assert.equal(count.n, 1);
  await assert.rejects(services.opsScriptReview.resolve({ jobId: input.jobId, request: { ...request, reason: '改写后的核对原因不可覆盖' } }), status(409));
});
test('script review rejection refunds once and prevents late receipt revival', async () => {
  const input = await fixture(); const request = review();
  const results = await Promise.all(Array.from({ length: 5 }, () => services.opsScriptReview.resolve({ jobId: input.jobId, request })));
  assert.ok(results.every(result => result.job.billingStatus === 'refunded'));
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.filter(e => e.type === 'refund').length, 1);
  await assert.rejects(services.dramaScripts.recordResponse({ ...input, response: response() }), status(409));
  await assert.rejects(services.opsScriptReview.resolve({ jobId: input.jobId, request: review(response()) }), status(409));
});
test('same review key across jobs permits only one decision and rolls back the loser', async () => {
  const left = await fixture(); const right = await fixture(); const request = review();
  const results = await Promise.allSettled([services.opsScriptReview.resolve({ jobId: left.jobId, request }), services.opsScriptReview.resolve({ jobId: right.jobId, request })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const balances = await Promise.all([services.billing.summary(left.userId), services.billing.summary(right.userId)]);
  assert.deepEqual(balances.map(wallet => wallet.balance).sort(), [73, 80]);
});
test('receipt and rejection race has a single decision', async () => {
  const input = await fixture();
  const results = await Promise.allSettled([services.opsScriptReview.resolve({ jobId: input.jobId, request: review(response()) }), services.opsScriptReview.resolve({ jobId: input.jobId, request: review() })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const job = await services.dramaScripts.get(input); assert.ok(job.submissionStatus === 'received' || job.submissionStatus === 'rejected');
  assert.equal((await services.billing.summary(input.userId)).balance, job.submissionStatus === 'received' ? 73 : 80);
});
test('audit insertion failure rolls back both the known receipt and review', async () => {
  const input = await fixture(); const request = review(response());
  const name = `script_review_probe_${randomUUID().replaceAll('-', '')}`;
  await sql.unsafe(`alter table wb_next.drama_script_reviews add constraint ${name} check (job_id <> '${input.jobId}')`);
  try {
    await assert.rejects(services.opsScriptReview.resolve({ jobId: input.jobId, request }));
    assert.equal(await services.dramaScripts.response(input), null); assert.equal((await services.dramaScripts.get(input)).submissionStatus, 'unknown');
  } finally { await sql.unsafe(`alter table wb_next.drama_script_reviews drop constraint ${name}`); }
  assert.equal((await services.opsScriptReview.resolve({ jobId: input.jobId, request })).job.submissionStatus, 'received');
});
test('active submissions cannot be reviewed until stale and no private token is listed', async () => {
  const input = await fixture(false);
  await assert.rejects(services.opsScriptReview.resolve({ jobId: input.jobId, request: review() }), status(409));
  await sql`update wb_next.drama_script_jobs set submitted_at = clock_timestamp() - interval '3 minutes' where id = ${input.jobId}`;
  const page = await services.opsScriptReview.list(); const item = page.items.find(row => row.jobId === input.jobId); assert.ok(item);
  assert.equal('token' in item, false); assert.equal('submissionToken' in item, false); assert.equal('response' in item, false);
  assert.equal((await services.opsScriptReview.resolve({ jobId: input.jobId, request: review() })).job.status, 'failed');
});
