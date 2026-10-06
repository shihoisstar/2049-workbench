import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { estimateCreditsFor } from '@wb/contracts';
import { createServices, DomainError } from './index';
import type { CreateGenerationInput, GenerationDelivery } from './index';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.equal(target.search + target.hash, '');
assert.match(decodeURIComponent(target.pathname), /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
// Outbox claims are global, so this suite needs its own database rather than
// draining events concurrently created by API and worker integration tests.
const suiteDatabase = `workbench_verify_generation_${randomUUID().replaceAll('-', '')}`;
const suiteTarget = new URL(databaseUrl);
suiteTarget.pathname = `/${suiteDatabase}`;
const admin = postgres(databaseUrl, { max: 1 });
const services = createServices(suiteTarget.href);
const sql = postgres(suiteTarget.href, { max: 4 });
let created = false;
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
      assert.match(suiteDatabase, /^workbench_verify_generation_[a-f0-9]{32}$/);
      await admin.unsafe(`drop database "${suiteDatabase}"`);
    }
  } finally { await admin.end(); }
});
const guest = () => services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
const inputFor = (userId: string): CreateGenerationInput => ({
  userId, requestKey: randomUUID(), prompt: 'A quiet shop at sunset', resolution: '480p', aspectRatio: '9:16', durationSec: 5,
});
const statusError = (status: number) => (error: unknown) => error instanceof DomainError && error.statusCode === status;

async function counts(userId: string) {
  const [row] = await sql`select
    (select count(*)::int from wb_next.generation_jobs where user_id = ${userId}) as jobs,
    (select count(*)::int from wb_next.outbox o join wb_next.generation_jobs j on j.id = o.job_id where j.user_id = ${userId}) as events,
    (select count(*)::int from wb_next.ledger where user_id = ${userId} and kind = 'hold') as holds,
    (select count(*)::int from wb_next.ledger where user_id = ${userId} and kind in ('settle','refund')) as terminals`;
  return row;
}

async function balance(userId: string, expected: number) {
  const [row] = await sql`select w.balance, sum(l.amount)::text as total from wb_next.wallets w
    join wb_next.ledger l on l.user_id = w.user_id where w.user_id = ${userId} group by w.user_id`;
  assert.equal(BigInt(row.balance), BigInt(expected));
  assert.equal(BigInt(row.total), BigInt(expected));
}

test('50 identical submissions atomically admit one job, one hold and one outbox event', async () => {
  const { userId } = await guest();
  const input = inputFor(userId);
  const jobs = await Promise.all(Array.from({ length: 50 }, () => services.generation.create(input)));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  assert.deepEqual({ ...await counts(userId) }, { jobs: 1, events: 1, holds: 1, terminals: 0 });
  assert.equal(jobs[0].reservedCredits, estimateCreditsFor('480p'));
  await balance(userId, 3);
  const replay = await services.generation.create(input);
  assert.equal(replay.id, jobs[0].id);
});

test('changed request payload conflicts and generation lookup is owner scoped', async () => {
  const [{ userId }, other] = await Promise.all([guest(), guest()]);
  const input = inputFor(userId);
  const job = await services.generation.create(input);
  for (const changed of [{ prompt: 'changed' }, { resolution: '720p' as const }, { aspectRatio: '1:1' as const }]) {
    await assert.rejects(services.generation.create({ ...input, ...changed }), statusError(409));
  }
  await assert.rejects(services.generation.get({ userId: other.userId, jobId: job.id }), statusError(404));
  await assert.rejects(services.generation.fail({ userId: other.userId, jobId: job.id, failureCode: 'test' }), statusError(404));
  await balance(userId, 3);
  await balance(other.userId, 80);
});

test('the 720p reservation uses the existing five-second price; insufficient funds create nothing', async () => {
  const { userId } = await guest();
  const input = { ...inputFor(userId), resolution: '720p' as const };
  await assert.rejects(services.generation.create(input), statusError(402));
  assert.deepEqual({ ...await counts(userId) }, { jobs: 0, events: 0, holds: 0, terminals: 0 });
  await services.billing.grant({ userId, billingKey: randomUUID(), amount: 500 });
  const job = await services.generation.create(input);
  assert.equal(job.reservedCredits, estimateCreditsFor('720p'));
  assert.equal(job.model, 'fast');
  await balance(userId, 580 - estimateCreditsFor('720p'));
});

