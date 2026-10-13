import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { buildScriptRequest, createServices, DomainError, seriesScriptProviderBinding } from './index';
import type { ScriptAdmission } from './index';
import type { TextGenerationReceiptValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const binding = seriesScriptProviderBinding({ model: 'fixture-series', baseUrl: 'https://text.invalid' });
const admission: ScriptAdmission = { offer: { binding, credits: 7, estimatedCostCents: null }, mockAvailable: false };
const closed: ScriptAdmission = { offer: null, mockAvailable: false };
const script = (number: number) => `## 第${number}集\n**场景1：飞船 日/内**\n橘猫：第${number}站，出发。`;
const receipt = (number: number, finishReason = 'stop'): TextGenerationReceiptValue => ({ provider: 'atlas', model: binding.model, responseId: randomUUID(), finishReason, text: script(number), textTruncated: false, usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: null, reasoningTokens: 0 } });
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
async function fixture(credits = 7) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'idea', title: '五站旅程', content: '橘猫驾驶飞船寻找回家的路，共五站。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
  const offer = { ...admission, offer: { ...admission.offer!, credits } }; const input = { userId, projectId: project.id, admission: offer };
  const quote = await services.scriptBatches.quote(input); assert.ok(quote.version);
  return { ...input, request: { requestKey: randomUUID(), quoteVersion: quote.version } };
}
async function claim(userId: string, jobId: string) {
  const input = { userId, jobId }; const snapshot = await services.dramaScripts.snapshot(input);
  const result = await services.dramaScripts.beginSubmission({ ...input, binding, request: buildScriptRequest(snapshot, binding) });
  assert.ok(result.claimed); return { ...input, token: result.token };
}
async function finish(userId: string, jobId: string, number: number, finishReason = 'stop') {
  const token = await claim(userId, jobId); const response = receipt(number, finishReason);
  await services.dramaScripts.recordResponse({ ...token, response }); return services.dramaScripts.receive({ ...token, response });
}

test('one confirmed batch atomically reserves five episodes and enqueues only the first', async () => {
  const input = await fixture(); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  const quote = await services.scriptBatches.quote(input); assert.equal(quote.credits, 35); assert.deepEqual(quote.toGenerate, [1, 2, 3, 4, 5]);
  const results = await Promise.all(Array.from({ length: 12 }, () => services.scriptBatches.create(input)));
  assert.equal(new Set(results.map(batch => batch.id)).size, 1);
  const batch = results[0]; assert.equal(batch.heldCredits, 35); assert.equal(batch.episodes[0].status, 'generating'); assert.equal(batch.episodes[4].status, 'waiting');
  const [counts] = await sql`select (select count(*)::int from wb_next.drama_script_jobs where batch_id = ${batch.id}) as jobs, (select count(*)::int from wb_next.drama_script_outbox o join wb_next.drama_script_jobs j on j.id = o.job_id where j.batch_id = ${batch.id}) as events`;
  assert.deepEqual({ ...counts }, { jobs: 5, events: 1 });
  await assert.rejects(services.dramaScripts.snapshot({ userId: input.userId, jobId: batch.episodes[1].jobId! }), status(409));
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 45); assert.equal(wallet.entries.filter(entry => entry.type === 'hold').length, 5);
  assert.equal((await services.scriptBatches.create({ ...input, admission: closed })).id, batch.id);
});

test('five serial episodes freeze preceding context, settle once and assemble one recoverable complete draft', async () => {
  const input = await fixture(); let batch = await services.scriptBatches.create(input);
  for (let number = 1; number <= 5; number++) {
    const jobId = batch.episodes[number - 1].jobId!;
    const snapshot = await services.dramaScripts.snapshot({ userId: input.userId, jobId }); assert.equal(snapshot.episodeNumber, number);
    if (number > 1) { assert.ok(snapshot.previousContent!.includes(`第${number - 1}集`)); assert.ok(snapshot.roleNames!.includes('橘猫')); }
    const token = await claim(input.userId, jobId); const response = receipt(number);
    await services.dramaScripts.recordResponse({ ...token, response });
    await Promise.all(Array.from({ length: 4 }, () => services.dramaScripts.receive({ ...token, response })));
    batch = await services.scriptBatches.get({ userId: input.userId, batchId: batch.id });
  }
  assert.equal(batch.status, 'succeeded'); assert.equal(batch.actualCredits, 35); assert.equal(batch.heldCredits, 0); assert.equal(batch.refundedCredits, 0);
  assert.deepEqual(batch.draftVersion!.parse.episodes.map(episode => episode.number), [1, 2, 3, 4, 5]);
  assert.equal((await services.drama.getProject(input)).confirmedVersionId, null);
  assert.equal((await services.dramaScripts.confirm({ ...input, versionId: batch.draftVersion!.id })).confirmedVersionId, batch.draftVersion!.id);
  const restarted = createServices(databaseUrl);
  try { assert.equal((await restarted.scriptBatches.latest(input))?.draftVersion?.id, batch.draftVersion!.id); } finally { await restarted.close(); }
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 45); assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 5);
});

