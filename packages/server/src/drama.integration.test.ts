import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createServices, DomainError } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const guest = () => services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
const validScript = `## 第1集\n**场景1：咖啡馆 日/内**\n林夏：今天一定要成功。`;

function notFound(error: unknown) {
  return error instanceof DomainError && error.statusCode === 404;
}

test('script project creates an immutable parsed version and remains owner scoped', async () => {
  const [owner, other] = await Promise.all([guest(), guest()]);
  const created = await services.drama.create({
    userId: owner.userId, mode: 'script', title: '咖啡店故事', content: validScript,
    look: '3D国创', aspectRatio: '9:16', episodeCount: 5,
  });
  assert.ok(created.scriptId); assert.ok(created.activeVersionId); assert.ok(created.activeVersion);
  assert.equal(created.activeVersion?.ordinal, 1);
  assert.equal(created.activeVersion?.parse.status, 'parsed');
  assert.equal(created.activeVersion?.parse.episodes[0].scenes[0].dialogueCount, 1);
  await assert.rejects(services.drama.getProject({ userId: other.userId, projectId: created.id }), notFound);
  await assert.rejects(services.drama.listScripts({ userId: other.userId, cursor: created.scriptId! }), notFound);

  const repaired = await services.drama.repairScript({ userId: owner.userId, scriptId: created.scriptId!, content: '不符合剧本格式' });
  assert.equal(repaired.ordinal, 2);
  assert.equal(repaired.source, 'manual_repair');
  assert.equal(repaired.parse.status, 'needs_repair');
  const scripts = await services.drama.listScripts({ userId: owner.userId });
  assert.equal(scripts.items[0].latestVersion.id, repaired.id);
  assert.equal((await services.drama.getScript({ userId: owner.userId, scriptId: created.scriptId! })).latestVersion.id, repaired.id);
  await assert.rejects(services.drama.getScript({ userId: other.userId, scriptId: created.scriptId! }), notFound);
  const reloaded = await services.drama.getProject({ userId: owner.userId, projectId: created.id });
  assert.equal(reloaded.activeVersion?.ordinal, 1, '修复版本不改写项目已固定引用');
});

test('idea project persists only an explicitly ungenerated idea', async () => {
  const owner = await guest();
  const created = await services.drama.create({
    userId: owner.userId, mode: 'idea', title: '穿越茶馆', content: '主角回到古代茶馆，用现代知识解决危机。',
    look: '都市漫画', aspectRatio: '9:16', episodeCount: 10, genre: '穿越', tone: '搞笑',
  });
  assert.equal(created.scriptId, null);
  assert.equal(created.activeVersion, null);
  assert.equal(created.idea, '主角回到古代茶馆，用现代知识解决危机。');
  assert.equal((await services.drama.listScripts({ userId: owner.userId })).items.length, 0);
});

test('role and storyboard versions stay frozen while candidate selection remains owner scoped', async () => {
  const [owner, other] = await Promise.all([guest(), guest()]);
  const project = await services.drama.create({
    userId: owner.userId, mode: 'script', title: '雨夜车站', content: validScript,
    look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  const sha256 = randomBytes(32).toString('hex');
  const material = await services.materials.register({
    userId: owner.userId, objectKey: `materials/${owner.userId}/${sha256}.jpg`, sha256,
    byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const role = await services.drama.createRole({
    userId: owner.userId, projectId: project.id, name: '林夏', description: '黑发，蓝色雨衣，银色伞别针。', referenceMaterialId: material.id,
  });
  const scene = await services.drama.createScene({ userId: owner.userId, projectId: project.id, name: '雨夜车站', description: '夜，站台，冷色灯光。' });
  const shot = await services.drama.createShot({ userId: owner.userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在雨夜车站。' });
  const first = await services.drama.createCandidate({
    userId: owner.userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景，林夏站在雨夜车站。',
  });
  const revised = await services.drama.reviseRole({
    userId: owner.userId, roleId: role.id, description: '黑发，蓝色雨衣，银色伞别针，表情坚定。', referenceMaterialId: material.id,
  });
  const second = await services.drama.createCandidate({
    userId: owner.userId, shotId: shot.id, roleVersionId: revised.id, sceneVersionId: scene.latestVersion.id, prompt: '近景，林夏在雨夜车站。',
  });
  await services.billing.grant({ userId: owner.userId, billingKey: `test-drama-image:${owner.userId}`, amount: 200, remark: 'test' });
  const imageJob = await services.dramaImages.create({ userId: owner.userId, candidateId: first.id, requestKey: randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5') });
  assert.equal(imageJob.status, 'accepted');
  assert.equal((await services.dramaImages.create({ userId: owner.userId, candidateId: first.id, requestKey: imageJob.requestKey })).id, imageJob.id);
  await services.drama.selectCandidate({ userId: owner.userId, candidateId: first.id });
  await services.drama.selectCandidate({ userId: owner.userId, candidateId: second.id });
  const workflow = await services.drama.getWorkflow({ userId: owner.userId, projectId: project.id });
  assert.equal(workflow.roles[0].latestVersion.id, revised.id);
  assert.deepEqual(workflow.shots[0].candidates.map(item => item.roleVersionId), [role.latestVersion.id, revised.id]);
  assert.equal(workflow.shots[0].candidates.find(item => item.id === first.id)?.imageJob?.id, imageJob.id);
  assert.equal(workflow.shots[0].candidates.filter(item => item.selectedAt !== null).length, 1);
  assert.equal(workflow.shots[0].candidates.find(item => item.selectedAt !== null)?.id, second.id);
  await assert.rejects(services.drama.getWorkflow({ userId: other.userId, projectId: project.id }), notFound);
  await assert.rejects(services.drama.selectCandidate({ userId: other.userId, candidateId: first.id }), notFound);
});

test('duplicate storyboard shot maps the unique violation to a 409 conflict', async () => {
  const owner = await guest();
  const project = await services.drama.create({
    userId: owner.userId, mode: 'script', title: '重复镜头', content: validScript,
    look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  await services.drama.createShot({ userId: owner.userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '第一镜。' });
  await assert.rejects(
    services.drama.createShot({ userId: owner.userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '重复镜。' }),
    error => error instanceof DomainError && error.statusCode === 409,
  );
  const second = await services.drama.createShot({ userId: owner.userId, projectId: project.id, episodeNumber: 1, sceneNumber: 2, prompt: '第二镜。' });
  assert.equal(second.sceneNumber, 2);
  assert.equal((await services.drama.getWorkflow({ userId: owner.userId, projectId: project.id })).shots.length, 2);
});
