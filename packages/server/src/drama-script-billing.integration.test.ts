import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { buildScriptRequest, createServices, DomainError, scriptProviderBinding } from './index';
import type { ScriptAdmission } from './index';
import type { TextGenerationReceiptValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const binding = scriptProviderBinding({ model: 'fixture-text', baseUrl: 'https://script.invalid' });
const admission: ScriptAdmission = { offer: { binding, credits: 7, estimatedCostCents: null }, mockAvailable: false };
const closed: ScriptAdmission = { offer: null, mockAvailable: false };
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const receipt = (text = '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', finishReason = 'stop'): TextGenerationReceiptValue => ({ provider: 'atlas', model: binding.model,
  responseId: randomUUID(), finishReason, text, textTruncated: false, usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: null, reasoningTokens: 0 } });
async function fixture() {
  const owner = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId: owner.userId, mode: 'idea', title: '报价测试', content: '橘猫寻找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 6, genre: '科幻', tone: '通用' });
  const input = { userId: owner.userId, projectId: project.id, requestKey: randomUUID(), admission };
  const quote = await services.dramaScripts.quote(input); assert.equal(quote.mode, 'atlas'); assert.ok(quote.version);
  return { ...input, quoteVersion: quote.version };
}
async function start(input: Awaited<ReturnType<typeof fixture>>) {
  const job = await services.dramaScripts.create(input); const locator = { userId: input.userId, jobId: job.id };
  const request = buildScriptRequest(await services.dramaScripts.snapshot(locator), binding);
  const claim = await services.dramaScripts.beginSubmission({ ...locator, binding, request }); assert.ok(claim.claimed);
  return { ...locator, token: claim.token };
}

