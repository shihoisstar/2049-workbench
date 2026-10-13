import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServices } from '@wb/server';
import { createComposeDramaExportActivity } from './activity';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
after(() => services.close());

const fontFile = process.env.MEDIA_FONT_FILE ?? (process.platform === 'win32'
  ? 'C:/Windows/Fonts/msyh.ttc'
  : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');
const fontSkip = existsSync(fontFile) ? undefined : `No readable media font at ${fontFile}`;
const script = '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。';

/** Keep the export input byte-for-byte aligned with the mock shot-video publisher. */
function knownMockMp4(): Buffer {
  const workerSource = readFileSync(resolve(__dirname, '../../worker/src/shot-video.ts'), 'utf8');
  const definition = workerSource.match(/export const MOCK_MP4 = Buffer\.from\(([\s\S]*?),\s*'base64',\s*\);/);
  assert.ok(definition, 'mock shot video fixture must be available');
  const encoded = [...definition[1].matchAll(/'([A-Za-z0-9+/=]+)'/g)].map(match => match[1]).join('');
  assert.ok(encoded.length > 0, 'mock shot video fixture must contain bytes');
  return Buffer.from(encoded, 'base64');
}

class FakeObjectStore {
  readonly objects = new Map<string, Buffer>();
  readonly putKeys: string[] = [];
  readonly removedKeys: string[] = [];
  corruptReads = false;

  async read(objectKey: string): Promise<Buffer> {
    const bytes = this.objects.get(objectKey);
    if (!bytes) throw new Error(`Missing object ${objectKey}`);
    return this.corruptReads ? Buffer.concat([bytes, Buffer.from([0])]) : Buffer.from(bytes);
  }

  async put(objectKey: string, bytes: Buffer, sha256: string): Promise<void> {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
    this.putKeys.push(objectKey);
    this.objects.set(objectKey, Buffer.from(bytes));
  }

  async remove(objectKey: string): Promise<void> {
    this.removedKeys.push(objectKey);
    this.objects.delete(objectKey);
  }
}

async function exportFixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({
    userId, mode: 'script', title: '导出活动', content: script, look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  const materialHash = randomBytes(32).toString('hex');
  const material = await services.materials.register({
    userId, objectKey: `materials/${userId}/${materialHash}.jpg`, sha256: materialHash, byteLength: 128, contentType: 'image/jpeg',
    width: 16, height: 16, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  const role = await services.drama.createRole({
    userId, projectId: project.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: material.id,
  });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜站台。' });
  const shot = await services.drama.createShot({
    userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。',
  });
  const candidate = await services.drama.createCandidate({
    userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。',
  });
  await services.drama.selectCandidate({ userId, candidateId: candidate.id });
  await services.billing.grant({ userId, billingKey: `media-export:${userId}`, amount: 300 });
  const image = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
  const imageHash = randomBytes(32).toString('hex');
  await services.dramaImageAssets.publish({
    userId, jobId: image.id, objectKey: `drama-image-jobs/${image.id}/${imageHash}.png`, sha256: imageHash,
    byteLength: 2048, width: 768, height: 1024,
  });
  const video = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  const bytes = knownMockMp4();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sourceKey = `drama-shot-video-jobs/${video.id}/${sha256}.mp4`;
  const sourceAsset = await services.dramaShotVideoAssets.publish({
    userId, jobId: video.id, objectKey: sourceKey, sha256, byteLength: bytes.length, width: 240, height: 426, durationMs: 5000,
  });
  const created = await services.dramaExports.create({ userId, projectId: project.id, episodeNumber: 1, requestKey: randomUUID() });
  return { userId, jobId: created.job.id, sourceKey, sourceAsset, bytes };
}

test('export compose activity publishes once and replay stays terminal', { skip: fontSkip }, async () => {
  const input = await exportFixture();
  const store = new FakeObjectStore();
  store.objects.set(input.sourceKey, input.bytes);
  const compose = createComposeDramaExportActivity(services, store as never, fontFile);

  const published = await compose({ userId: input.userId, jobId: input.jobId });
  assert.equal(published.status, 'published');
  assert.ok(published.assetId);
  assert.equal((await services.dramaExports.get({ userId: input.userId, jobId: input.jobId })).status, 'succeeded');
  const asset = await services.dramaExportAssets.get({ userId: input.userId, jobId: input.jobId });
  assert.equal(asset.id, published.assetId);
  assert.match(asset.objectKey, new RegExp(`^drama-export-jobs/${input.jobId}/[a-f0-9]{64}\\.mp4$`));
  assert.equal(store.putKeys.length, 1);

  const replay = await compose({ userId: input.userId, jobId: input.jobId });
  assert.deepEqual(replay, { jobId: input.jobId, status: 'terminal' });
  assert.equal(store.putKeys.length, 1, 'terminal replay must not write another final asset');
  assert.equal(store.objects.size, 2, 'terminal replay must not create another final asset');
});

test('export compose hash mismatch fails only the export and preserves source video', { skip: fontSkip }, async () => {
  const input = await exportFixture();
  const store = new FakeObjectStore();
  store.objects.set(input.sourceKey, input.bytes);
  store.corruptReads = true;
  const compose = createComposeDramaExportActivity(services, store as never, fontFile);

  const result = await compose({ userId: input.userId, jobId: input.jobId });
  assert.deepEqual(result, { jobId: input.jobId, status: 'terminal' });
  const failed = await services.dramaExports.get({ userId: input.userId, jobId: input.jobId });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureCode, 'EXPORT_COMPOSITION_FAILED');
  assert.deepEqual(await services.dramaShotVideoAssets.get({ userId: input.userId, jobId: input.sourceAsset.jobId }), input.sourceAsset);
  assert.deepEqual(store.objects.get(input.sourceKey), input.bytes);
  assert.deepEqual(store.removedKeys, []);
  assert.equal(store.putKeys.length, 0);
});
test('confirmed plan produces five distinct private episode files and preserves each export on replay', { skip: fontSkip }, async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const content = Array.from({ length: 5 }, (_, n) => `## 第${n + 1}集\n**场景1：云海 日/外**\n（云层散开。）`).join('\n\n');
  const project = await services.drama.create({ userId, mode: 'script', title: '五集模拟文件', content, look: '3D国创', aspectRatio: '9:16', episodeCount: 5 });
  const projectInput = { userId, projectId: project.id }; await services.dramaScripts.confirm({ ...projectInput, versionId: project.activeVersionId! });
  const initial = await services.drama.getPreparation(projectInput);
  const prepared = await services.drama.savePreparation({ ...projectInput, draft: { scriptVersionId: initial.scriptVersionId, baseRevision: 0, roles: [], scenes: initial.scenes.map(({ key, description }) => ({ key, description })) } });
  let plan = await services.storyboardPlans.create({ ...projectInput, request: { scriptVersionId: prepared.scriptVersionId, preparationRevision: prepared.revision } });
  for (const shot of plan.shots) plan = await services.storyboardPlans.update({ userId, planId: plan.id, request: { baseRevision: plan.revision, shotKey: shot.key, content: shot.content, roleKeys: [], reviewed: true } });
  const store = new FakeObjectStore(); const bytes = knownMockMp4(); const hash = createHash('sha256').update(bytes).digest('hex');
  for (const shot of plan.shots) {
    const base = { userId, planId: plan.id, mockAvailable: true }; const request = { shotKey: shot.key, planRevision: plan.revision };
    const imageQuote = await services.planImages.quote({ ...base, request }); const image = await services.planImages.create({ ...base, request: { ...request, quoteVersion: imageQuote.version!, requestKey: randomUUID() } });
    const imageLocator = { userId, jobId: image.jobId }; const imageClaim = await services.dramaImageSubmissions.begin({ ...imageLocator, providerKey: 'mock-candidate-image:v1' }); assert.ok(imageClaim.claimed);
    await services.dramaImageSubmissions.accepted({ ...imageLocator, token: imageClaim.token, providerTaskId: `mock-image:${image.jobId}` }); const imageHash = randomBytes(32).toString('hex');
    await services.dramaImageAssets.publish({ ...imageLocator, objectKey: `drama-image-jobs/${image.jobId}/${imageHash}.png`, sha256: imageHash, byteLength: 100, width: 16, height: 16 });
    await services.planImages.select({ userId, candidateId: image.candidateId, planRevision: plan.revision });
    const videoBase = { userId, candidateId: image.candidateId, planRevision: plan.revision, mockAvailable: true }; const videoQuote = await services.dramaShotVideos.quotePlan(videoBase);
    const video = await services.dramaShotVideos.createPlan({ ...videoBase, quoteVersion: videoQuote.version!, requestKey: randomUUID() }); const locator = { userId, jobId: video.id };
    const claim = await services.dramaShotVideoSubmissions.begin({ ...locator, providerKey: 'mock-shot-video:v1' }); assert.ok(claim.claimed);
    await services.dramaShotVideoSubmissions.accepted({ ...locator, token: claim.token, providerTaskId: `mock-video:${video.id}` }); const objectKey = `drama-shot-video-jobs/${video.id}/${hash}.mp4`;
    await services.dramaShotVideoAssets.publish({ ...locator, objectKey, sha256: hash, byteLength: bytes.length, width: 240, height: 426, durationMs: 5000 }); store.objects.set(objectKey, bytes);
  }
  const compose = createComposeDramaExportActivity(services, store as never, fontFile); const keys = [];
  for (let episodeNumber = 1; episodeNumber <= 5; episodeNumber++) {
    const created = await services.dramaExports.create({ ...projectInput, planId: plan.id, planRevision: plan.revision, episodeNumber, requestKey: randomUUID() }); const locator = { userId, jobId: created.job.id };
    assert.equal((await compose(locator)).status, 'published'); const asset = await services.dramaExportAssets.get(locator);
    assert.ok(store.objects.get(asset.objectKey)?.length); assert.equal(asset.durationMs, 5000); keys.push(asset.objectKey);
    assert.equal((await compose(locator)).status, 'terminal'); assert.equal((await services.dramaExportAssets.get(locator)).id, asset.id);
  }
  assert.equal(new Set(keys).size, 5); assert.equal(store.putKeys.length, 5); assert.equal((await services.dramaExports.listForPlan({ userId, planId: plan.id })).length, 5);
  assert.equal((await services.billing.summary(userId)).balance, 10);
});
