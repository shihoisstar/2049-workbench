import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createServices, DomainError } from './index';
const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.search + target.hash, '');
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 2 });
after(async () => { await services.close(); await sql.end(); });
async function fixture() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const job = await services.generation.create({ userId, requestKey: randomUUID(), prompt: 'Media fixture', resolution: '480p', aspectRatio: '9:16', durationSec: 5 });
  const sha256 = 'a'.repeat(64);
  return { userId, jobId: job.id, sha256, objectKey: `jobs/${job.id}/${sha256}.mp4`, byteLength: 2048, width: 480, height: 854, durationMs: 5000 };
}
const status = (code: number) => (error: unknown) => error instanceof DomainError && error.statusCode === code;
test('20 concurrent publications yield one owned asset, one settlement and one terminal job', async () => {
  const input = await fixture();
  const results = await Promise.all(Array.from({ length: 20 }, () => services.assets.publish(input)));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal((await services.generation.get(input)).status, 'succeeded');
  const wallet = await services.billing.summary(input.userId);
  assert.equal(wallet.balance, 3);
  assert.equal(wallet.entries.filter(entry => entry.type === 'settle').length, 1);
  await assert.rejects(services.assets.get({ ...input, userId: randomUUID() }), status(404));
});
test('invalid media cannot settle; failed jobs cannot acquire assets', async () => {
  const input = await fixture();
  await assert.rejects(services.assets.publish({ ...input, durationMs: 9000 }), status(400));
  assert.equal((await services.billing.summary(input.userId)).entries.filter(entry => entry.type === 'settle').length, 0);
  await services.generation.fail({ ...input, failureCode: 'MEDIA_PROCESSING_FAILED' });
  await assert.rejects(services.assets.publish(input), status(409));
  assert.equal((await services.billing.summary(input.userId)).balance, 80);
});
test('asset, settlement and job publication roll back together after terminal write failure', async () => {
  const input = await fixture();
  const name = 'asset_fault_' + randomUUID().replaceAll('-', '');
  await sql.unsafe(`create function wb_next.${name}() returns trigger language plpgsql as $$ begin if NEW.id='${input.jobId}'::uuid and NEW.status='succeeded' then raise exception 'injected'; end if; return NEW; end $$`);
  await sql.unsafe(`create trigger ${name} before update on wb_next.generation_jobs for each row execute function wb_next.${name}()`);
  try {
    await assert.rejects(services.assets.publish(input));
    await assert.rejects(services.assets.get(input), status(404));
    assert.equal((await services.generation.get(input)).status, 'accepted');
    assert.equal((await services.billing.summary(input.userId)).entries.filter(entry => entry.type === 'settle').length, 0);
  } finally {
    await sql.unsafe(`drop trigger ${name} on wb_next.generation_jobs`);
    await sql.unsafe(`drop function wb_next.${name}()`);
  }
  await services.assets.publish(input);
  assert.equal((await services.generation.get(input)).status, 'succeeded');
});
test('expired assets deny access even when the original job succeeded', async () => {
  const input = await fixture();
  const asset = await services.assets.publish(input);
  await sql`update wb_next.media_assets set created_at=clock_timestamp()-interval '8 days', expires_at=clock_timestamp()-interval '1 day' where id=${asset.id}`;
  await assert.rejects(services.assets.get(input), status(410));
});