test('script quote is owner scoped and disabled has no fictitious price', async () => {
  const input = await fixture(); const other = await fixture();
  assert.deepEqual(await services.dramaScripts.quote({ ...input, admission: closed }), { mode: 'disabled', credits: null, version: null, episodeNumber: 1 });
  await assert.rejects(services.dramaScripts.quote({ ...input, userId: other.userId }), status(404));
  assert.equal((await services.dramaScripts.quote(input)).episodeNumber, 1);
  await assert.rejects(services.dramaScripts.create({ ...input, quoteVersion: undefined }), status(409));
  await assert.rejects(services.dramaScripts.create({ ...input, quoteVersion: 'old' }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
test('concurrent script admission holds once and replays after model price changes or closure', async () => {
  const input = await fixture(); const results = await Promise.all(Array.from({ length: 8 }, () => services.dramaScripts.create(input)));
  assert.equal(new Set(results.map(job => job.id)).size, 1);
  const updated: ScriptAdmission = { offer: { binding: { ...binding, model: 'new-model' }, credits: 15, estimatedCostCents: 2 }, mockAvailable: false };
  assert.equal((await services.dramaScripts.create({ ...input, admission: updated })).id, results[0].id);
  assert.equal((await services.dramaScripts.create({ ...input, admission: closed })).id, results[0].id);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 73); assert.equal(wallet.entries.filter(e => e.type === 'hold').length, 1);
  const [reservation] = await sql`select estimated_cost_cents, actual_cost_cents from wb_next.reservations where user_id = ${input.userId} and billing_key = ${`drama-script:${results[0].id}`}`;
  assert.equal(reservation.estimated_cost_cents, null); assert.equal(reservation.actual_cost_cents, null);
  await assert.rejects(services.dramaScripts.create({ ...input, quoteVersion: 'different' }), status(409));
});
test('insufficient balance rolls back script job outbox and reservation', async () => {
  const base = await fixture(); const input = { ...base, admission: { offer: { ...admission.offer!, credits: 81 }, mockAvailable: false } };
  const quote = await services.dramaScripts.quote(input); assert.ok(quote.version);
  await assert.rejects(services.dramaScripts.create({ ...input, quoteVersion: quote.version }), status(402));
  assert.equal(await services.dramaScripts.latest(input), null); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  const [count] = await sql`select count(*)::int as n from wb_next.reservations where user_id = ${input.userId}`; assert.equal(count.n, 0);
});
test('unknown submission cannot reclaim or refund and late receipt settles exactly once', async () => {
  const input = await fixture(); const token = await start(input);
  await services.dramaScripts.submissionUnknown(token);
  const request = buildScriptRequest(await services.dramaScripts.snapshot(token), binding);
  const claims = await Promise.all(Array.from({ length: 8 }, () => services.dramaScripts.beginSubmission({ ...token, binding, request })));
  assert.ok(claims.every(c => !c.claimed));
  await assert.rejects(services.dramaScripts.fail({ ...token, failureCode: 'SCRIPT_GENERATION_FAILED' }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const response = receipt(); await services.dramaScripts.recordResponse({ ...token, response });
  const results = await Promise.all(Array.from({ length: 8 }, () => services.dramaScripts.receive({ ...token, response })));
  assert.ok(results.every(r => r.billingStatus === 'settled' && r.actualCredits === 7));
  assert.equal(new Set(results.map(r => r.draftVersion?.id)).size, 1); assert.equal(results[0].draftVersion?.source, 'ai_generated');
  await services.dramaScripts.submissionUnknown(token);
  assert.equal((await services.dramaScripts.get(token)).submissionStatus, 'received');
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 73); assert.equal(wallet.entries.filter(e => e.type === 'settle').length, 1);
  assert.equal((await services.dramaScripts.create({ ...input, admission: closed })).id, token.jobId);
});
test('known rejection refunds once and wrong token rolls back any attempted refund', async () => {
  const input = await fixture(); const token = await start(input);
  await assert.rejects(services.dramaScripts.rejectSubmission({ ...token, token: randomUUID() }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const results = await Promise.all(Array.from({ length: 6 }, () => services.dramaScripts.rejectSubmission(token)));
  assert.ok(results.every(r => r.billingStatus === 'refunded' && r.status === 'failed'));
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.filter(e => e.type === 'refund').length, 1);
  await assert.rejects(services.dramaScripts.recordResponse({ ...token, response: receipt() }), status(409));
});
test('incomplete output refunds with usage retained and malformed draft remains repairable without charge', async () => {
  for (const response of [receipt('未完整正文', 'length'), receipt('只有一段没有分集格式的故事')]) {
    const input = await fixture(); const token = await start(input);
    await services.dramaScripts.recordResponse({ ...token, response });
    const job = await services.dramaScripts.receive({ ...token, response });
    assert.equal(job.billingStatus, 'refunded'); assert.equal(job.actualCredits, 0);
    assert.equal((await services.billing.summary(input.userId)).balance, 80);
    assert.deepEqual(await services.dramaScripts.response(token), response);
    if (response.finishReason === 'stop') { assert.equal(job.status, 'succeeded'); assert.equal(job.draftVersion?.parse.status, 'needs_repair'); }
    else assert.equal(job.draftVersion, null);
  }
});
test('known response survives draft transaction failure and cannot be replaced or bypassed', async () => {
  const input = await fixture(); const token = await start(input); const response = receipt();
  await services.dramaScripts.recordResponse({ ...token, response });
  await assert.rejects(services.dramaScripts.complete({ ...token, content: response.text }), status(409));
  await assert.rejects(services.dramaScripts.recordResponse({ ...token, response: receipt('changed') }), status(409));
  // Block only this fixture's version publication, never shared data.
  const constraint = `script_quote_probe_${randomUUID().replaceAll('-', '')}`;
  await sql.unsafe(`alter table wb_next.drama_script_jobs add constraint ${constraint} check (id <> '${token.jobId}' or status <> 'succeeded')`);
  try {
    await assert.rejects(services.dramaScripts.receive({ ...token, response }));
    assert.equal((await services.dramaScripts.get(token)).status, 'accepted');
    assert.deepEqual(await services.dramaScripts.response(token), response);
    assert.equal((await services.billing.summary(input.userId)).balance, 73);
    const [count] = await sql`select count(*)::int as n from wb_next.ledger where user_id = ${input.userId} and kind = 'settle'`; assert.equal(count.n, 0);
  } finally { await sql.unsafe(`alter table wb_next.drama_script_jobs drop constraint ${constraint}`); }
  assert.equal((await services.dramaScripts.receive({ ...token, response })).billingStatus, 'settled');
});
