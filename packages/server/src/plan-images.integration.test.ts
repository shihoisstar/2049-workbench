import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { SaveDramaPreparation } from '@wb/contracts';
import { createServices, DomainError } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 }); after(async () => { await services.close(); await sql.end(); });
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '分镜图片', content: '## 第1集\n**场景1：云海 日/外**\n（阿橘和小狐并肩看云。）\n阿橘：出发。\n小狐：跟上。\n（云层缓缓散开。）', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const initial = await services.drama.getPreparation(input);
  const draft = SaveDramaPreparation.parse({ scriptVersionId: initial.scriptVersionId, baseRevision: 0, roles: initial.roles.map(({ key, name, usage, description, referenceMaterialId }) => ({ key, name, usage, description, referenceMaterialId })), scenes: initial.scenes.map(({ key, description }) => ({ key, description })) });
  for (const role of draft.roles) {
    const hash = randomBytes(32).toString('hex'); const material = await services.materials.register({ userId, sha256: hash, objectKey: `materials/${userId}/${hash}.png`, contentType: 'image/png', width: 768, height: 1024, byteLength: 100, expiresAt: new Date(Date.now() + 600000).toISOString() });
    role.referenceMaterialId = material.id;
  }
  let prepared = await services.drama.savePreparation({ ...input, draft });
  for (const role of prepared.roles) prepared = await services.drama.confirmRoleAppearance({ ...input, confirmation: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision, roleKey: role.key } });
  let plan = await services.storyboardPlans.create({ ...input, request: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision } });
  for (const shot of plan.shots) plan = await services.storyboardPlans.update({ userId, planId: plan.id, request: { baseRevision: plan.revision, shotKey: shot.key, content: shot.content, roleKeys: shot.roleKeys, reviewed: true } });
  return { ...input, plan, prepared };
}
async function request(input: Awaited<ReturnType<typeof fixture>>, index = 0) {
  const base = { userId: input.userId, planId: input.plan.id, mockAvailable: true };
  const body = { shotKey: input.plan.shots[index].key, planRevision: input.plan.revision };
  const quote = await services.planImages.quote({ ...base, request: body }); assert.equal(quote.credits, 7); assert.ok(quote.version);
  return { ...base, request: { ...body, requestKey: randomUUID(), quoteVersion: quote.version } };
}
async function publish(input: { userId: string; jobId: string }) {
  const claim = await services.dramaImageSubmissions.begin({ ...input, providerKey: 'mock-candidate-image:v1' }); assert.ok(claim.claimed);
  await services.dramaImageSubmissions.accepted({ ...input, token: claim.token, providerTaskId: `mock-image:${input.jobId}` });
  const sha256 = randomBytes(32).toString('hex'); return services.dramaImageAssets.publish({ ...input, sha256, objectKey: `drama-image-jobs/${input.jobId}/${sha256}.png`, byteLength: 100, width: 768, height: 1024 });
}
test('reviewed multi-role and empty shots use separate ordered slots and immutable references', async () => {
  const input = await fixture(); const multi = await services.planImages.create(await request(input)); const empty = await services.planImages.create(await request(input, 3));
  assert.equal(multi.roleVersionIds.length, 2); assert.equal(empty.roleVersionIds.length, 0); assert.notEqual(multi.shotId, empty.shotId);
  assert.deepEqual(multi.roleVersionIds, input.prepared.roles.map(role => role.selection!.roleVersionId));
  const rows = await sql`select scene_number, shot_number from wb_next.drama_storyboard_shots where plan_id = ${input.plan.id} order by episode_number, scene_number, shot_number`;
  assert.deepEqual(rows.map(row => [row.scene_number, row.shot_number]), [[1, 1], [1, 4]]);
  const [candidate] = await sql`select role_version_id, scene_version_id, scene_snapshot from wb_next.drama_storyboard_candidates where id = ${multi.candidateId}`;
  assert.equal(candidate.role_version_id, null); assert.equal(candidate.scene_version_id, null); assert.equal(candidate.scene_snapshot.aspectRatio, '9:16');
  assert.equal((await services.drama.getWorkflow(input)).shots.length, 0);
  await assert.rejects(services.drama.selectCandidate({ userId: input.userId, candidateId: multi.candidateId }), status(404));
  await assert.rejects(services.dramaShotVideos.create({ userId: input.userId, shotId: multi.shotId, requestKey: randomUUID() }), status(404));
  await assert.rejects(services.dramaExports.create({ ...input, episodeNumber: 1, requestKey: randomUUID() }), status(409));
});
test('concurrent replay reserves once; disabled historical replay works and a second active request rolls back', async () => {
  const input = await fixture(); const command = await request(input);
  const items = await Promise.all(Array.from({ length: 8 }, () => services.planImages.create(command)));
  assert.equal(new Set(items.map(item => item.jobId)).size, 1); assert.equal((await services.billing.summary(input.userId)).balance, 73);
  assert.equal((await services.planImages.create({ ...command, mockAvailable: false })).jobId, items[0].jobId);
  await assert.rejects(services.planImages.create({ ...command, request: { ...command.request, requestKey: randomUUID() } }), status(409));
  assert.equal((await services.planImages.list({ userId: input.userId, planId: input.plan.id, shotKey: command.request.shotKey })).items.length, 1);
  const [counts] = await sql`select (select count(*)::int from wb_next.drama_image_outbox where job_id = ${items[0].jobId}) as events, (select estimated_cost_cents from wb_next.reservations where user_id = ${input.userId} and billing_key = ${`drama-image:${items[0].jobId}`}) as cost`;
  assert.equal(counts.events, 1); assert.equal(counts.cost, null);
});
test('selection requires published current media, keeps other candidates and never charges again', async () => {
  const input = await fixture(); const first = await services.planImages.create(await request(input));
  const select = { userId: input.userId, candidateId: first.candidateId, planRevision: input.plan.revision };
  await assert.rejects(services.planImages.select(select), status(409));
  await assert.rejects(services.dramaImages.complete({ userId: input.userId, jobId: first.jobId, outputRef: 'fake', actualCredits: 7 }), status(409));
  await publish({ userId: input.userId, jobId: first.jobId }); const chosen = await services.planImages.select(select); assert.ok(chosen.selectedAt);
  assert.equal((await services.planImages.select(select)).selectedAt, chosen.selectedAt);
  const next = await services.planImages.create(await request(input)); await publish({ userId: input.userId, jobId: next.jobId });
  await services.planImages.select({ ...select, candidateId: next.candidateId });
  const page = await services.planImages.list({ userId: input.userId, planId: input.plan.id, shotKey: first.shotKey }); assert.equal(page.items.length, 2); assert.equal(page.items.filter(item => item.selectedAt).length, 1);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 66); assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 2);
});
test('editing content invalidates old candidates without erasing images or changing their role versions', async () => {
  const input = await fixture(); const first = await services.planImages.create(await request(input)); await publish({ userId: input.userId, jobId: first.jobId });
  const shot = input.plan.shots[0]; const changed = await services.storyboardPlans.update({ userId: input.userId, planId: input.plan.id, request: { baseRevision: input.plan.revision, shotKey: shot.key, content: '空镜：云层散开。', roleKeys: [], reviewed: true } });
  const page = await services.planImages.list({ userId: input.userId, planId: input.plan.id, shotKey: shot.key }); assert.equal(page.items[0].current, false); assert.deepEqual(page.items[0].roleVersionIds, first.roleVersionIds);
  await assert.rejects(services.planImages.select({ userId: input.userId, candidateId: first.candidateId, planRevision: changed.revision }), status(409));
  const next = await services.planImages.create(await request({ ...input, plan: changed })); assert.equal(next.roleVersionIds.length, 0); assert.equal(next.shotId, first.shotId);
});
test('failure refund is once, new retry preserves failed candidate, expired or foreign selection is rejected', async () => {
  const input = await fixture(); const first = await services.planImages.create(await request(input)); const failure = { userId: input.userId, jobId: first.jobId, failureCode: 'MOCK_STORAGE_FAILED' };
  await services.dramaImages.fail(failure); await services.dramaImages.fail(failure); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  const next = await services.planImages.create(await request(input)); await publish({ userId: input.userId, jobId: next.jobId });
  assert.equal((await services.planImages.list({ userId: input.userId, planId: input.plan.id, shotKey: next.shotKey })).items.length, 2);
  const other = await fixture(); await assert.rejects(services.planImages.select({ userId: other.userId, candidateId: next.candidateId, planRevision: input.plan.revision }), status(404));
  await sql`update wb_next.drama_image_assets set expires_at = clock_timestamp() - interval '1 second', created_at = clock_timestamp() - interval '2 seconds' where job_id = ${next.jobId}`;
  await assert.rejects(services.planImages.select({ userId: input.userId, candidateId: next.candidateId, planRevision: input.plan.revision }), status(410));
});
test('stale quote, disabled admission, insufficient credit and missing review never leave candidate records', async () => {
  const input = await fixture(); const command = await request(input);
  await assert.rejects(services.planImages.create({ ...command, mockAvailable: false }), status(503));
  await assert.rejects(services.planImages.create({ ...command, request: { ...command.request, quoteVersion: 'forged' } }), status(409));
  await services.billing.reserve({ userId: input.userId, billingKey: randomUUID(), estimate: 79, model: 'fixture', estimatedCostCents: null });
  await assert.rejects(services.planImages.create(command), status(402));
  const [row] = await sql`select count(*)::int as n from wb_next.drama_storyboard_shots where plan_id = ${input.plan.id}`; assert.equal(row.n, 0);
  const shot = input.plan.shots[0]; const edited = await services.storyboardPlans.update({ userId: input.userId, planId: input.plan.id, request: { baseRevision: input.plan.revision, shotKey: shot.key, content: shot.content, roleKeys: shot.roleKeys, reviewed: false } });
  await assert.rejects(services.planImages.quote({ ...command, request: { shotKey: shot.key, planRevision: edited.revision } }), status(409));
});
