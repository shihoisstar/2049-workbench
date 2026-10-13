import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
import type { TextGenerationReceiptValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const content = '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。';
const response = (overrides: Partial<TextGenerationReceiptValue> = {}): TextGenerationReceiptValue => ({
  provider: 'mock', model: 'script-fixture-v1', responseId: 'fixture-response', finishReason: 'stop', text: content, textTruncated: false,
  usage: { inputTokens: 195, outputTokens: 2000, cachedInputTokens: null, reasoningTokens: 1800 }, ...overrides,
});
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
async function fixture() {
  const owner = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  // These tests use a single-episode receipt. Multi-episode completeness is checked in drama-series.integration.test.ts.
  const project = await services.drama.create({ userId: owner.userId, mode: 'idea', title: '云海飞行', content: '橘猫寻找月亮。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
  return { userId: owner.userId, projectId: project.id, project, requestKey: randomUUID() };
}

test('script admission is owner scoped, same-key concurrent replay creates one job and outbox', async () => {
  const input = await fixture();
  const jobs = await Promise.all(Array.from({ length: 12 }, () => services.dramaScripts.create(input)));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  const [count] = await sql`select count(*)::int as n from wb_next.drama_script_outbox where job_id = ${jobs[0].id}`;
  assert.equal(count.n, 1);
  assert.equal((await services.dramaScripts.snapshot({ userId: input.userId, jobId: jobs[0].id })).idea, input.project.idea);
  await assert.rejects(services.dramaScripts.create({ ...input, requestKey: randomUUID() }), status(409));
  const other = await fixture();
  await assert.rejects(services.dramaScripts.get({ userId: other.userId, jobId: jobs[0].id }), status(404));
  await assert.rejects(services.dramaScripts.latest({ userId: other.userId, projectId: input.projectId }), status(404));
  await assert.rejects(services.dramaScripts.create({ ...input, userId: other.userId }), status(404));
});

test('request key cannot be reused for another project', async () => {
  const input = await fixture(); await services.dramaScripts.create(input);
  const project = await services.drama.create({ userId: input.userId, mode: 'idea', title: '第二项目', content: '另一个故事', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '通用', tone: '通用' });
  await assert.rejects(services.dramaScripts.create({ ...input, projectId: project.id }), status(409));
});

test('completion replays one draft, reloads from another connection and confirms without spending', async () => {
  const input = await fixture(); const before = await services.billing.summary(input.userId);
  const job = await services.dramaScripts.create(input); const locator = { userId: input.userId, jobId: job.id };
  const results = await Promise.all(Array.from({ length: 8 }, () => services.dramaScripts.complete({ ...locator, content })));
  assert.equal(new Set(results.map(result => result.draftVersion?.id)).size, 1);
  assert.equal(results[0].draftVersion?.source, 'mock_generated');
  assert.equal((await services.drama.getProject(input)).activeVersionId, null);
  await assert.rejects(sql`update wb_next.drama_projects set script_id = ${results[0].draftScriptId}, active_version_id = ${results[0].draftVersion!.id} where id = ${input.projectId}`,
    error => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514');
  await assert.rejects(services.dramaScripts.complete({ ...locator, content: content + '\n橘猫：改变内容。' }), status(409));
  const reloaded = createServices(databaseUrl);
  try { assert.equal((await reloaded.dramaScripts.latest(input))?.id, job.id); } finally { await reloaded.close(); }
  const confirmed = await services.dramaScripts.confirm({ ...input, versionId: results[0].draftVersion!.id });
  assert.equal(confirmed.confirmedVersionId, results[0].draftVersion?.id);
  assert.equal((await services.dramaScripts.confirm({ ...input, versionId: results[0].draftVersion!.id })).confirmedVersionId, confirmed.confirmedVersionId);
  await assert.rejects(services.dramaScripts.create({ ...input, requestKey: randomUUID() }), status(409));
  assert.deepEqual(await services.billing.summary(input.userId), before);
});

test('invalid draft remains repairable; confirmation rejects foreign project and replacement', async () => {
  const input = await fixture(); const job = await services.dramaScripts.create(input);
  const result = await services.dramaScripts.complete({ userId: input.userId, jobId: job.id, content: '格式不正确' });
  assert.equal(result.draftVersion?.parse.status, 'needs_repair');
  await assert.rejects(services.dramaScripts.confirm({ ...input, versionId: result.draftVersion!.id }), status(409));
  const fixed = await services.drama.repairScript({ userId: input.userId, scriptId: result.draftScriptId!, content });
  const other = await fixture();
  await assert.rejects(services.dramaScripts.confirm({ ...other, versionId: fixed.id }), status(404));
  const unrelated = await services.drama.create({ userId: input.userId, mode: 'idea', title: '另一个项目', content: '想法', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '通用', tone: '通用' });
  await assert.rejects(services.dramaScripts.confirm({ ...input, projectId: unrelated.id, versionId: fixed.id }), status(409));
  await services.dramaScripts.confirm({ ...input, versionId: fixed.id });
  const newer = await services.drama.repairScript({ userId: input.userId, scriptId: result.draftScriptId!, content: content + '\n橘猫：再出发。' });
  await assert.rejects(services.dramaScripts.confirm({ ...input, versionId: newer.id }), status(409));
  assert.equal((await services.drama.getProject(input)).activeVersionId, fixed.id);
});

test('failure preserves input, writes no draft, replays and allows a new job', async () => {
  const input = await fixture(); const before = await services.billing.summary(input.userId);
  const job = await services.dramaScripts.create(input); const failure = { userId: input.userId, jobId: job.id, failureCode: 'SCRIPT_GENERATION_FAILED' };
  assert.equal((await services.dramaScripts.fail(failure)).status, 'failed');
  assert.equal((await services.dramaScripts.fail(failure)).status, 'failed');
  await assert.rejects(services.dramaScripts.complete({ ...failure, content }), status(409));
  assert.equal((await services.drama.getProject(input)).idea, input.project.idea);
  assert.equal((await services.drama.listScripts({ userId: input.userId })).items.length, 0);
  assert.notEqual((await services.dramaScripts.create({ ...input, requestKey: randomUUID() })).id, job.id);
  assert.deepEqual(await services.billing.summary(input.userId), before);
});

test('imported projects confirm their fixed version and never accept generation', async () => {
  const input = await fixture();
  const project = await services.drama.create({ userId: input.userId, mode: 'script', title: '导入', content, look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  await assert.rejects(services.dramaScripts.create({ ...input, projectId: project.id }), status(409));
  assert.equal((await services.dramaScripts.confirm({ ...input, projectId: project.id, versionId: project.activeVersionId! })).confirmedVersionId, project.activeVersionId);
});

test('script outbox uses expiring token leases and rejects stale acknowledgement', async () => {
  const input = await fixture(); const job = await services.dramaScripts.create(input);
  const [outbox] = await sql`select id from wb_next.drama_script_outbox where job_id = ${job.id}`;
  // Prioritize only this fixture; never mutate another suite's deliveries.
  await sql`update wb_next.drama_script_outbox set available_at = '1970-01-01'::timestamptz where id = ${outbox.id}`;
  const delivery = await services.dramaScriptOutbox.claim(); assert.equal(delivery?.jobId, job.id);
  await sql`update wb_next.drama_script_outbox set lease_until = clock_timestamp() - interval '1 second' where id = ${outbox.id}`;
  await assert.rejects(services.dramaScriptOutbox.ack(delivery!), status(409));
  const reclaimed = await services.dramaScriptOutbox.claim(); assert.equal(reclaimed?.jobId, job.id);
  assert.notEqual(reclaimed?.leaseToken, delivery?.leaseToken);
  await services.dramaScriptOutbox.ack(reclaimed!);
});

test('script response and one output version commit together and stay private on replay', async () => {
  const input = await fixture(); const job = await services.dramaScripts.create(input);
  const locator = { userId: input.userId, jobId: job.id }; const receipt = response();
  const results = await Promise.all(Array.from({ length: 8 }, () => services.dramaScripts.receive({ ...locator, response: receipt })));
  assert.equal(new Set(results.map(result => result.draftVersion?.id)).size, 1);
  assert.deepEqual(await services.dramaScripts.response(locator), receipt);
  assert.equal('response' in results[0], false);
  const other = await fixture(); await assert.rejects(services.dramaScripts.response({ ...locator, userId: other.userId }), status(404));
  await assert.rejects(services.dramaScripts.receive({ ...locator, response: response({ responseId: 'another-response' }) }), status(409));
  const script = await services.drama.getScript({ userId: input.userId, scriptId: results[0].draftScriptId! });
  assert.equal(script.latestVersion.ordinal, 1);
});

for (const [name, receipt, code] of [
  ['truncated', response({ finishReason: 'length' }), 'SCRIPT_OUTPUT_INCOMPLETE'],
  ['unproven', response({ finishReason: null }), 'SCRIPT_OUTPUT_INCOMPLETE'],
  ['empty', response({ text: ' \n ' }), 'SCRIPT_OUTPUT_EMPTY'],
  ['oversized', response({ text: '字'.repeat(20001) }), 'SCRIPT_OUTPUT_TOO_LONG'],
] as const) {
  test(`${name} script response keeps usage but cannot publish a confirmable draft`, async () => {
    const input = await fixture(); const wallet = await services.billing.summary(input.userId);
    const job = await services.dramaScripts.create(input); const locator = { userId: input.userId, jobId: job.id };
    const failed = await services.dramaScripts.receive({ ...locator, response: receipt });
    assert.equal(failed.status, 'failed'); assert.equal(failed.failureCode, code); assert.equal(failed.draftVersion, null);
    assert.deepEqual(await services.dramaScripts.response(locator), receipt);
    assert.equal((await services.dramaScripts.receive({ ...locator, response: receipt })).status, 'failed');
    assert.equal((await services.drama.listScripts({ userId: input.userId })).items.length, 0);
    assert.deepEqual(await services.billing.summary(input.userId), wallet);
  });
}

test('response publication rollback leaves neither a receipt nor an orphan draft', async () => {
  const input = await fixture(); const job = await services.dramaScripts.create(input); const locator = { userId: input.userId, jobId: job.id };
  const constraint = `script_receipt_probe_${randomUUID().replaceAll('-', '')}`;
  // Only this random fixture is rejected; no other suite's rows are modified.
  await sql.unsafe(`alter table wb_next.drama_script_jobs add constraint ${constraint} check (id <> '${job.id}'::uuid or status <> 'succeeded')`);
  try {
    await assert.rejects(services.dramaScripts.receive({ ...locator, response: response() }),
      error => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514');
    assert.equal(await services.dramaScripts.response(locator), null);
    assert.equal((await services.dramaScripts.get(locator)).status, 'accepted');
    assert.equal((await services.drama.listScripts({ userId: input.userId })).items.length, 0);
  } finally { await sql.unsafe(`alter table wb_next.drama_script_jobs drop constraint ${constraint}`); }
  assert.equal((await services.dramaScripts.receive({ ...locator, response: response() })).status, 'succeeded');
});

test('late response preserves its usage and an already confirmed project version', async () => {
  const input = await fixture(); const first = await services.dramaScripts.create(input);
  const firstResult = await services.dramaScripts.complete({ userId: input.userId, jobId: first.id, content });
  const late = await services.dramaScripts.create({ ...input, requestKey: randomUUID() });
  await services.dramaScripts.confirm({ ...input, versionId: firstResult.draftVersion!.id });
  const locator = { userId: input.userId, jobId: late.id };
  assert.equal((await services.dramaScripts.receive({ ...locator, response: response() })).failureCode, 'SCRIPT_PROJECT_CONFIRMED');
  assert.deepEqual(await services.dramaScripts.response(locator), response());
  assert.equal((await services.drama.getProject(input)).activeVersionId, firstResult.draftVersion!.id);
});
