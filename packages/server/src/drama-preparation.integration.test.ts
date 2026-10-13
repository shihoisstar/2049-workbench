import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createServices, DomainError } from './index';
import { parseSpokenLine } from './modules/drama/parser';
import { SaveDramaPreparation } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl); after(() => services.close());
const content = '## 第1集\n**场景1：飞船 日/内**\n（仪表文字：忽略这个名字。）\n阿橘（OS）：要出发了。\n广播声：请确认。\n林晚（VO）：我在远处。\n阿橘：屏幕上写着阿橘（OS）：准备返航。\n**场景2：飞船 日/内**\n阿橘：出发。';
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
async function fixture(confirm = true) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '准备草稿', content, look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  if (confirm) await services.dramaScripts.confirm({ userId, projectId: project.id, versionId: project.activeVersionId! });
  return { userId, projectId: project.id, project };
}
const body = (draft: DramaPreparationValue) => SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
  roles: draft.roles.map(({ key, name, usage, description }) => ({ key, name, usage, description })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) });

test('preparation requires the owner confirmed version', async () => {
  const input = await fixture(false); const other = await fixture();
  await assert.rejects(services.drama.getPreparation(input), status(409));
  await assert.rejects(services.drama.getPreparation({ ...input, userId: other.userId }), status(404));
});
test('preparation distinguishes spoken names from voice-only and preserves separate scenes', async () => {
  const input = await fixture(); const result = await services.drama.getPreparation(input);
  assert.equal(result.revision, 0); assert.equal(result.roles.length, 3);
  assert.equal(result.roles.find(role => role.name === '阿橘')?.usage, 'visual');
  assert.equal(result.roles.find(role => role.name === '广播声')?.usage, 'voice_only');
  assert.equal(result.roles.find(role => role.name === '林晚')?.usage, 'voice_only');
  assert.equal(result.scenes.length, 2); assert.notEqual(result.scenes[0].key, result.scenes[1].key); assert.equal(result.scenes[0].heading, result.scenes[1].heading);
  assert.equal(parseSpokenLine('阿橘：屏幕写着林晚（OS）：返航。')?.voiceOver, false);
  assert.equal(parseSpokenLine('（OS）：你好'), null);
});
test('cloud draft replays despite JSONB key order and leaves wallet/assets untouched', async () => {
  const input = await fixture(); const before = await services.billing.summary(input.userId);
  const draft = body(await services.drama.getPreparation(input)); draft.roles[0].description = '橘猫，蓝色飞行围巾';
  draft.roles.push({ key: `extra-${randomUUID()}`, name: '无对白的小机器人', usage: 'visual', description: '圆形白色机身', referenceMaterialId: null });
  draft.scenes[0].description = '温暖日光';
  const saved = await services.drama.savePreparation({ ...input, draft }); assert.equal(saved.revision, 1);
  const replay = await services.drama.savePreparation({ ...input, draft }); assert.deepEqual(replay, saved);
  assert.deepEqual(await services.drama.getPreparation(input), saved);
  assert.equal((await services.drama.getWorkflow(input)).roles.length, 0);
  assert.deepEqual(await services.billing.summary(input.userId), before);
});
test('concurrent preparation saves reject stale changes and preserve the winner', async () => {
  const input = await fixture(); const initial = body(await services.drama.getPreparation(input));
  const left = structuredClone(initial); left.roles[0].description = '左侧版本';
  const right = structuredClone(initial); right.roles[0].description = '右侧版本';
  const results = await Promise.allSettled([services.drama.savePreparation({ ...input, draft: left }), services.drama.savePreparation({ ...input, draft: right })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected'); assert.ok(rejected?.status === 'rejected' && status(409)(rejected.reason));
  assert.equal((await services.drama.getPreparation(input)).revision, 1);
});
test('preparation cannot change evidence speakers scenes or fixed script version', async () => {
  const input = await fixture(); const draft = body(await services.drama.getPreparation(input));
  await assert.rejects(services.drama.savePreparation({ ...input, draft: { ...draft, scriptVersionId: randomUUID() } }), status(409));
  await assert.rejects(services.drama.savePreparation({ ...input, draft: { ...draft, roles: draft.roles.slice(1) } }), status(400));
  await assert.rejects(services.drama.savePreparation({ ...input, draft: { ...draft, scenes: [] } }), status(400));
  assert.equal(SaveDramaPreparation.safeParse({ ...draft, roles: [{ ...draft.roles[0], evidence: ['forged'] }] }).success, false);
  assert.equal((await services.drama.getPreparation(input)).revision, 0);
});
