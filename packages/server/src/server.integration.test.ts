import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { createServices } from './index';
import { DomainError } from './errors';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'WB_NEXT_TEST_DATABASE_URL is required; integration tests must not silently skip');
const target = new URL(databaseUrl);
assert.equal(target.search + target.hash, '');
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'only explicit loopback test databases are allowed');
assert.match(decodeURIComponent(target.pathname), /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);

const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 4 });
after(async () => { await services.close(); await sql.end(); });
const credential = () => randomBytes(32).toString('hex');
const key = () => randomUUID();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const guest = () => services.identity.bootstrapGuest(credential());
const reserveInput = (userId: string, billingKey = key(), estimate = 10) => ({
  userId, billingKey, estimate, model: 'integration-model', estimatedCostCents: 3,
});

test('a database rejection after balance update rolls back both balance and ledger', async () => {
  const { userId } = await guest();
  const billingKey = key();
  // PostgreSQL text rejects NUL when inserting the ledger, after the wallet UPDATE.
  await assert.rejects(services.billing.grant({ userId, billingKey, amount: 10, remark: '\u0000' }));
  await invariant(userId, 80);
  assert.equal(await ledgerCount(userId, billingKey, 'grant'), 0);
});

test('deactivation blocks new spending but cannot strand an existing reservation refund', async () => {
  const { userId } = await guest();
  const held = reserveInput(userId);
  await services.billing.reserve(held);
  await services.identity.deactivate(userId);
  await assert.rejects(services.billing.reserve(reserveInput(userId)), domainError(403, ErrorCode.ACCOUNT_DEACTIVATED));
  await services.billing.refund(held);
  await invariant(userId, 80);
});

test('grants preserve headroom for all held credits so refund cannot become impossible', async () => {
  const { userId } = await guest();
  const held = reserveInput(userId, key(), 80);
  await services.billing.reserve(held);
  await assert.rejects(services.billing.grant({ userId, billingKey: key(), amount: Number.MAX_SAFE_INTEGER }), domainError());
  await invariant(userId, 0);
  await services.billing.grant({ userId, billingKey: key(), amount: Number.MAX_SAFE_INTEGER - 80 });
  await services.identity.deactivate(userId);
  await services.billing.refund(held);
  await invariant(userId, Number.MAX_SAFE_INTEGER);
});

test('a rejected signup ledger insertion rolls back identity, sessions and wallet before retry', async () => {
  const rawCredential = credential();
  const hash = digest(rawCredential);
  const name = `signup_fault_${randomUUID().replaceAll('-', '')}`;
  // Identifiers and the predicate are derived only from CSPRNG hex, never external input.
  assert.match(name, /^signup_fault_[a-f0-9]{32}$/);
  assert.match(hash, /^[a-f0-9]{64}$/);
  let failedUserId = '';
  await sql.unsafe(`create function wb_next.${name}() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from wb_next.users where id = NEW.user_id and credential_hash = '${hash}') then
        raise exception 'injected signup failure' using errcode = 'P0001', detail = NEW.user_id::text;
      end if;
      return NEW;
    end; $$;`);
  try {
    await sql.unsafe(`create trigger ${name} before insert on wb_next.ledger for each row execute function wb_next.${name}()`);
    await assert.rejects(services.identity.bootstrapGuest(rawCredential), (error: unknown) => {
      const rejected = error as { code?: string; detail?: string };
      assert.equal(rejected.code, 'P0001');
      assert.match(rejected.detail ?? '', /^[a-f0-9-]{36}$/);
      failedUserId = rejected.detail!;
      return true;
    });
    const [counts] = await sql`
      select (select count(*) from wb_next.users where id=${failedUserId}) as users,
        (select count(*) from wb_next.sessions where user_id=${failedUserId}) as sessions,
        (select count(*) from wb_next.wallets where user_id=${failedUserId}) as wallets,
        (select count(*) from wb_next.ledger where user_id=${failedUserId}) as ledger`;
    for (const count of Object.values(counts)) assert.equal(Number(count), 0);
  } finally {
    await sql.unsafe(`drop trigger if exists ${name} on wb_next.ledger`);
    await sql.unsafe(`drop function wb_next.${name}()`);
  }
  const retried = await services.identity.bootstrapGuest(rawCredential);
  await invariant(retried.userId, 80);
  assert.equal(await ledgerCount(retried.userId, `signup:${retried.userId}`, 'grant'), 1);
});

