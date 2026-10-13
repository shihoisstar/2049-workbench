import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { SaveDramaPreparation } from '@wb/contracts';
import { createServices, DomainError } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); after(() => services.close());
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
async function fixture(episodeCount = 1) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const content = Array.from({ length: episodeCount }, (_, n) => `## 第${n + 1}集\n**场景1：云海 日/外**\n（阿橘和阿白看云。）\n阿橘：（挥爪）第${n + 1}站出发。\n阿白（画外音）：跟上。\n（云散开。）`).join('\n\n');
  const project = await services.drama.create({ userId, mode: 'script', title: '逐集视频', content, look: '3D国创', aspectRatio: '9:16', episodeCount });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const initial = await services.drama.getPreparation(input);
  const draft = SaveDramaPreparation.parse({ scriptVersionId: initial.scriptVersionId, baseRevision: 0, roles: initial.roles.map(({ key, name, usage, description, referenceMaterialId }) => ({ key, name, usage, description, referenceMaterialId })), scenes: initial.scenes.map(({ key, description }) => ({ key, description })) });
  for (const role of draft.roles.filter(role => role.usage === 'visual')) { const hash = randomBytes(32).toString('hex'); const material = await services.materials.register({ userId, sha256: hash, objectKey: `materials/${userId}/${hash}.png`, contentType: 'image/png', width: 768, height: 1024, byteLength: 100, expiresAt: new Date(Date.now() + 600000).toISOString() }); role.referenceMaterialId = material.id; }
  let prepared = await services.drama.savePreparation({ ...input, draft });
  for (const role of prepared.roles.filter(role => role.usage === 'visual')) prepared = await services.drama.confirmRoleAppearance({ ...input, confirmation: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision, roleKey: role.key } });
  let plan = await services.storyboardPlans.create({ ...input, request: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision } });
  for (const shot of plan.shots) plan = await services.storyboardPlans.update({ userId, planId: plan.id, request: { baseRevision: plan.revision, shotKey: shot.key, content: shot.content, roleKeys: shot.roleKeys, reviewed: true } });
  await services.billing.grant({ userId, billingKey: randomUUID(), amount: 500 });
  return { ...input, plan };
}
async function image(input: Awaited<ReturnType<typeof fixture>>, index: number) {
  const request = { shotKey: input.plan.shots[index].key, planRevision: input.plan.revision }; const base = { userId: input.userId, planId: input.plan.id, mockAvailable: true };
  const quote = await services.planImages.quote({ ...base, request }); const created = await services.planImages.create({ ...base, request: { ...request, quoteVersion: quote.version!, requestKey: randomUUID() } });
  const locator = { userId: input.userId, jobId: created.jobId }; const claim = await services.dramaImageSubmissions.begin({ ...locator, providerKey: 'mock-candidate-image:v1' }); assert.ok(claim.claimed);
  await services.dramaImageSubmissions.accepted({ ...locator, token: claim.token, providerTaskId: `mock-image:${created.jobId}` }); const sha256 = randomBytes(32).toString('hex');
  await services.dramaImageAssets.publish({ ...locator, sha256, objectKey: `drama-image-jobs/${created.jobId}/${sha256}.png`, byteLength: 100, width: 768, height: 1024 });
  return services.planImages.select({ userId: input.userId, candidateId: created.candidateId, planRevision: input.plan.revision });
}
async function command(input: Awaited<ReturnType<typeof fixture>>, candidateId: string) {
  const base = { userId: input.userId, candidateId, planRevision: input.plan.revision, mockAvailable: true }; const quote = await services.dramaShotVideos.quotePlan(base); assert.equal(quote.credits, 7);
  return { ...base, quoteVersion: quote.version!, requestKey: randomUUID() };
}
async function publish(userId: string, jobId: string) {
  const locator = { userId, jobId }; const claim = await services.dramaShotVideoSubmissions.begin({ ...locator, providerKey: 'mock-shot-video:v1' }); assert.ok(claim.claimed);
  await services.dramaShotVideoSubmissions.accepted({ ...locator, token: claim.token, providerTaskId: `mock-video:${jobId}` }); const sha256 = randomBytes(32).toString('hex');
  return services.dramaShotVideoAssets.publish({ ...locator, sha256, objectKey: `drama-shot-video-jobs/${jobId}/${sha256}.mp4`, byteLength: 100, width: 240, height: 426, durationMs: 5000 });
}
test('plan video freezes roles and source speech, reserves once, replays when closed, and requires receipt', async () => {
  const input = await fixture(); const candidate = await image(input, 1); const request = await command(input, candidate.candidateId); const before = await services.billing.summary(input.userId);
  const jobs = await Promise.all(Array.from({ length: 8 }, () => services.dramaShotVideos.createPlan(request))); assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  const job = jobs[0]; assert.equal(job.plan?.content, input.plan.shots[1].content); assert.deepEqual(job.plan?.spokenLines, [{ speaker: '阿橘', text: '第1站出发。', voiceOver: false }]);
  await assert.rejects(services.dramaShotVideos.complete({ userId: input.userId, jobId: job.id, outputRef: 'fake', actualCredits: 7 }), status(409));
  await assert.rejects(services.dramaShotVideos.fail({ userId: input.userId, jobId: job.id, failureCode: 'UNKNOWN_MUST_NOT_REFUND' }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, before.balance - 7);
  assert.equal((await services.dramaShotVideos.createPlan({ ...request, mockAvailable: false })).id, job.id);
  await assert.rejects(services.dramaShotVideos.createPlan({ ...request, quoteVersion: 'changed' }), status(409));
  const sha256 = randomBytes(32).toString('hex'); await assert.rejects(services.dramaShotVideoAssets.publish({ userId: input.userId, jobId: job.id, sha256, objectKey: `drama-shot-video-jobs/${job.id}/${sha256}.mp4`, byteLength: 100, width: 240, height: 426, durationMs: 5000 }), status(409));
  await publish(input.userId, job.id); assert.equal((await services.billing.summary(input.userId)).balance, before.balance - 7);
});
test('plan video rejects stale content, different owner, closed admission and insufficient balance without hold', async () => {
  const input = await fixture(); const candidate = await image(input, 0); const request = await command(input, candidate.candidateId);
  await assert.rejects(services.dramaShotVideos.createPlan({ ...request, mockAvailable: false }), status(503));
  const other = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); await assert.rejects(services.dramaShotVideos.createPlan({ ...request, userId: other.userId }), status(404));
  const shot = input.plan.shots[0]; await services.storyboardPlans.update({ userId: input.userId, planId: input.plan.id, request: { baseRevision: input.plan.revision, shotKey: shot.key, content: '改成云上远景。', roleKeys: [], reviewed: true } });
  await assert.rejects(services.dramaShotVideos.createPlan(request), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 573);
  const limited = await fixture(); const selected = await image(limited, 0); const valid = await command(limited, selected.candidateId);
  await services.billing.reserve({ userId: limited.userId, billingKey: randomUUID(), estimate: 570, model: 'fixture', estimatedCostCents: null });
  await assert.rejects(services.dramaShotVideos.createPlan(valid), status(402)); assert.equal((await services.dramaShotVideos.listForCandidates({ userId: limited.userId, candidateIds: [selected.candidateId] })).length, 0);
});
test('all five episodes require every ordered shot, freeze separate manifests and preserve old exports after edit', async () => {
  const input = await fixture(5); const exports = [];
  for (let index = 0; index < input.plan.shots.length; index++) {
    const candidate = await image(input, index); const video = await services.dramaShotVideos.createPlan(await command(input, candidate.candidateId));
    if (index === 0) await assert.rejects(services.dramaExports.create({ ...input, planId: input.plan.id, planRevision: input.plan.revision, episodeNumber: 1, requestKey: randomUUID() }), status(409));
    await publish(input.userId, video.id);
  }
  for (let episodeNumber = 1; episodeNumber <= 5; episodeNumber++) {
    const request = { userId: input.userId, projectId: input.projectId, planId: input.plan.id, planRevision: input.plan.revision, episodeNumber, requestKey: randomUUID() };
    const created = await services.dramaExports.create(request); exports.push({ request, created });
    assert.equal(created.version.manifest.formatVersion, 2); if (created.version.manifest.formatVersion !== 2) throw new Error('Expected v2');
    assert.deepEqual(created.version.manifest.shots.map(shot => shot.shotNumber), [1,2,3,4]); assert.equal(created.version.manifest.audioMode, 'silent_preview');
    assert.deepEqual(created.version.manifest.shots[2].spokenLines, [{ speaker: '阿白', text: '跟上。', voiceOver: true }]); assert.deepEqual(created.version.manifest.shots[3].roleVersionIds, []);
    assert.equal((await services.dramaExports.create(request)).job.id, created.job.id);
  }
  assert.equal(new Set(exports.map(item => item.created.job.id)).size, 5); assert.equal((await services.dramaExports.listForPlan({ userId: input.userId, planId: input.plan.id })).length, 5);
  const shot = input.plan.shots[0]; await services.storyboardPlans.update({ userId: input.userId, planId: input.plan.id, request: { baseRevision: input.plan.revision, shotKey: shot.key, content: '新远景', roleKeys: [], reviewed: true } });
  assert.deepEqual((await services.dramaExports.create(exports[0].request)).version.manifest, exports[0].created.version.manifest);
  await assert.rejects(services.dramaExports.create({ ...exports[0].request, requestKey: randomUUID() }), status(409));
  await assert.rejects(services.dramaExports.create({ ...exports[0].request, planRevision: input.plan.revision + 1 }), status(409));
});