test('outbox insertion rejection rolls back the previously written reservation, ledger and job', async () => {
  const { userId } = await guest();
  const input = { ...inputFor(userId), prompt: 'fault:create' };
  await sql.unsafe(`create function wb_next.test_generation_create_failure() returns trigger language plpgsql as $$
    begin if exists (select 1 from wb_next.generation_jobs where id = new.job_id and prompt = 'fault:create') then
      raise exception 'injected outbox failure'; end if; return new; end; $$`);
  await sql.unsafe(`create trigger test_generation_create_failure before insert on wb_next.outbox
    for each row execute function wb_next.test_generation_create_failure()`);
  try {
    await assert.rejects(services.generation.create(input), /injected outbox failure/);
    await balance(userId, 80);
    assert.deepEqual({ ...await counts(userId) }, { jobs: 0, events: 0, holds: 0, terminals: 0 });
    const [row] = await sql`select count(*)::int as count from wb_next.reservations where user_id = ${userId}`;
    assert.equal(row.count, 0);
  } finally {
    await sql.unsafe('drop trigger test_generation_create_failure on wb_next.outbox');
    await sql.unsafe('drop function wb_next.test_generation_create_failure()');
  }
  assert.equal((await services.generation.create(input)).status, 'accepted');
});

test('terminal ledger rejection rolls back reservation and job; retry can finish exactly one local settlement', async () => {
  const { userId } = await guest();
  const job = await services.generation.create({ ...inputFor(userId), prompt: 'fault:terminal' });
  const complete = { userId, jobId: job.id, outputRef: `asset:${randomUUID()}`, actualCredits: 70 };
  await sql.unsafe(`create function wb_next.test_generation_terminal_failure() returns trigger language plpgsql as $$
    begin if new.kind = 'settle' and exists (select 1 from wb_next.generation_jobs
      where user_id = new.user_id and billing_key = new.billing_key and prompt = 'fault:terminal') then
      raise exception 'injected terminal ledger failure'; end if; return new; end; $$`);
  await sql.unsafe(`create trigger test_generation_terminal_failure before insert on wb_next.ledger
    for each row execute function wb_next.test_generation_terminal_failure()`);
  try {
    await assert.rejects(services.generation.complete(complete), /injected terminal ledger failure/);
    assert.equal((await services.generation.get({ userId, jobId: job.id })).status, 'accepted');
    const [row] = await sql`select status from wb_next.reservations where user_id = ${userId} and billing_key = ${`generation:${job.id}`}`;
    assert.equal(row.status, 'held');
    assert.equal((await counts(userId)).terminals, 0);
    await balance(userId, 3);
  } finally {
    await sql.unsafe('drop trigger test_generation_terminal_failure on wb_next.ledger');
    await sql.unsafe('drop function wb_next.test_generation_terminal_failure()');
  }
  const finished = await services.generation.complete(complete);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.actualCostCents, null);
  await balance(userId, 10);
});

test('50 matching completions write one terminal ledger; changed or opposite outcomes conflict', async () => {
  const { userId } = await guest();
  const input = inputFor(userId);
  const job = await services.generation.create(input);
  const complete = { userId, jobId: job.id, outputRef: `asset:${randomUUID()}`, actualCredits: 77, actualCostCents: 35 };
  const completed = await Promise.all(Array.from({ length: 50 }, () => services.generation.complete(complete)));
  assert.equal(new Set(completed.map(row => row.finishedAt)).size, 1);
  assert.equal((await counts(userId)).terminals, 1);
  await assert.rejects(services.generation.complete({ ...complete, actualCredits: 76 }), statusError(409));
  await assert.rejects(services.generation.complete({ ...complete, outputRef: 'asset:other' }), statusError(409));
  await assert.rejects(services.generation.complete({ ...complete, actualCostCents: 36 }), statusError(409));
  await assert.rejects(services.generation.fail({ userId, jobId: job.id, failureCode: 'too-late' }), statusError(409));
  assert.equal((await services.generation.create(input)).status, 'succeeded');
  assert.equal((await counts(userId)).holds, 1);
  await balance(userId, 3);
});