test('deactivation serializes with in-flight login and spending on the same identity row', async () => {
  const secret = credential();
  const session = await services.identity.bootstrapGuest(secret);
  const held = reserveInput(session.userId);
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await sql.begin(async barrier => {
      await barrier`select id from wb_next.users where id=${session.userId} for update`;
      const [connection] = await barrier`select pg_backend_pid() as pid`;
      pending = Promise.allSettled([
        services.identity.deactivate(session.userId),
        services.identity.bootstrapGuest(secret),
        services.billing.reserve(held),
      ]);
      const deadline = Date.now() + 5000;
      let blocked = 0;
      while (Date.now() < deadline && blocked < 3) {
        // Observe from a separate autocommit connection, not the barrier's cached stats snapshot.
        const [row] = await sql`with recursive waiting(pid) as (
          select ${connection.pid}::int union
          select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid))
        ) select count(*) as n from pg_stat_activity where pid in (select pid from waiting) and wait_event_type='Lock'`;
        blocked = Number(row.n);
        if (blocked < 3) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(blocked, 3, 'all three competing transactions reached the row lock');
    });
  } finally {
    // Even an assertion failure releases the barrier and drains its launched operations.
    if (pending) await pending;
  }
  const results = await pending!;
  assert.equal(results[0].status, 'fulfilled');
  const [sessions] = await sql`select count(*) as n from wb_next.sessions where user_id=${session.userId}`;
  assert.equal(Number(sessions.n), 0);
  await assert.rejects(services.identity.authenticate(session.token), domainError(401, ErrorCode.UNAUTHORIZED));
  await assert.rejects(services.identity.bootstrapGuest(secret), domainError(403, ErrorCode.ACCOUNT_DEACTIVATED));
  await assert.rejects(services.billing.reserve(reserveInput(session.userId)), domainError(403, ErrorCode.ACCOUNT_DEACTIVATED));
  if (results[2].status === 'fulfilled') await services.billing.refund(held);
  await invariant(session.userId, 80);
});

function domainError(statusCode?: number, code?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof DomainError, String(error));
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    if (code !== undefined) assert.equal(error.code, code);
    return true;
  };
}

async function invariant(userId: string, expected: number) {
  const [row] = await sql`
    SELECT w.balance, COALESCE(SUM(l.amount), 0) AS ledger_sum
    FROM wb_next.wallets w LEFT JOIN wb_next.ledger l ON l.user_id = w.user_id
    WHERE w.user_id = ${userId} GROUP BY w.user_id, w.balance`;
  assert.ok(row);
  assert.equal(BigInt(row.balance), BigInt(expected));
  assert.equal(BigInt(row.ledger_sum), BigInt(expected));
  assert.equal((await services.billing.summary(userId)).balance, expected);
}

async function ledgerCount(userId: string, billingKey: string, kind: string) {
  const [row] = await sql`SELECT COUNT(*) AS n FROM wb_next.ledger
    WHERE user_id = ${userId} AND billing_key = ${billingKey} AND kind = ${kind}`;
  return Number(row.n);
}

test('guest bootstrap is atomic under 50 concurrent calls and stores only credential/token hashes', async () => {
  const rawCredential = credential();
  const sessions = await Promise.all(Array.from({ length: 50 }, () => services.identity.bootstrapGuest(rawCredential)));
  const { userId } = sessions[0];
  assert.equal(new Set(sessions.map((session) => session.userId)).size, 1);
  await invariant(userId, 80);
  const [grants] = await sql`SELECT COUNT(*) AS n FROM wb_next.ledger WHERE user_id = ${userId} AND kind = 'grant'`;
  assert.equal(Number(grants.n), 1);
  const [user] = await sql`SELECT * FROM wb_next.users WHERE id = ${userId}`;
  assert.equal(user.credential_hash, digest(rawCredential));
  assert.equal(JSON.stringify(user).includes(rawCredential), false);
  for (const session of sessions) {
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await services.identity.authenticate(session.token)).userId, userId);
    const [stored] = await sql`SELECT * FROM wb_next.sessions WHERE token_hash = ${digest(session.token)}`;
    assert.ok(stored);
    assert.equal(stored.user_id, userId);
    assert.equal(JSON.stringify(stored).includes(session.token), false);
  }
});

