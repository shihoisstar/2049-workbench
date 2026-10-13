import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
import { SaveDramaPreparation } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const body = (draft: DramaPreparationValue) => SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
  roles: draft.roles.map(({ key, name, usage, description, referenceMaterialId }) => ({ key, name, usage, description, referenceMaterialId })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) });
async function material(userId: string) {
  const sha256 = randomBytes(32).toString('hex');
  return services.materials.register({ userId, objectKey: `materials/${userId}/${sha256}.png`, sha256, contentType: 'image/png', byteLength: 1234, width: 256, height: 256, expiresAt: new Date(Date.now() + 600000).toISOString() });
}
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '角色形象', content: '## 第1集\n**场景1：云海 日/外**\n阿橘：出发。\n广播声（OS）：前方晴朗。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const input = { userId, projectId: project.id };
  await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  return input;
}
async function ready(input: Awaited<ReturnType<typeof fixture>>) {
  const image = await material(input.userId); const draft = body(await services.drama.getPreparation(input));
  draft.roles[0].description = '橘猫，蓝色围巾'; draft.roles[0].referenceMaterialId = image.id;
  const saved = await services.drama.savePreparation({ ...input, draft });
  return { image, saved, confirmation: { scriptVersionId: saved.scriptVersionId, preparationRevision: saved.revision, roleKey: saved.roles[0].key } };
}
test('reference selection stays a free draft until confirmed; concurrent confirmation creates one fixed version', async () => {
  const input = await fixture(); const before = await services.billing.summary(input.userId); const prepared = await ready(input);
  assert.equal((await services.drama.getWorkflow(input)).roles.length, 0);
  const results = await Promise.all(Array.from({ length: 8 }, () => services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation })));
  assert.ok(results.every(item => item.roles[0].selection?.status === 'confirmed'));
  assert.equal(new Set(results.map(item => item.roles[0].selection!.roleVersionId)).size, 1);
  const [count] = await sql`select count(*)::int as n from wb_next.drama_role_versions v join wb_next.drama_roles r on r.id = v.role_id where r.project_id = ${input.projectId}`; assert.equal(count.n, 1);
  assert.equal(results[0].roles[0].selection!.referenceSha256, prepared.image.sha256);
  assert.deepEqual(await services.billing.summary(input.userId), before);
  assert.equal((await services.materials.get({ userId: input.userId, materialId: prepared.image.id })).expiresAt, prepared.image.expiresAt);
});
test('description change requires confirmation and old selected shots retain their role version', async () => {
  const input = await fixture(); const prepared = await ready(input);
  const first = await services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation }); const firstVersion = first.roles[0].selection!.roleVersionId;
  const scene = await services.drama.createScene({ ...input, name: '云海', description: '粉色云海' });
  const shot = await services.drama.createShot({ ...input, episodeNumber: 1, sceneNumber: 1, prompt: '飞船出发' });
  const candidate = await services.drama.createCandidate({ userId: input.userId, shotId: shot.id, roleVersionId: firstVersion, sceneVersionId: scene.latestVersion.id, prompt: '阿橘出发' });
  await services.drama.selectCandidate({ userId: input.userId, candidateId: candidate.id });
  const draft = body(first); draft.roles[0].description = '橘猫，红色围巾';
  const edited = await services.drama.savePreparation({ ...input, draft }); assert.equal(edited.roles[0].selection?.status, 'needs_confirmation');
  const second = await services.drama.confirmRoleAppearance({ ...input, confirmation: { ...prepared.confirmation, preparationRevision: edited.revision } });
  assert.notEqual(second.roles[0].selection?.roleVersionId, firstVersion);
  assert.equal((await services.drama.selectedCandidateForShot({ userId: input.userId, shotId: shot.id })).roleVersionId, firstVersion);
});
test('changing image pins new hash without silently adopting an unrelated latest role revision', async () => {
  const input = await fixture(); const prepared = await ready(input);
  const first = await services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation });
  const role = (await services.drama.getWorkflow(input)).roles[0]; const other = await material(input.userId);
  await services.drama.reviseRole({ userId: input.userId, roleId: role.id, description: '旧工作台单独改版', referenceMaterialId: other.id });
  const replay = await services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation }); assert.equal(replay.roles[0].selection?.roleVersionId, first.roles[0].selection?.roleVersionId);
  const draft = body(first); draft.roles[0].referenceMaterialId = other.id;
  const saved = await services.drama.savePreparation({ ...input, draft });
  const adopted = await services.drama.confirmRoleAppearance({ ...input, confirmation: { ...prepared.confirmation, preparationRevision: saved.revision } });
  assert.equal(adopted.roles[0].selection?.referenceSha256, other.sha256); assert.notEqual(adopted.roles[0].selection?.roleVersionId, first.roles[0].selection?.roleVersionId);
});
test('foreign materials and stale preparation cannot create role assets', async () => {
  const input = await fixture(); const other = await fixture(); const foreign = await material(other.userId); const draft = body(await services.drama.getPreparation(input));
  draft.roles[0].referenceMaterialId = foreign.id;
  await assert.rejects(services.drama.savePreparation({ ...input, draft }), status(404)); assert.equal((await services.drama.getPreparation(input)).revision, 0);
  const prepared = await ready(input);
  await assert.rejects(services.drama.confirmRoleAppearance({ ...input, userId: other.userId, confirmation: prepared.confirmation }), status(404));
  await assert.rejects(services.drama.confirmRoleAppearance({ ...input, confirmation: { ...prepared.confirmation, preparationRevision: 999 } }), status(409));
  assert.equal((await services.drama.getWorkflow(input)).roles.length, 0);
});
test('expired images remain traceable but cannot be confirmed again', async () => {
  const input = await fixture(); const prepared = await ready(input);
  const first = await services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation });
  await sql`update wb_next.user_materials set status = 'expired', expires_at = clock_timestamp() - interval '1 second' where id = ${prepared.image.id}`;
  assert.equal((await services.drama.getPreparation(input)).roles[0].selection?.status, 'expired');
  await assert.rejects(services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation }), status(409));
  assert.equal((await services.drama.getWorkflow(input)).roles[0].latestVersion.id, first.roles[0].selection!.roleVersionId);
});
test('voice-only roles do not require or create visual assets', async () => {
  const input = await fixture(); const prepared = await ready(input);
  await assert.rejects(services.drama.confirmRoleAppearance({ ...input, confirmation: { ...prepared.confirmation, roleKey: prepared.saved.roles[1].key } }), status(409));
  await services.drama.confirmRoleAppearance({ ...input, confirmation: prepared.confirmation });
  const draft = body(await services.drama.getPreparation(input)); draft.roles[0].usage = 'voice_only'; draft.roles[0].referenceMaterialId = null;
  const saved = await services.drama.savePreparation({ ...input, draft }); assert.equal(saved.roles[0].selection?.status, 'needs_confirmation');
  assert.equal((await services.drama.getWorkflow(input)).roles.length, 1);
  await assert.rejects(services.drama.confirmRoleAppearance({ ...input, confirmation: { ...prepared.confirmation, preparationRevision: saved.revision } }), status(409));
});
