import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DRAMA_IMAGE_PRICING, DRAMA_SHOT_VIDEO_PRICING, SIGNUP_GRANT_CREDITS } from '@wb/contracts';
import { createServices } from '@wb/server';
import { isObjectStoreKey } from '@wb/media';
import { createShotVideoFailActivity, createShotVideoPublishingActivity, createShotVideoSubmissionActivity, MOCK_MP4 } from './shot-video';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
after(() => services.close());

const validScript = '## 第1集\n**场景1：雨夜车站 夜/外**\n林夏：出发。';

/** Owner fixture with a selected candidate whose image asset is already published, then a shot video job. */
async function shotVideoJob() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({
    userId, mode: 'script', title: '镜头视频', content: validScript, look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  const sha256 = randomBytes(32).toString('hex');
  const material = await services.materials.register({
    userId, objectKey: `materials/${userId}/${sha256}.jpg`, sha256, byteLength: 128, contentType: 'image/jpeg',
    width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const role = await services.drama.createRole({ userId, projectId: project.id, name: '林夏', description: '黑发蓝色雨衣。', referenceMaterialId: material.id });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜站台。' });
  const shot = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
  const candidate = await services.drama.createCandidate({
    userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。',
  });
  await services.drama.selectCandidate({ userId, candidateId: candidate.id });
  await services.billing.grant({ userId, billingKey: `test-shot-video:${userId}`, amount: 300 });
  const imageJob = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
  const imageSha = randomBytes(32).toString('hex');
  await services.dramaImageAssets.publish({
    userId, jobId: imageJob.id, objectKey: `drama-image-jobs/${imageJob.id}/${imageSha}.png`, sha256: imageSha, byteLength: 2048, width: 768, height: 1024,
  });
  const job = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  return { userId, jobId: job.id };
}

test('shot video mock writes one private MP4 and settles once', async () => {
  const input = await shotVideoJob();
  const written: { key?: string; bytes?: Buffer; hash?: string } = {};
  const objectStore = {
    put: async (key: string, bytes: Buffer, sha256: string) => {
      assert.equal(isObjectStoreKey(key), true, `unregistered object key prefix: ${key}`);
      written.key = key; written.bytes = bytes; written.hash = sha256;
      assert.equal(sha256, createHash('sha256').update(MOCK_MP4).digest('hex'));
    },
  } as never;
  const submit = createShotVideoSubmissionActivity({ services });
  await Promise.all(Array.from({ length: 20 }, () => submit(input)));
  assert.equal((await services.dramaShotVideoSubmissions.get(input))?.status, 'submitted');
  const publish = createShotVideoPublishingActivity({ services, objectStore });
  assert.equal((await publish(input)).status, 'published');
  assert.equal((await publish(input)).status, 'terminal');
  assert.match(written.key ?? '', new RegExp(`^drama-shot-video-jobs/${input.jobId}/[a-f0-9]{64}\\.mp4$`));
  assert.equal(written.bytes?.length, MOCK_MP4.length);
  assert.equal(written.bytes?.toString('base64'), MOCK_MP4.toString('base64'));
  const job = await services.dramaShotVideos.get(input);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.actualCredits, DRAMA_SHOT_VIDEO_PRICING.credits);
  assert.match(job.outputRef ?? '', new RegExp(`^drama-shot-video-asset:[a-f0-9-]{36}$`));
  assert.equal((await services.billing.summary(input.userId)).entries
    .filter(entry => entry.type === 'settle' && entry.billingKey === `drama-video:${input.jobId}`).length, 1);
});

test('shot video publish without an object store fails the job and refunds exactly once', async () => {
  const input = await shotVideoJob();
  await createShotVideoSubmissionActivity({ services })(input);
  assert.equal((await services.billing.summary(input.userId)).balance,
    SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits - DRAMA_SHOT_VIDEO_PRICING.credits);
  await assert.rejects(createShotVideoPublishingActivity({ services })(input), /Object store unavailable/);
  const fail = createShotVideoFailActivity({ services });
  await fail(input);
  const job = await services.dramaShotVideos.get(input);
  assert.equal(job.status, 'failed');
  assert.equal(job.failureCode, 'SHOT_VIDEO_PUBLISH_FAILED');
  const wallet = await services.billing.summary(input.userId);
  assert.equal(wallet.balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits);
  assert.equal(wallet.entries.filter(entry => entry.type === 'refund' && entry.billingKey === `drama-video:${input.jobId}`).length, 1);
  await fail(input);
  assert.equal((await services.billing.summary(input.userId)).entries
    .filter(entry => entry.type === 'refund' && entry.billingKey === `drama-video:${input.jobId}`).length, 1);
});

test('shot video failure activity never touches a settled job', async () => {
  const input = await shotVideoJob();
  const objectStore = { put: async () => {} } as never;
  await createShotVideoSubmissionActivity({ services })(input);
  assert.equal((await createShotVideoPublishingActivity({ services, objectStore })(input)).status, 'published');
  await createShotVideoFailActivity({ services })(input);
  assert.equal((await services.dramaShotVideos.get(input)).status, 'succeeded');
  assert.equal((await services.billing.summary(input.userId)).entries
    .filter(entry => entry.type === 'refund' && entry.billingKey === `drama-video:${input.jobId}`).length, 0);
});

test('shot video publish before submission awaits receipt and never fails the job', async () => {
  const input = await shotVideoJob();
  const objectStore = { put: async () => {} } as never;
  const publish = createShotVideoPublishingActivity({ services, objectStore });
  assert.equal((await publish(input)).status, 'awaiting_receipt');
  assert.equal((await services.dramaShotVideos.get(input)).status, 'accepted');
  assert.equal((await services.billing.summary(input.userId)).entries
    .filter(entry => entry.type === 'refund' && entry.billingKey === `drama-video:${input.jobId}`).length, 0);
});