test('50 independent grants never lose updates: initial 80 plus 500 equals ledger sum 580', async () => {
  const { userId } = await guest();
  await Promise.all(Array.from({ length: 50 }, () => services.billing.grant({ userId, billingKey: key(), amount: 10 })));
  await invariant(userId, 580);
});

test('50 reservations on 80 credits admit exactly 8 and reject 42 without overdraft', async () => {
  const { userId } = await guest();
  const outcomes = await Promise.allSettled(Array.from({ length: 50 }, () => services.billing.reserve(reserveInput(userId))));
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 8);
  const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
  assert.equal(rejected.length, 42);
  for (const outcome of rejected) domainError(undefined, ErrorCode.INSUFFICIENT_CREDITS)(outcome.reason);
  await invariant(userId, 0);
  const [reservations] = await sql`SELECT COUNT(*) AS n FROM wb_next.reservations WHERE user_id = ${userId}`;
  assert.equal(Number(reservations.n), 8, 'failed reserves must roll back their reservation records');
});

test('50 identical reservations and grants are idempotent', async () => {
  const { userId } = await guest();
  const hold = reserveInput(userId);
  await Promise.all(Array.from({ length: 50 }, () => services.billing.reserve(hold)));
  await invariant(userId, 70);
  assert.equal(await ledgerCount(userId, hold.billingKey, 'hold'), 1);
  const grant = { userId, billingKey: key(), amount: 10, remark: 'same request' };
  await Promise.all(Array.from({ length: 50 }, () => services.billing.grant(grant)));
  await invariant(userId, 80);
  assert.equal(await ledgerCount(userId, grant.billingKey, 'grant'), 1);
});

