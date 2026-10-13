import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { SaveDramaPreparation } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';
import { createServices, DomainError } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated'); const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); const sql = postgres(databaseUrl, { max: 1 });
after(async () => { await services.close(); await sql.end(); });
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
const body = (draft: DramaPreparationValue) => SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
  roles: draft.roles.map(({ key, name, usage, description, referenceMaterialId }) => ({ key, name, usage, description, referenceMaterialId })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) });
const content = '## 第1集\n**场景1：飞船 日/内**\n（阿橘和小狐并肩望向窗外。\n飞船穿过云海。）\n阿橘：出发。\n小狐：跟上。\n广播声（OS）：前方晴朗。\n**场景2：云海 日/外**\n（云层缓缓散开。）\n## 第2集\n**场景1：飞船 夜/内**\n阿橘：到家了。';
async function fixture(confirm = true) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '自动分镜草稿', content, look: '3D国创', aspectRatio: '9:16', episodeCount: 2 });
  const input = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const draft = body(await services.drama.getPreparation(input));
  for (const role of draft.roles.filter(item => item.usage === 'visual')) {
    const hash = randomBytes(32).toString('hex'); const material = await services.materials.register({ userId, sha256: hash, objectKey: `materials/${userId}/${hash}.png`, contentType: 'image/png', width: 768, height: 1024, byteLength: 100, expiresAt: new Date(Date.now() + 600000).toISOString() });
    role.referenceMaterialId = material.id; role.description = `${role.name}，蓝色围巾`;
  }
  let prepared = await services.drama.savePreparation({ ...input, draft });
  if (confirm) for (const role of prepared.roles.filter(item => item.usage === 'visual')) prepared = await services.drama.confirmRoleAppearance({ ...input, confirmation: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision, roleKey: role.key } });
  return { ...input, prepared, request: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision } };
}
test('storyboard requires confirmed current roles; never silently chooses a role image', async () => {
  const input = await fixture(false);
  await assert.rejects(services.storyboardPlans.create(input), status(409)); assert.equal(await services.storyboardPlans.latest(input), null);
  const ready = await fixture(); await assert.rejects(services.storyboardPlans.create({ ...ready, request: { ...ready.request, preparationRevision: 999 } }), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
test('free concurrent organization preserves source, multiple shots per scene, empty scenes and fixed role versions', async () => {
  const input = await fixture(); const plans = await Promise.all(Array.from({ length: 6 }, () => services.storyboardPlans.create(input)));
  assert.equal(new Set(plans.map(plan => plan.id)).size, 1); const plan = plans[0]; assert.equal(plan.shots.length, 6);
  assert.equal(plan.shots[0].sourceText, '（阿橘和小狐并肩望向窗外。\n飞船穿过云海。）'); assert.equal(plan.shots[0].sourceLine, 3); assert.equal(plan.shots[0].roleKeys.length, 2);
  assert.equal(plan.shots[3].roleKeys.length, 0); assert.equal(plan.shots[4].roleKeys.length, 0); assert.equal(plan.shots[5].episodeNumber, 2); assert.equal(plan.shots[5].shotNumber, 1);
  assert.ok(plan.shots.every(shot => !shot.reviewed));
  assert.deepEqual(plan.roles.filter(role => role.usage === 'visual').map(role => role.roleVersionId), input.prepared.roles.filter(role => role.usage === 'visual').map(role => role.selection!.roleVersionId));
  const role = (await services.drama.getWorkflow(input)).roles[0]; await services.drama.reviseRole({ userId: input.userId, roleId: role.id, description: '旧工作台中的新版本', referenceMaterialId: role.latestVersion.referenceMaterialId });
  assert.equal((await services.storyboardPlans.create(input)).id, plan.id); assert.equal((await services.storyboardPlans.get({ userId: input.userId, planId: plan.id })).current, true);
  const wallet = await services.billing.summary(input.userId); assert.equal(wallet.balance, 80); assert.equal(wallet.entries.length, 1);
  const [row] = await sql`select count(*)::int as n from wb_next.drama_image_jobs where user_id = ${input.userId}`; assert.equal(row.n, 0);
});
test('editing a shot saves only editable content, empty/multiple cast and replay without losing source', async () => {
  const input = await fixture(); const plan = await services.storyboardPlans.create(input); const locator = { userId: input.userId, planId: plan.id };
  const request = { baseRevision: plan.revision, shotKey: plan.shots[0].key, content: '云海空镜，镜头缓缓靠近飞船。', roleKeys: [] as string[], reviewed: true };
  const saved = await services.storyboardPlans.update({ ...locator, request }); assert.equal(saved.revision, 2); assert.equal(saved.shots[0].roleKeys.length, 0); assert.equal(saved.shots[0].sourceText, plan.shots[0].sourceText);
  assert.equal((await services.storyboardPlans.update({ ...locator, request })).revision, 2);
  await assert.rejects(services.storyboardPlans.update({ ...locator, request: { ...request, content: '并发不同修改' } }), status(409));
  await assert.rejects(services.storyboardPlans.update({ ...locator, request: { ...request, baseRevision: 2, roleKeys: ['unknown'] } }), status(400));
  const latest = await services.storyboardPlans.latest(input); assert.equal(latest?.shots[0].content, request.content);
  const other = await fixture(); await assert.rejects(services.storyboardPlans.get({ ...locator, userId: other.userId }), status(404));
});
test('changed preparation requires reconfirmation/new plan, preserves old draft and expired roles cannot be used', async () => {
  const input = await fixture(); const first = await services.storyboardPlans.create(input);
  const draft = body(input.prepared); draft.roles[0].description = '橘猫，改成红围巾';
  const changed = await services.drama.savePreparation({ ...input, draft }); const request = { scriptVersionId: changed.scriptVersionId, preparationRevision: changed.revision };
  assert.equal((await services.storyboardPlans.get({ userId: input.userId, planId: first.id })).current, false);
  await assert.rejects(services.storyboardPlans.create({ ...input, request }), status(409));
  await services.drama.confirmRoleAppearance({ ...input, confirmation: { ...request, roleKey: changed.roles[0].key } });
  const next = await services.storyboardPlans.create({ ...input, request }); assert.notEqual(next.id, first.id); assert.notEqual(next.roles[0].roleVersionId, first.roles[0].roleVersionId);
  assert.equal((await services.storyboardPlans.get({ userId: input.userId, planId: first.id })).roles[0].roleVersionId, first.roles[0].roleVersionId);
  await sql`update wb_next.user_materials set status = 'expired' where id = ${next.roles[0].referenceMaterialId!}`;
  await assert.rejects(services.storyboardPlans.create({ ...input, request }), status(409));
  assert.equal((await services.storyboardPlans.get({ userId: input.userId, planId: next.id })).current, false);
  await assert.rejects(services.storyboardPlans.update({ userId: input.userId, planId: next.id, request: { baseRevision: 1, shotKey: next.shots[0].key, content: '旧图不能继续用', roleKeys: [], reviewed: true } }), status(409));
});
test('voice-only or empty-cast stories organize without inventing visual characters', async () => {
  const input = await fixture(false); const draft = body(input.prepared); draft.roles = draft.roles.map(role => ({ ...role, usage: 'voice_only', referenceMaterialId: null }));
  const prepared = await services.drama.savePreparation({ ...input, draft });
  const plan = await services.storyboardPlans.create({ ...input, request: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision } });
  assert.ok(plan.roles.every(role => role.roleVersionId === null)); assert.ok(plan.shots.every(shot => shot.roleKeys.length === 0));
});
