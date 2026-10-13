import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { SaveDramaPreparation } from '@wb/contracts';
import { createServices, DomainError, portraitBinding } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const offer = { binding: portraitBinding('mock'), credits: 7 };
const status = (value: number) => (error: unknown) => error instanceof DomainError && error.statusCode === value;
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '角色候选', content: '## 第1集\n**场景1：云海 日/外**\n阿橘：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id };
  await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const initial = await services.drama.getPreparation(input);
  const draft = SaveDramaPreparation.parse({ scriptVersionId: initial.scriptVersionId, baseRevision: initial.revision,
    roles: initial.roles.map(({ key, name, usage, referenceMaterialId }) => ({ key, name, usage, referenceMaterialId, description: '橘猫，蓝围巾' })), scenes: initial.scenes.map(({ key, description }) => ({ key, description })) });
  const prepared = await services.drama.savePreparation({ ...input, draft });
  const request = { roleKey: prepared.roles[0].key, preparationRevision: prepared.revision };
  const quote = await services.rolePortraits.quote({ ...input, request, offer }); assert.ok(quote.version);
  return { ...input, request: { ...request, quoteVersion: quote.version, requestKey: randomUUID() }, offer };
}
async function publish(input: Awaited<ReturnType<typeof fixture>>) {
  const job = await services.rolePortraits.create(input); const locator = { userId: input.userId, jobId: job.id };
  const claim = await services.dramaImageSubmissions.begin({ ...locator, providerKey: offer.binding.providerKey }); assert.ok(claim.claimed);
  await services.dramaImageSubmissions.accepted({ ...locator, token: claim.token, providerTaskId: `fixture:${job.id}` });
  const sha256 = randomBytes(32).toString('hex'); const data = { ...locator, sha256, objectKey: `drama-image-jobs/${job.id}/${sha256}.png`, width: 768, height: 1024, byteLength: 1234 };
  const asset = await services.dramaImageAssets.publish(data);
  return { locator, data, asset };
}
test('portrait quote is free; concurrent admission holds once and old request replays with generation disabled', async () => {
  const input = await fixture(); assert.equal((await services.billing.summary(input.userId)).balance, 80);
  const jobs = await Promise.all(Array.from({ length: 6 }, () => services.rolePortraits.create(input)));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1); assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const replay = await services.rolePortraits.create({ ...input, offer: null }); assert.equal(replay.id, jobs[0].id);
  await assert.rejects(services.rolePortraits.create({ ...input, request: { ...input.request, requestKey: randomUUID() } }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 73);
  const [counts] = await sql`select count(*)::int as n from wb_next.drama_image_jobs where user_id = ${input.userId}`; assert.equal(counts.n, 1);
});
test('portrait quote binds price and revision, disabled admission and foreign owner cannot hold funds', async () => {
  const input = await fixture(); const other = await fixture();
  await assert.rejects(services.rolePortraits.create({ ...input, offer: null }), status(503));
  await assert.rejects(services.rolePortraits.create({ ...input, offer: { ...offer, credits: 8 } }), status(409));
  await assert.rejects(services.rolePortraits.create({ ...input, request: { ...input.request, preparationRevision: 999 } }), status(409));
  await assert.rejects(services.rolePortraits.create({ ...input, userId: other.userId }), status(404));
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
test('unknown portrait cannot refund, publish or claim a second provider submission', async () => {
  const input = await fixture(); const job = await services.rolePortraits.create(input); const locator = { userId: input.userId, jobId: job.id };
  const claim = await services.dramaImageSubmissions.begin({ ...locator, providerKey: offer.binding.providerKey }); assert.ok(claim.claimed);
  await services.dramaImageSubmissions.unknown({ ...locator, token: claim.token });
  assert.equal((await services.dramaImageSubmissions.begin({ ...locator, providerKey: offer.binding.providerKey })).claimed, false);
  await assert.rejects(services.dramaImages.fail({ ...locator, failureCode: 'TIMEOUT' }), status(409));
  await assert.rejects(services.dramaImages.complete({ ...locator, outputRef: 'fake', actualCredits: 7 }), status(409));
  await assert.rejects(services.dramaImageAssets.publish({ ...locator, objectKey: `drama-image-jobs/${job.id}/${'a'.repeat(64)}.png`, sha256: 'a'.repeat(64), width: 768, height: 1024, byteLength: 10 }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 73);
});
test('portrait publication settles once, explicit selection leaves appearance unconfirmed and pins generated material TTL', async () => {
  const input = await fixture(); const { locator, data, asset } = await publish(input); assert.ok(asset.referenceMaterialId);
  assert.deepEqual(await services.dramaImageAssets.publish(data), asset);
  const material = await services.materials.get({ userId: input.userId, materialId: asset.referenceMaterialId });
  assert.equal(material.expiresAt, asset.expiresAt); assert.equal(material.objectKey, `materials/${input.userId}/generated/${locator.jobId}/${asset.sha256}.png`);
  assert.equal((await services.drama.getPreparation(input)).roles[0].referenceMaterialId, null);
  const selected = await services.rolePortraits.select({ ...locator, preparationRevision: input.request.preparationRevision });
  assert.equal(selected.roles[0].referenceMaterialId, material.id); assert.equal(selected.roles[0].selection, null);
  assert.equal((await services.drama.getWorkflow(input)).roles.length, 0);
  assert.equal((await services.rolePortraits.select({ ...locator, preparationRevision: input.request.preparationRevision })).revision, selected.revision);
  const confirmed = await services.drama.confirmRoleAppearance({ ...input, confirmation: { scriptVersionId: selected.scriptVersionId, preparationRevision: selected.revision, roleKey: selected.roles[0].key } });
  assert.equal(confirmed.roles[0].selection?.referenceSha256, asset.sha256);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 73); assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 1);
});
test('edited role rejects old portrait; expired generated reference is never renewed by publication replay', async () => {
  const input = await fixture(); const { locator, data, asset } = await publish(input); assert.ok(asset.referenceMaterialId);
  const initial = await services.drama.getPreparation(input);
  const draft = SaveDramaPreparation.parse({ scriptVersionId: initial.scriptVersionId, baseRevision: initial.revision, roles: initial.roles.map(({ key, name, usage, referenceMaterialId }) => ({ key, name, usage, referenceMaterialId, description: '橘猫，红围巾' })), scenes: initial.scenes.map(({ key, description }) => ({ key, description })) });
  const edited = await services.drama.savePreparation({ ...input, draft });
  assert.equal((await services.rolePortraits.get(locator)).current, false);
  await assert.rejects(services.rolePortraits.select({ ...locator, preparationRevision: edited.revision }), status(409));
  await sql`update wb_next.user_materials set status = 'expired', expires_at = clock_timestamp() - interval '1 second' where id = ${asset.referenceMaterialId}`;
  await services.dramaImageAssets.publish(data);
  const [expired] = await sql`select status, expires_at < clock_timestamp() as expired from wb_next.user_materials where id = ${asset.referenceMaterialId}`;
  assert.equal(expired.status, 'expired'); assert.equal(expired.expired, true);
  assert.equal((await services.rolePortraits.list({ ...input, roleKey: input.request.roleKey })).items.length, 1);
  const other = await fixture(); await assert.rejects(services.rolePortraits.get({ ...locator, userId: other.userId }), status(404));
});
