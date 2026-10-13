import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
import type { DramaShotVideoDelivery } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.equal(target.search + target.hash, '');
assert.match(decodeURIComponent(target.pathname), /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const suiteDatabase = `workbench_verify_drama_shot_video_${randomBytes(14).toString('hex')}`;
const suiteTarget = new URL(databaseUrl);
suiteTarget.pathname = `/${suiteDatabase}`;
const admin = postgres(databaseUrl, { max: 1 });
const services = createServices(suiteTarget.href);
const sql = postgres(suiteTarget.href, { max: 4 });
let created = false;
const validScript = '## 第1集\n**场景1：咖啡馆 日/内**\n林夏：今天一定要成功。';
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;

before(async () => {
  await admin.unsafe(`create database "${suiteDatabase}"`);
  created = true;
  const migration = spawnSync(process.execPath, [resolve(__dirname, '../scripts/migrate.cjs')], {
    env: { ...process.env, API_NEXT_DATABASE_URL: suiteTarget.href }, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.equal(migration.status, 0, migration.stderr);
});
after(async () => {
  try {
    await services.close(); await sql.end();
    if (created) {
      assert.match(suiteDatabase, /^workbench_verify_drama_shot_video_[a-f0-9]{28}$/);
      await admin.unsafe(`drop database "${suiteDatabase}"`);
    }
  } finally { await admin.end(); }
});

/** Owner fixture with a selected candidate whose image asset is already published. */
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({
    userId, mode: 'script', title: '镜头视频作业', content: validScript, look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  const sha256 = randomBytes(32).toString('hex');
  const material = await services.materials.register({
    userId, objectKey: `materials/${userId}/${sha256}.jpg`, sha256, byteLength: 128, contentType: 'image/jpeg',
    width: 16, height: 16, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  const role = await services.drama.createRole({
    userId, projectId: project.id, name: '林夏', description: '黑发蓝色雨衣，银色伞别针。', referenceMaterialId: material.id,
  });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '雨夜车站', description: '夜，站台，冷色灯光。' });
  const shot = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在雨夜车站。' });
  const candidate = await services.drama.createCandidate({
    userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景，林夏站在雨夜车站。',
  });
  await services.drama.selectCandidate({ userId, candidateId: candidate.id });
  await services.billing.grant({ userId, billingKey: `test-drama-shot-video:${userId}`, amount: 300, remark: 'test' });
  const imageJob = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
  const imageSha = randomBytes(32).toString('hex');
  await services.dramaImageAssets.publish({
    userId, jobId: imageJob.id, objectKey: `drama-image-jobs/${imageJob.id}/${imageSha}.png`,
    sha256: imageSha, byteLength: 2048, width: 768, height: 1024,
  });
  return { userId, shot, candidate };
}

test('shot video creation requires a selected candidate with a published image', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({
    userId, mode: 'script', title: '前置检查', content: validScript, look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
  });
  const sha256 = randomBytes(32).toString('hex');
  const material = await services.materials.register({
    userId, objectKey: `materials/${userId}/${sha256}.jpg`, sha256, byteLength: 128, contentType: 'image/jpeg',
    width: 16, height: 16, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  const role = await services.drama.createRole({
    userId, projectId: project.id, name: '林夏', description: '黑发蓝色雨衣。', referenceMaterialId: material.id,
  });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜。' });
  const shot = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在车站。' });
  const candidate = await services.drama.createCandidate({
    userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。',
  });
  await services.billing.grant({ userId, billingKey: `test-shot-video-precondition:${userId}`, amount: 300, remark: 'test' });
  await assert.rejects(services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() }),
    status(409), 'no selected candidate yet');
  await services.drama.selectCandidate({ userId, candidateId: candidate.id });
  await assert.rejects(services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() }),
    status(409), 'selected candidate has no published image');
  await assert.rejects(services.dramaShotVideos.create({ userId, shotId: randomUUID(), requestKey: randomUUID() }), status(404));
});

test('creation reserves credits once, is idempotent per request key and single-flight per shot', async () => {
  const { userId, shot, candidate } = await fixture();
  assert.equal((await services.drama.selectedCandidateForShot({ userId, shotId: shot.id })).id, candidate.id,
    'the public read-only query must not acquire a write lock');
  const requestKey = randomUUID();
  const job = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey });
  assert.equal(job.status, 'accepted');
  assert.equal(job.shotId, shot.id);
  assert.equal(job.candidateId, candidate.id);
  assert.equal(job.model, 'mini');
  assert.equal(job.reservedCredits, 77);
  // 380 signup+grant minus 110 published image minus 77 held video reservation.
  assert.equal((await services.billing.summary(userId)).balance, 193);
  const replay = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey });
  assert.equal(replay.id, job.id);
  assert.equal((await services.billing.summary(userId)).balance, 193);
  await assert.rejects(services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() }), status(409));
  await assert.rejects(services.dramaShotVideos.create({ userId, shotId: randomUUID(), requestKey }), status(409));
  const [event] = await sql<{ type: string; workflow_id: string }[]>`
    select type, workflow_id from wb_next.drama_shot_video_outbox where job_id = ${job.id}`;
  assert.equal(event.type, 'drama_video.requested');
  assert.equal(event.workflow_id, `drama-video:${job.id}`);
});

