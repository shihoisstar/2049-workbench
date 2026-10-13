import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
import type { DramaImageDelivery } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.equal(target.search + target.hash, '');
assert.match(decodeURIComponent(target.pathname), /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const suiteDatabase = `workbench_verify_drama_image_${randomUUID().replaceAll('-', '')}`;
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
      assert.match(suiteDatabase, /^workbench_verify_drama_image_[a-f0-9]{32}$/);
      await admin.unsafe(`drop database "${suiteDatabase}"`);
    }
  } finally { await admin.end(); }
});

async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const project = await services.drama.create({
    userId, mode: 'script', title: '候选图作业', content: validScript, look: '3D国创', aspectRatio: '9:16', episodeCount: 1,
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
  await services.billing.grant({ userId, billingKey: `test-drama-image:${userId}`, amount: 300, remark: 'test' });
  const job = await services.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
  return { userId, job, sha256: randomBytes(32).toString('hex') };
}

test('unknown supplier acceptance holds funds and cannot re-claim submission', async () => {
  const { userId, job } = await fixture();
  const claim = await services.dramaImageSubmissions.begin({ userId, jobId: job.id, providerKey: 'mock-image' });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error('expected submission claim');
  const unknown = await services.dramaImageSubmissions.unknown({ userId, jobId: job.id, token: claim.token });
  assert.equal(unknown.status, 'unknown');
  const replay = await services.dramaImageSubmissions.begin({ userId, jobId: job.id, providerKey: 'mock-image' });
  assert.equal(replay.claimed, false);
  assert.equal(replay.submission.status, 'unknown');
  assert.equal((await services.dramaImages.get({ userId, jobId: job.id })).status, 'accepted');
  assert.equal((await services.billing.summary(userId)).balance, 270);
  await services.dramaImageSubmissions.reject({ userId, jobId: job.id, token: claim.token });
  assert.equal((await services.dramaImages.get({ userId, jobId: job.id })).status, 'failed');
  assert.equal((await services.billing.summary(userId)).balance, 380);
});

test('private image publication settles once and remains owner scoped', async () => {
  const { userId, job, sha256 } = await fixture();
  const input = {
    userId, jobId: job.id, sha256, objectKey: `drama-image-jobs/${job.id}/${sha256}.png`, byteLength: 2048, width: 768, height: 1024,
  };
  const assets = await Promise.all(Array.from({ length: 20 }, () => services.dramaImageAssets.publish(input)));
  assert.equal(new Set(assets.map(asset => asset.id)).size, 1);
  assert.equal((await services.dramaImages.get({ userId, jobId: job.id })).status, 'succeeded');
  assert.equal((await services.billing.summary(userId)).entries.filter(entry => entry.type === 'settle').length, 1);
  await assert.rejects(services.dramaImageAssets.get({ userId: randomUUID(), jobId: job.id }), status(404));
});

async function drainOutbox(): Promise<void> {
  for (;;) {
    const event = await services.dramaImageOutbox.claim();
    if (!event) return;
    await services.dramaImageOutbox.ack(event);
  }
}

test('outbox delivery is leased once and stale acknowledgements fail', async () => {
  await drainOutbox();
  const { job } = await fixture();
  const events = (await Promise.all(Array.from({ length: 20 }, () => services.dramaImageOutbox.claim())))
    .filter((event): event is DramaImageDelivery => event !== null);
  assert.equal(events.length, 1);
  assert.equal(events[0].workflowId, `drama-image:${job.id}`);
  await sql`update wb_next.drama_image_outbox set lease_until = clock_timestamp() - interval '1 second' where id = ${events[0].id}`;
  await assert.rejects(services.dramaImageOutbox.ack(events[0]), status(409));
  const reclaimed = await services.dramaImageOutbox.claim();
  assert.ok(reclaimed);
  assert.equal(reclaimed.id, events[0].id);
  await services.dramaImageOutbox.ack(reclaimed);
});
