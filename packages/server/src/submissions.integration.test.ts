import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createServices, DomainError } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 2 });
after(async () => { await services.close(); await sql.end(); });
async function job() {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const created = await services.generation.create({ userId, requestKey: randomUUID(), prompt: 'A shop', resolution: '480p', aspectRatio: '9:16', durationSec: 5 });
  return { userId, jobId: created.id, providerKey: 'test-provider:v1' };
}
const errorStatus = (status: number) => (error: unknown) => error instanceof DomainError && error.statusCode === status;

test('50 claims authorize one submit; restarts never reclaim an unacknowledged POST', async () => {
  const input = await job();
  const claims = await Promise.all(Array.from({ length: 50 }, () => services.providerSubmissions.begin(input)));
  assert.equal(claims.filter(claim => claim.claimed).length, 1);
  const restarted = createServices(databaseUrl);
  try {
    const replay = await restarted.providerSubmissions.begin(input);
    assert.equal(replay.claimed, false);
    assert.equal(replay.submission.status, 'submitting');
    assert.equal('token' in replay, false);
  } finally { await restarted.close(); }
  assert.equal((await services.billing.summary(input.userId)).balance, 3);
});

test('receipts are owner/token scoped; same receipt replays, conflicting IDs and channels fail', async () => {
  const input = await job();
  const claim = await services.providerSubmissions.begin(input);
  assert.ok(claim.claimed);
  const token = { ...input, token: claim.token };
  await assert.rejects(services.providerSubmissions.accepted({ ...token, token: randomUUID(), providerTaskId: 'a' }), errorStatus(409));
  await assert.rejects(services.providerSubmissions.get({ ...input, userId: randomUUID() }), errorStatus(404));
  const receipt = await services.providerSubmissions.accepted({ ...token, providerTaskId: 'a' });
  assert.deepEqual(await services.providerSubmissions.accepted({ ...token, providerTaskId: 'a' }), receipt);
  await assert.rejects(services.providerSubmissions.accepted({ ...token, providerTaskId: 'b' }), errorStatus(409));
  await assert.rejects(services.providerSubmissions.begin({ ...input, providerKey: 'other' }), errorStatus(409));
});

test('unknown acceptance retains held credits; late original receipt can recover without resubmitting', async () => {
  const input = await job();
  const claim = await services.providerSubmissions.begin(input);
  assert.ok(claim.claimed);
  const token = { ...input, token: claim.token };
  assert.equal((await services.providerSubmissions.unknown(token)).status, 'unknown');
  assert.equal((await services.providerSubmissions.begin(input)).claimed, false);
  assert.equal((await services.billing.summary(input.userId)).balance, 3);
  await services.providerSubmissions.accepted({ ...token, providerTaskId: 'late-receipt' });
  assert.equal((await services.providerSubmissions.unknown(token)).status, 'submitted');
  assert.equal((await services.providerSubmissions.get(input))?.providerTaskId, 'late-receipt');
});

test('definite rejection, failed job and refund commit atomically and replay once', async () => {
  const input = await job();
  const claim = await services.providerSubmissions.begin(input);
  assert.ok(claim.claimed);
  const token = { ...input, token: claim.token };
  const name = 'submission_fault_' + randomUUID().replaceAll('-', '');
  await sql.unsafe(`create function wb_next.${name}() returns trigger language plpgsql as $$ begin if NEW.id = '${input.jobId}'::uuid and NEW.status = 'failed' then raise exception 'injected'; end if; return NEW; end $$`);
  await sql.unsafe(`create trigger ${name} before update on wb_next.generation_jobs for each row execute function wb_next.${name}()`);
  try {
    await assert.rejects(services.providerSubmissions.reject(token));
    assert.equal((await services.providerSubmissions.get(input))?.status, 'submitting');
    assert.equal((await services.generation.get(input)).status, 'accepted');
    assert.equal((await services.billing.summary(input.userId)).balance, 3);
  } finally {
    await sql.unsafe(`drop trigger ${name} on wb_next.generation_jobs`);
    await sql.unsafe(`drop function wb_next.${name}()`);
  }
  await Promise.all(Array.from({ length: 20 }, () => services.providerSubmissions.reject(token)));
  const wallet = await services.billing.summary(input.userId);
  assert.equal(wallet.balance, 80);
  assert.equal(wallet.entries.filter(entry => entry.type === 'refund').length, 1);
  assert.equal((await services.generation.get(input)).status, 'failed');
  assert.equal((await services.providerSubmissions.get(input))?.status, 'rejected');
  await assert.rejects(services.providerSubmissions.accepted({ ...token, providerTaskId: 'a' }), errorStatus(409));
});

test('terminal jobs cannot start a new paid submission', async () => {
  const input = await job();
  await services.generation.fail({ ...input, failureCode: 'test-cancel' });
  await assert.rejects(services.providerSubmissions.begin(input), errorStatus(409));
  assert.equal(await services.providerSubmissions.get(input), null);
});

test('receipt/rejection race has one outcome and cannot refund an accepted submission', async () => {
  const input = await job();
  const claim = await services.providerSubmissions.begin(input);
  assert.ok(claim.claimed);
  const token = { ...input, token: claim.token };
  const results = await Promise.allSettled([
    services.providerSubmissions.accepted({ ...token, providerTaskId: 'race-receipt' }),
    services.providerSubmissions.reject(token),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const submission = await services.providerSubmissions.get(input);
  const balance = (await services.billing.summary(input.userId)).balance;
  assert.equal(balance, submission?.status === 'submitted' ? 3 : 80);
});