test('terminal failure refunds once and frees the shot for a retry job', async () => {
  const { userId, shot } = await fixture();
  const first = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  const failed = await services.dramaShotVideos.fail({ userId, jobId: first.id, failureCode: 'PROVIDER_REJECTED' });
  assert.equal(failed.status, 'failed');
  assert.equal((await services.billing.summary(userId)).balance, 270);
  const refailed = await services.dramaShotVideos.fail({ userId, jobId: first.id, failureCode: 'PROVIDER_REJECTED' });
  assert.equal(refailed.status, 'failed');
  assert.equal((await services.billing.summary(userId)).balance, 270);
  const retry = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  assert.notEqual(retry.id, first.id);
  assert.equal(retry.status, 'accepted');
  await assert.rejects(services.dramaShotVideoAssets.publish({
    userId, jobId: first.id, objectKey: `drama-shot-video-jobs/${first.id}/${'a'.repeat(64)}.mp4`,
    sha256: 'a'.repeat(64), byteLength: 2048, width: 480, height: 854, durationMs: 5000,
  }), status(409), 'failed job cannot publish');
});

test('private shot video publication settles once and remains owner scoped', async () => {
  const { userId, shot } = await fixture();
  const job = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  const sha256 = randomBytes(32).toString('hex');
  const input = {
    userId, jobId: job.id, sha256, objectKey: `drama-shot-video-jobs/${job.id}/${sha256}.mp4`,
    byteLength: 2048, width: 480, height: 854, durationMs: 5000,
  };
  await assert.rejects(services.dramaShotVideoAssets.publish({ ...input, sha256: 'b'.repeat(64), durationMs: 100 }), status(400));
  const assets = await Promise.all(Array.from({ length: 20 }, () => services.dramaShotVideoAssets.publish(input)));
  assert.equal(new Set(assets.map(asset => asset.id)).size, 1);
  const settled = await services.dramaShotVideos.get({ userId, jobId: job.id });
  assert.equal(settled.status, 'succeeded');
  assert.equal(settled.outputRef, `drama-shot-video-asset:${assets[0].id}`);
  assert.equal(settled.actualCredits, 77);
  assert.equal((await services.billing.summary(userId)).entries.filter(entry => entry.type === 'settle' && entry.billingKey === `drama-video:${job.id}`).length, 1);
  await assert.rejects(services.dramaShotVideoAssets.get({ userId: randomUUID(), jobId: job.id }), status(404));
});

test('submission rejection fails the job and refunds exactly once', async () => {
  const { userId, shot } = await fixture();
  const job = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  const claim = await services.dramaShotVideoSubmissions.begin({ userId, jobId: job.id, providerKey: 'mock-shot-video:v1' });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error('expected submission claim');
  const rejected = await services.dramaShotVideoSubmissions.reject({ userId, jobId: job.id, token: claim.token });
  assert.equal(rejected.status, 'rejected');
  assert.equal((await services.dramaShotVideos.get({ userId, jobId: job.id })).status, 'failed');
  assert.equal((await services.billing.summary(userId)).balance, 270);
  const rejectedAgain = await services.dramaShotVideoSubmissions.reject({ userId, jobId: job.id, token: claim.token });
  assert.equal(rejectedAgain.status, 'rejected');
  assert.equal((await services.billing.summary(userId)).balance, 270);
});

async function drainOutbox(): Promise<void> {
  for (;;) {
    const event = await services.dramaShotVideoOutbox.claim();
    if (!event) return;
    await services.dramaShotVideoOutbox.ack(event);
  }
}

test('outbox delivery is leased once and stale acknowledgements fail', async () => {
  await drainOutbox();
  const { userId, shot } = await fixture();
  const job = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
  const events = (await Promise.all(Array.from({ length: 20 }, () => services.dramaShotVideoOutbox.claim())))
    .filter((event): event is DramaShotVideoDelivery => event !== null);
  assert.equal(events.length, 1);
  assert.equal(events[0].workflowId, `drama-video:${job.id}`);
  await sql`update wb_next.drama_shot_video_outbox set lease_until = clock_timestamp() - interval '1 second' where id = ${events[0].id}`;
  await assert.rejects(services.dramaShotVideoOutbox.ack(events[0]), status(409));
  const reclaimed = await services.dramaShotVideoOutbox.claim();
  assert.ok(reclaimed);
  assert.equal(reclaimed.id, events[0].id);
  await services.dramaShotVideoOutbox.ack(reclaimed);
});