test('explicit episode failure refunds queued work; continuation preserves two successful scripts', async () => {
  const input = await fixture(); const first = await services.scriptBatches.create(input);
  await finish(input.userId, first.episodes[0].jobId!, 1); await finish(input.userId, first.episodes[1].jobId!, 2);
  const failed = await claim(input.userId, first.episodes[2].jobId!); await services.dramaScripts.rejectSubmission(failed);
  const stopped = await services.scriptBatches.get({ userId: input.userId, batchId: first.id });
  assert.equal(stopped.status, 'needs_attention'); assert.equal(stopped.actualCredits, 14); assert.equal(stopped.refundedCredits, 21); assert.equal(stopped.heldCredits, 0);
  assert.equal((await services.billing.summary(input.userId)).balance, 66);
  const quote = await services.scriptBatches.quote(input); assert.deepEqual(quote.reusedEpisodes, [1, 2]); assert.deepEqual(quote.toGenerate, [3, 4, 5]); assert.equal(quote.credits, 21);
  const second = await services.scriptBatches.create({ ...input, request: { requestKey: randomUUID(), quoteVersion: quote.version! } });
  assert.equal(second.episodes[0].versionId, stopped.episodes[0].versionId); assert.equal(second.episodes[1].versionId, stopped.episodes[1].versionId);
  for (let number = 3; number <= 5; number++) await finish(input.userId, second.episodes[number - 1].jobId!, number);
  assert.equal((await services.scriptBatches.get({ userId: input.userId, batchId: second.id })).status, 'succeeded');
  assert.equal((await services.billing.summary(input.userId)).balance, 45);
});

test('unknown acceptance keeps the original batch and does not activate or charge a second submission', async () => {
  const input = await fixture(); const batch = await services.scriptBatches.create(input); const token = await claim(input.userId, batch.episodes[0].jobId!);
  await services.dramaScripts.submissionUnknown(token);
  const current = await services.scriptBatches.get({ userId: input.userId, batchId: batch.id }); assert.equal(current.episodes[0].status, 'review_required'); assert.equal(current.episodes[1].status, 'waiting');
  assert.equal((await services.scriptBatches.quote(input)).mode, 'disabled');
  assert.equal((await services.scriptBatches.create(input)).id, batch.id); assert.equal((await services.billing.summary(input.userId)).balance, 45);
  await services.opsScriptReview.resolve({ jobId: token.jobId, request: { action: 'reject', requestKey: randomUUID(), reason: 'fixture proves rejection', evidenceReference: 'fixture:rejected', confirmedNotAccepted: true } });
  assert.equal((await services.scriptBatches.get({ userId: input.userId, batchId: batch.id })).refundedCredits, 35);
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});

test('incomplete episode preserves receipt and successful work, while later episodes pause', async () => {
  const input = await fixture(); const batch = await services.scriptBatches.create(input);
  await finish(input.userId, batch.episodes[0].jobId!, 1); await finish(input.userId, batch.episodes[1].jobId!, 2, 'length');
  const stopped = await services.scriptBatches.get({ userId: input.userId, batchId: batch.id });
  assert.equal(stopped.status, 'needs_attention'); assert.equal(stopped.actualCredits, 7); assert.equal(stopped.refundedCredits, 28);
  assert.equal((await services.dramaScripts.response({ userId: input.userId, jobId: batch.episodes[1].jobId! }))?.finishReason, 'length');
});

test('wrong episode number is not billable or included as a completed episode', async () => {
  const input = await fixture(); const batch = await services.scriptBatches.create(input); await finish(input.userId, batch.episodes[0].jobId!, 2);
  const stopped = await services.scriptBatches.get({ userId: input.userId, batchId: batch.id });
  assert.equal(stopped.status, 'needs_attention'); assert.equal(stopped.actualCredits, 0); assert.equal(stopped.refundedCredits, 35); assert.equal(stopped.episodes[0].status, 'needs_repair');
});

test('insufficient balance rolls back every batch, child, reservation and outbox row', async () => {
  const input = await fixture(20); await assert.rejects(services.scriptBatches.create(input), status(402));
  assert.equal(await services.scriptBatches.latest(input), null);
  const [count] = await sql`select count(*)::int as n from wb_next.drama_script_jobs where user_id = ${input.userId}`; assert.equal(count.n, 0);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.length, 1);
});

test('batch owner, quoted content, model and request key are checked', async () => {
  const input = await fixture(); const changed = { ...input, admission: { ...admission, offer: { ...admission.offer!, credits: 8 } } };
  await assert.rejects(services.scriptBatches.create(changed), status(409));
  const batch = await services.scriptBatches.create(input); const other = await fixture();
  await assert.rejects(services.scriptBatches.get({ userId: other.userId, batchId: batch.id }), status(404));
  await assert.rejects(services.scriptBatches.latest({ userId: other.userId, projectId: input.projectId }), status(404));
  await assert.rejects(services.scriptBatches.create({ ...other, userId: input.userId, request: input.request }), status(404));
});
