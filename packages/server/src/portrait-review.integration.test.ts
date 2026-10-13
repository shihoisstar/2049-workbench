import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { SaveDramaPreparation } from '@wb/contracts';
import type { ReviewPortraitRequestValue } from '@wb/contracts';
import { createServices, DomainError, portraitBinding } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const offer = { binding: portraitBinding('atlas'), credits: 7 };
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const review = (taskId?: string): ReviewPortraitRequestValue => taskId
  ? { action: 'receipt', requestKey: randomUUID(), reason: '供应商记录确认任务属于本次生成', evidenceReference: 'fixture-ticket', provider: 'atlas', model: offer.binding.model, providerTaskId: taskId, confirmedTaskOwnership: true }
  : { action: 'reject', requestKey: randomUUID(), reason: '供应商明确确认本次请求未受理', evidenceReference: 'fixture-ticket', confirmedNotAccepted: true };
async function fixture(unknown = true) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '形象核对', content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const draft = await services.drama.getPreparation(input);
  const saved = await services.drama.savePreparation({ ...input, draft: SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
    roles: draft.roles.map(({ key, name, usage }) => ({ key, name, usage, description: '蓝围巾橘猫' })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) }) });
  const request = { roleKey: saved.roles[0].key, preparationRevision: saved.revision }; const quote = await services.rolePortraits.quote({ ...input, request, offer }); assert.ok(quote.version);
  const job = await services.rolePortraits.create({ ...input, offer, request: { ...request, quoteVersion: quote.version, requestKey: randomUUID() } });
  const locator = { userId, jobId: job.id }; const claim = await services.dramaImageSubmissions.begin({ ...locator, providerKey: offer.binding.providerKey }); assert.ok(claim.claimed);
  const token = { ...locator, token: claim.token }; if (unknown) await services.dramaImageSubmissions.unknown(token);
  return token;
}
test('portrait receipt review is atomic, concurrent replay writes one audit/resume and never settles before media', async () => {
  const input = await fixture(); const request = review(randomUUID());
  const results = await Promise.all(Array.from({ length: 6 }, () => services.opsPortraitReview.resolve({ jobId: input.jobId, request })));
  assert.ok(results.every(result => result.job.submissionStatus === 'submitted' && result.job.status === 'accepted'));
  assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const [counts] = await sql`select (select count(*)::int from wb_next.drama_portrait_reviews where job_id = ${input.jobId}) as audits, (select count(*)::int from wb_next.drama_image_outbox where job_id = ${input.jobId} and type = 'drama_image.resume') as resumes`;
  assert.equal(counts.audits, 1); assert.equal(counts.resumes, 1);
  const hash = randomBytes(32).toString('hex'); await services.dramaImageAssets.publish({ ...input, sha256: hash, objectKey: `drama-image-jobs/${input.jobId}/${hash}.png`, byteLength: 100, width: 768, height: 1024 });
  assert.equal((await services.opsPortraitReview.resolve({ jobId: input.jobId, request })).job.status, 'succeeded');
  await assert.rejects(services.opsPortraitReview.resolve({ jobId: input.jobId, request: { ...request, reason: '不同正文不能覆盖核对结论' } }), status(409));
});
test('portrait rejection refunds once and late provider receipt cannot revive the task', async () => {
  const input = await fixture(); const request = review();
  await Promise.all(Array.from({ length: 5 }, () => services.opsPortraitReview.resolve({ jobId: input.jobId, request })));
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, 1);
  await assert.rejects(services.dramaImageSubmissions.accepted({ ...input, providerTaskId: randomUUID() }), status(409));
  await assert.rejects(services.opsPortraitReview.resolve({ jobId: input.jobId, request: review(randomUUID()) }), status(409));
});
test('portrait review handles receipt/reject and original receipt/reject races with one outcome', async () => {
  for (const original of [false, true]) {
    const input = await fixture(); const receipt = original ? services.dramaImageSubmissions.accepted({ ...input, providerTaskId: randomUUID() }) : services.opsPortraitReview.resolve({ jobId: input.jobId, request: review(randomUUID()) });
    const results = await Promise.allSettled([receipt, services.opsPortraitReview.resolve({ jobId: input.jobId, request: review() })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const state = await services.dramaImageSubmissions.get(input); assert.equal((await services.billing.summary(input.userId)).balance, state?.status === 'submitted' ? 73 : 80);
  }
});
test('portrait review key and provider task cannot be attached twice across jobs', async () => {
  const left = await fixture(); const right = await fixture(); const request = review();
  const results = await Promise.allSettled([services.opsPortraitReview.resolve({ jobId: left.jobId, request }), services.opsPortraitReview.resolve({ jobId: right.jobId, request })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const a = await fixture(); const b = await fixture(); const id = randomUUID();
  await services.opsPortraitReview.resolve({ jobId: a.jobId, request: review(id) });
  await assert.rejects(services.opsPortraitReview.resolve({ jobId: b.jobId, request: review(id) }), status(409));
  assert.equal((await services.dramaImageSubmissions.get(b))?.status, 'unknown');
});
test('audit failure rolls back receipt, refund and wakeup for both decisions', async () => {
  for (const receipt of [false, true]) {
    const input = await fixture(); const request = review(receipt ? randomUUID() : undefined); const name = `portrait_review_probe_${randomUUID().replaceAll('-', '')}`;
    await sql.unsafe(`alter table wb_next.drama_portrait_reviews add constraint ${name} check (job_id <> '${input.jobId}')`);
    try { await assert.rejects(services.opsPortraitReview.resolve({ jobId: input.jobId, request })); }
    finally { await sql.unsafe(`alter table wb_next.drama_portrait_reviews drop constraint ${name}`); }
    assert.equal((await services.dramaImageSubmissions.get(input))?.status, 'unknown'); assert.equal((await services.billing.summary(input.userId)).balance, 73);
    const [row] = await sql`select count(*)::int as n from wb_next.drama_image_outbox where job_id = ${input.jobId} and type = 'drama_image.resume'`; assert.equal(row.n, 0);
  }
});
test('fresh submission cannot be reviewed; stale listing omits secrets and processed cursor remains valid', async () => {
  const input = await fixture(false); await assert.rejects(services.opsPortraitReview.resolve({ jobId: input.jobId, request: review() }), status(409));
  await sql`update wb_next.drama_image_submissions set created_at = clock_timestamp() - interval '3 minutes' where job_id = ${input.jobId}`;
  const list = await services.opsPortraitReview.list(); const item = list.items.find(row => row.jobId === input.jobId); assert.ok(item);
  assert.equal(JSON.stringify(item).includes(input.token), false); assert.equal('providerKey' in item, false);
  const mismatch = review(randomUUID()); assert.equal(mismatch.action, 'receipt'); if (mismatch.action === 'receipt') mismatch.model = 'wrong-model';
  await assert.rejects(services.opsPortraitReview.resolve({ jobId: input.jobId, request: mismatch }), status(409));
  await services.opsPortraitReview.resolve({ jobId: input.jobId, request: review() }); await services.opsPortraitReview.list({ cursor: input.jobId });
});