test('settle/refund competition writes only one terminal state and one terminal ledger entry', async () => {
  const { userId } = await guest();
  const hold = reserveInput(userId, key(), 50);
  await services.billing.reserve(hold);
  const outcomes = await Promise.allSettled([
    services.billing.settle({ userId, billingKey: hold.billingKey, actual: 30, actualCostCents: 2 }),
    services.billing.refund({ userId, billingKey: hold.billingKey }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  for (const outcome of outcomes) if (outcome.status === 'rejected') domainError(409)(outcome.reason);
  const [reservation] = await sql`SELECT status FROM wb_next.reservations WHERE user_id = ${userId} AND billing_key = ${hold.billingKey}`;
  assert.ok(['settled', 'refunded'].includes(reservation.status));
  await invariant(userId, reservation.status === 'settled' ? 50 : 80);
  const [terminal] = await sql`SELECT COUNT(*) AS n FROM wb_next.ledger
    WHERE user_id = ${userId} AND kind IN ('settle', 'refund')`;
  assert.equal(Number(terminal.n), 1);
});

test('refund then settle and settle then refund both reject the second terminal operation', async () => {
  for (const refundFirst of [true, false]) {
    const { userId } = await guest();
    const hold = reserveInput(userId, key(), 50);
    await services.billing.reserve(hold);
    const settle = () => services.billing.settle({ userId, billingKey: hold.billingKey, actual: 30 });
    const refund = () => services.billing.refund({ userId, billingKey: hold.billingKey });
    await (refundFirst ? refund() : settle());
    await assert.rejects(refundFirst ? settle() : refund(), domainError(409));
    await (refundFirst ? refund() : settle());
    await invariant(userId, refundFirst ? 80 : 50);
  }
});

test('same key with a changed grant, reserve or settlement payload conflicts without mutation', async () => {
  const { userId } = await guest();
  const grant = { userId, billingKey: key(), amount: 10, remark: 'original' };
  await services.billing.grant(grant);
  await assert.rejects(services.billing.grant({ ...grant, amount: 11 }), domainError(409));
  await assert.rejects(services.billing.grant({ ...grant, remark: 'changed' }), domainError(409));
  const hold = reserveInput(userId, key(), 40);
  await services.billing.reserve(hold);
  for (const changed of [{ estimate: 41 }, { model: 'other' }, { estimatedCostCents: 4 }]) {
    await assert.rejects(services.billing.reserve({ ...hold, ...changed }), domainError(409));
  }
  const settlement = { userId, billingKey: hold.billingKey, actual: 30, actualCostCents: 2 };
  await services.billing.settle(settlement);
  await assert.rejects(services.billing.settle({ ...settlement, actual: 31 }), domainError(409));
  await assert.rejects(services.billing.settle({ ...settlement, actualCostCents: 3 }), domainError(409));
  await invariant(userId, 60);
});

test('negative, fractional, non-finite and unsafe amounts are rejected before writes', async () => {
  const { userId } = await guest();
  const hold = reserveInput(userId, key(), 40);
  await services.billing.reserve(hold);
  for (const amount of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(services.billing.grant({ userId, billingKey: key(), amount }), domainError(400));
    await assert.rejects(services.billing.reserve({ ...reserveInput(userId), estimate: amount }), domainError(400));
    await assert.rejects(services.billing.reserve({ ...reserveInput(userId), estimatedCostCents: amount }), domainError(400));
    await assert.rejects(services.billing.settle({ userId, billingKey: hold.billingKey, actual: amount }), domainError(400));
    await assert.rejects(services.billing.settle({ userId, billingKey: hold.billingKey, actual: 30, actualCostCents: amount }), domainError(400));
  }
  await invariant(userId, 40);
  await services.billing.refund({ userId, billingKey: hold.billingKey });
  await assert.rejects(services.billing.grant({ userId, billingKey: key(), amount: Number.MAX_SAFE_INTEGER }), domainError());
  await invariant(userId, 80);
});

test('malformed credentials and tokens are rejected', async () => {
  for (const value of ['', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)]) {
    await assert.rejects(services.identity.bootstrapGuest(value), domainError(400));
  }
  await assert.rejects(services.identity.authenticate(randomBytes(32).toString('base64url')), domainError(401));
});

test('expired sessions cannot authenticate', async () => {
  const session = await guest();
  await sql`UPDATE wb_next.sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = ${digest(session.token)}`;
  await assert.rejects(services.identity.authenticate(session.token), domainError(401));
});

test('deactivation revokes all sessions and does not permit reclaiming the signup grant', async () => {
  const rawCredential = credential();
  const first = await services.identity.bootstrapGuest(rawCredential);
  const second = await services.identity.bootstrapGuest(rawCredential);
  await services.identity.deactivate(first.userId);
  for (const session of [first, second]) await assert.rejects(services.identity.authenticate(session.token), domainError());
  await assert.rejects(services.identity.bootstrapGuest(rawCredential), domainError(undefined, ErrorCode.ACCOUNT_DEACTIVATED));
  const [userCount] = await sql`SELECT COUNT(*) AS n FROM wb_next.users WHERE credential_hash = ${digest(rawCredential)}`;
  assert.equal(Number(userCount.n), 1);
  const [ledger] = await sql`SELECT SUM(amount) AS balance, COUNT(*) AS n FROM wb_next.ledger WHERE user_id = ${first.userId}`;
  assert.equal(Number(ledger.balance), 80);
  assert.equal(Number(ledger.n), 1);
});

test('billing keys are user scoped and summaries never include another user ledger', async () => {
  const [a, b] = await Promise.all([guest(), guest()]);
  const sharedKey = key();
  await services.billing.grant({ userId: a.userId, billingKey: sharedKey, amount: 17, remark: 'owner-a' });
  await services.billing.grant({ userId: b.userId, billingKey: sharedKey, amount: 23, remark: 'owner-b' });
  await invariant(a.userId, 97);
  await invariant(b.userId, 103);
  const aSummary = await services.billing.summary(a.userId);
  const bSummary = await services.billing.summary(b.userId);
  assert.equal(aSummary.entries.some((entry) => entry.remark === 'owner-b'), false);
  assert.equal(bSummary.entries.some((entry) => entry.remark === 'owner-a'), false);
  const hold = reserveInput(a.userId);
  await services.billing.reserve(hold);
  await assert.rejects(services.billing.refund({ userId: b.userId, billingKey: hold.billingKey }), domainError());
  await invariant(a.userId, 87);
  await invariant(b.userId, 103);
});

test('database rejects negative wallet balances and ledger UPDATE or DELETE', async () => {
  const { userId } = await guest();
  await assert.rejects(sql`UPDATE wb_next.wallets SET balance = -1 WHERE user_id = ${userId}`);
  await assert.rejects(sql`UPDATE wb_next.ledger SET amount = amount + 1 WHERE user_id = ${userId}`);
  await assert.rejects(sql`DELETE FROM wb_next.ledger WHERE user_id = ${userId}`);
  await invariant(userId, 80);
});