test('completion/failure race has one winner and atomic financial outcome', async () => {
  const { userId } = await guest();
  const job = await services.generation.create(inputFor(userId));
  const results = await Promise.allSettled([
    services.generation.complete({ userId, jobId: job.id, outputRef: 'asset:race', actualCredits: 70 }),
    services.generation.fail({ userId, jobId: job.id, failureCode: 'provider-failed' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const finished = await services.generation.get({ userId, jobId: job.id });
  assert.equal((await counts(userId)).terminals, 1);
  await balance(userId, finished.status === 'failed' ? 80 : 10);
});

test('deactivation blocks new admission but existing failures refund once with stable terminal payload', async () => {
  const { userId } = await guest();
  const job = await services.generation.create(inputFor(userId));
  await services.identity.deactivate(userId);
  await assert.rejects(services.generation.create(inputFor(userId)), statusError(403));
  const failure = { userId, jobId: job.id, failureCode: 'provider-failed' };
  const first = await services.generation.fail(failure);
  const second = await services.generation.fail(failure);
  assert.equal(first.finishedAt, second.finishedAt);
  await assert.rejects(services.generation.fail({ ...failure, failureCode: 'different' }), statusError(409));
  await assert.rejects(services.generation.complete({ userId, jobId: job.id, outputRef: 'asset:late', actualCredits: 50 }), statusError(409));
  await balance(userId, 80);
});

test('unsupported durations, resolutions, URLs and invalid values do not reserve money', async () => {
  const { userId } = await guest();
  const input = inputFor(userId);
  for (const extra of [{ durationSec: 6 }, { resolution: '1080p' }, { aspectRatio: '4:3' },
    { prompt: '' }, { requestKey: ' ' }, { imageURL: 'https://example.com/image.png' }]) {
    await assert.rejects(services.generation.create({ ...input, ...extra } as CreateGenerationInput), statusError(400));
  }
  assert.deepEqual({ ...await counts(userId) }, { jobs: 0, events: 0, holds: 0, terminals: 0 });
  await balance(userId, 80);
});

test('the 3000-character prompt limit rejects 3001 characters without reserving credits', async () => {
  const { userId } = await guest();
  const input = inputFor(userId);
  await assert.rejects(services.generation.create({ ...input, prompt: 'a'.repeat(3001) }), statusError(400));
  assert.deepEqual({ ...await counts(userId) }, { jobs: 0, events: 0, holds: 0, terminals: 0 });
  await balance(userId, 80);
  const job = await services.generation.create({ ...input, prompt: 'a'.repeat(3000) });
  assert.equal(job.prompt.length, 3000);
  await assert.rejects(sql`update wb_next.generation_jobs set prompt = ${'a'.repeat(3001)} where id = ${job.id}`);
  assert.equal((await services.generation.get({ userId, jobId: job.id })).prompt.length, 3000);
  await balance(userId, 3);
});

// Complete earlier fixtures through the real lease API so this test owns the next delivery.
async function drainFixtures(): Promise<void> {
  for (;;) {
    const event = await services.generationOutbox.claim();
    if (!event) return;
    await services.generationOutbox.ack(event);
  }
}

test('50 concurrent claims lease a single event once; locked row is skipped without waiting', async () => {
  await drainFixtures();
  const { userId } = await guest();
  const job = await services.generation.create(inputFor(userId));
  await sql.begin(async tx => {
    await tx`select id from wb_next.outbox where job_id = ${job.id} for update`;
    assert.equal(await services.generationOutbox.claim(), null);
  });
  const claimed = (await Promise.all(Array.from({ length: 50 }, () => services.generationOutbox.claim())))
    .filter((event): event is GenerationDelivery => event !== null);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].workflowId, `generation:${job.id}`);
  assert.equal(claimed[0].userId, userId);
  assert.equal(claimed[0].attempt, 1);
  await services.generationOutbox.ack(claimed[0]);
  assert.equal(await services.generationOutbox.claim(), null);
});

test('expired leases are reclaimed; stale ack/release fail and release applies backoff', async () => {
  await drainFixtures();
  const { userId } = await guest();
  const job = await services.generation.create(inputFor(userId));
  const first = await services.generationOutbox.claim();
  assert.ok(first);
  assert.equal(first.jobId, job.id);
  await sql`update wb_next.outbox set lease_until = clock_timestamp() - interval '1 second' where id = ${first.id}`;
  await assert.rejects(services.generationOutbox.ack(first), statusError(409));
  const second = await services.generationOutbox.claim();
  assert.ok(second);
  assert.equal(second.id, first.id);
  assert.notEqual(second.leaseToken, first.leaseToken);
  assert.equal(second.attempt, 2);
  await assert.rejects(services.generationOutbox.ack(first), statusError(409));
  await assert.rejects(services.generationOutbox.release(first), statusError(409));
  await services.generationOutbox.release(second);
  assert.equal(await services.generationOutbox.claim(), null);
  const [backoff] = await sql`select available_at > clock_timestamp() as delayed from wb_next.outbox where id = ${second.id}`;
  assert.equal(backoff.delayed, true);
  await sql`update wb_next.outbox set available_at = clock_timestamp() - interval '1 second' where id = ${second.id}`;
  const third = await services.generationOutbox.claim();
  assert.ok(third);
  assert.equal(third.workflowId, first.workflowId);
  assert.equal(third.attempt, 3);
  await services.generationOutbox.ack(third);
});

test('ack must recheck lease expiry after waiting for a row lock', async () => {
  await drainFixtures();
  const { userId } = await guest();
  await services.generation.create(inputFor(userId));
  const event = await services.generationOutbox.claim();
  assert.ok(event);
  await sql`update wb_next.outbox set lease_until = clock_timestamp() + interval '100 milliseconds' where id = ${event.id}`;
  let outcome: Promise<unknown> = Promise.resolve();
  await sql.begin(async tx => {
    await tx`select id from wb_next.outbox where id = ${event.id} for update`;
    outcome = services.generationOutbox.ack(event).then(() => null, error => error);
    await tx`select pg_sleep(0.2)`;
  });
  assert.ok(statusError(409)(await outcome), 'ack after its lease expires while blocked must be rejected');
  const retry = await services.generationOutbox.claim();
  assert.ok(retry);
  await services.generationOutbox.ack(retry);
});
