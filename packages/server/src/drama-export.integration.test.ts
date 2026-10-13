import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
import type { DramaExportDelivery } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.equal(target.search + target.hash, '');
assert.match(decodeURIComponent(target.pathname), /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const suiteDatabase = `workbench_verify_drama_export_${randomBytes(14).toString('hex')}`;
const suiteTarget = new URL(databaseUrl);
suiteTarget.pathname = `/${suiteDatabase}`;
const admin = postgres(databaseUrl, { max: 1 });
const services = createServices(suiteTarget.href);
const sql = postgres(suiteTarget.href, { max: 4 });
let created = false;
const script = '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。\n**场景2：街道 夜/外**\n林夏：继续前进。';
const isStatus = (statusCode: number) => (error: unknown) => error instanceof DomainError && error.statusCode === statusCode;

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
      assert.match(suiteDatabase, /^workbench_verify_drama_export_[a-f0-9]{28}$/);
      await admin.unsafe(`drop database "${suiteDatabase}"`);
    }
  } finally { await admin.end(); }
});

async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '导出快照', content: script, look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const hash = randomBytes(32).toString('hex');
  const material = await services.materials.register({ userId, objectKey: `materials/${userId}/${hash}.jpg`, sha256: hash, byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString() });
  const role = await services.drama.createRole({ userId, projectId: project.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: material.id });
  const scene = await services.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜站台。' });
  const shotOne = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
  const shotTwo = await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 2, prompt: '林夏走上街道。' });
  for (const shot of [shotOne, shotTwo]) {
    const candidate = await services.drama.createCandidate({ userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: `镜头 ${shot.id}` });
    await services.drama.selectCandidate({ userId, candidateId: candidate.id });
    await services.billing.grant({ userId, billingKey: `export:${userId}:${shot.id}`, amount: 300 });
    const image = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
    const imageHash = randomBytes(32).toString('hex');
    await services.dramaImageAssets.publish({ userId, jobId: image.id, objectKey: `drama-image-jobs/${image.id}/${imageHash}.png`, sha256: imageHash, byteLength: 2048, width: 768, height: 1024 });
    const video = await services.dramaShotVideos.create({ userId, shotId: shot.id, requestKey: randomUUID() });
    const videoHash = randomBytes(32).toString('hex');
    await services.dramaShotVideoAssets.publish({ userId, jobId: video.id, objectKey: `drama-shot-video-jobs/${video.id}/${videoHash}.mp4`, sha256: videoHash, byteLength: 4096, width: 240, height: 426, durationMs: 5000 });
  }
  return { userId, projectId: project.id };
}

test('export freezes ordered selected shot videos in a stable hash manifest', async () => {
  const input = await fixture();
  const result = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey: randomUUID() });
  assert.equal(result.job.status, 'accepted');
  assert.equal(result.version.ordinal, 1);
  assert.equal(result.version.manifest.formatVersion, 1);
  assert.equal(result.version.manifest.projectId, input.projectId);
  assert.equal(result.version.manifest.shots.length, 2);
  assert.deepEqual(result.version.manifest.shots.map(shot => shot.sceneNumber), [1, 2]);
  assert.match(result.version.manifestSha256, /^[a-f0-9]{64}$/);
  for (const shot of result.version.manifest.shots) {
    assert.match(shot.objectKey, new RegExp(`^drama-shot-video-jobs/${shot.videoJobId}/[a-f0-9]{64}\\.mp4$`));
    assert.match(shot.sha256, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(await services.dramaExports.getVersion({ userId: input.userId, jobId: result.job.id }), result.version);
});

async function drainOutbox(): Promise<void> {
  for (;;) {
    const event = await services.dramaExportOutbox.claim();
    if (!event) return;
    await services.dramaExportOutbox.ack(event);
  }
}

test('export outbox leases once and safely reclaims expired delivery', async () => {
  await drainOutbox();
  const input = await fixture();
  const { job } = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey: randomUUID() });
  const events = (await Promise.all(Array.from({ length: 20 }, () => services.dramaExportOutbox.claim())))
    .filter((event): event is DramaExportDelivery => event !== null);
  assert.equal(events.length, 1);
  assert.equal(events[0].workflowId, `drama-export:${job.id}`);
  await sql`update wb_next.drama_export_outbox set lease_until = clock_timestamp() - interval '1 second' where id = ${events[0].id}`;
  await assert.rejects(services.dramaExportOutbox.ack(events[0]), isStatus(409));
  const reclaimed = await services.dramaExportOutbox.claim();
  assert.ok(reclaimed);
  assert.equal(reclaimed.id, events[0].id);
  await services.dramaExportOutbox.ack(reclaimed);
});

test('export request replay is idempotent and later requests increment version ordinal', async () => {
  const input = await fixture();
  const requestKey = randomUUID();
  const first = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey });
  const replay = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey });
  assert.deepEqual(replay, first);
  const next = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey: randomUUID() });
  assert.equal(next.version.ordinal, 2);
  assert.equal(next.version.manifestSha256, first.version.manifestSha256);
});

test('export rejects an episode when any shot lacks a selected published video', async () => {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({ userId, mode: 'script', title: '未就绪', content: script, look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  await services.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '未生成。' });
  await assert.rejects(services.dramaExports.create({ userId, projectId: project.id, episodeNumber: 1, requestKey: randomUUID() }), isStatus(409));
});

test('export jobs and versions are owner-scoped', async () => {
  const input = await fixture();
  const created = await services.dramaExports.create({ ...input, episodeNumber: 1, requestKey: randomUUID() });
  const other = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  await assert.rejects(services.dramaExports.get({ userId: other.userId, jobId: created.job.id }), isStatus(404));
  await assert.rejects(services.dramaExports.getVersion({ userId: other.userId, jobId: created.job.id }), isStatus(404));
  await assert.rejects(services.dramaExports.create({ userId: other.userId, projectId: input.projectId, episodeNumber: 1, requestKey: randomUUID() }), isStatus(404));
});
