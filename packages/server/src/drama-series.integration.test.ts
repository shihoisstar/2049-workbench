import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { dramaEpisodeCoverage, ErrorCode, SaveDramaPreparation } from '@wb/contracts';
import { createServices, DomainError, parseDramaScript } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
after(() => services.close());
const content = (numbers: number[]) => numbers.map(number => `## 第${number}集\n**场景1：飞船 日/内**\n橘猫：第${number}站，出发。`).join('\n\n');
const incomplete = (error: unknown) => error instanceof DomainError && error.code === ErrorCode.SCRIPT_EPISODES_INCOMPLETE;

test('five-episode idea draft cannot confirm one episode; a complete repaired version confirms once', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'idea', title: '五站旅程', content: '橘猫驾驶飞船，依次探索五个星球。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
  const input = { userId, projectId: project.id };
  const job = await services.dramaScripts.create({ ...input, requestKey: randomUUID() });
  const result = await services.dramaScripts.complete({ userId, jobId: job.id, content: content([1]) });
  await assert.rejects(services.dramaScripts.confirm({ ...input, versionId: result.draftVersion!.id }), incomplete);
  assert.equal((await services.drama.getProject(input)).confirmedVersionId, null);
  const repaired = await services.drama.repairScript({ userId, scriptId: result.draftScriptId!, content: content([1, 2, 3, 4, 5]) });
  assert.equal((await services.dramaScripts.confirm({ ...input, versionId: repaired.id })).confirmedVersionId, repaired.id);
  assert.equal((await services.dramaScripts.confirm({ ...input, versionId: repaired.id })).confirmedVersionId, repaired.id);
  assert.equal((await services.billing.summary(userId)).balance, 80);
});

test('five imported episodes require exact numbering and repair the same project without changing a confirmed version', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '导入五集', content: content([1, 2, 3, 4, 6]), look: '3D国创', aspectRatio: '9:16', episodeCount: 5 });
  const input = { userId, projectId: project.id };
  await assert.rejects(services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! }), incomplete);
  const repaired = await services.drama.repairScript({ userId, scriptId: project.scriptId!, content: content([1, 2, 3, 4, 5]) });
  const confirmed = await services.dramaScripts.confirm({ ...input, versionId: repaired.id });
  assert.equal(confirmed.activeVersionId, repaired.id);
  const newer = await services.drama.repairScript({ userId, scriptId: project.scriptId!, content: content([1, 2, 3, 4, 5]) + '\n橘猫：再出发。' });
  await assert.rejects(services.dramaScripts.confirm({ ...input, versionId: newer.id }), error => error instanceof DomainError && error.statusCode === 409);
  assert.equal((await services.drama.getProject(input)).confirmedVersionId, repaired.id);
});

test('five episodes share one confirmed role and retain every episode in a free recoverable storyboard', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '五集分镜', content: content([1, 2, 3, 4, 5]), look: '3D国创', aspectRatio: '9:16', episodeCount: 5 });
  const input = { userId, projectId: project.id };
  await services.dramaScripts.confirm({ ...input, versionId: project.activeVersionId! });
  const draft = await services.drama.getPreparation(input);
  assert.equal(draft.roles.length, 1); assert.equal(draft.scenes.length, 5);
  const sha256 = randomBytes(32).toString('hex');
  const material = await services.materials.register({ userId, sha256, objectKey: `materials/${userId}/${sha256}.png`, contentType: 'image/png', width: 768, height: 1024, byteLength: 100, expiresAt: new Date(Date.now() + 600000).toISOString() });
  const saved = await services.drama.savePreparation({ ...input, draft: SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
    roles: draft.roles.map(role => ({ key: role.key, name: role.name, usage: role.usage, description: '橘猫，蓝色围巾', referenceMaterialId: material.id })), scenes: draft.scenes.map(scene => ({ key: scene.key, description: '' })) }) });
  const ready = await services.drama.confirmRoleAppearance({ ...input, confirmation: { scriptVersionId: saved.scriptVersionId, preparationRevision: saved.revision, roleKey: saved.roles[0].key } });
  const plan = await services.storyboardPlans.create({ ...input, request: { scriptVersionId: ready.scriptVersionId, preparationRevision: ready.revision } });
  assert.deepEqual([...new Set(plan.shots.map(shot => shot.episodeNumber))], [1, 2, 3, 4, 5]);
  assert.equal(plan.roles.length, 1); assert.equal(plan.roles[0].roleVersionId, ready.roles[0].selection!.roleVersionId);
  assert.ok(plan.shots.every(shot => shot.roleKeys.includes(ready.roles[0].key)));
  const restarted = createServices(databaseUrl);
  try { assert.deepEqual(await restarted.storyboardPlans.latest(input), plan); } finally { await restarted.close(); }
  assert.equal((await services.billing.summary(userId)).balance, 80);
});

test('episode coverage rejects missing, unexpected and unparseable episodes', () => {
  assert.deepEqual(dramaEpisodeCoverage(parseDramaScript(content([1, 2, 3, 4, 6])), 5).missing, [5]);
  assert.deepEqual(dramaEpisodeCoverage(parseDramaScript(content([1, 2, 3, 4, 6])), 5).unexpected, [6]);
  assert.equal(dramaEpisodeCoverage(parseDramaScript(content([1, 2, 3, 4, 5])), 5).complete, true);
  assert.equal(dramaEpisodeCoverage(parseDramaScript(content([1, 2, 3, 4, 5]) + '\n**场景2：**'), 5).complete, false);
});
