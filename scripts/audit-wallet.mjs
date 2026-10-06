import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// Explicit opt-in only: this probe writes isolated test users, never loads .env.
const databaseUrl = process.env.WB_AUDIT_DATABASE_URL;
if (!databaseUrl) throw new Error('WB_AUDIT_DATABASE_URL must explicitly name an isolated audit database');
let target;
try { target = new URL(databaseUrl); } catch {
  throw new Error('WB_AUDIT_DATABASE_URL is not a valid database URL');
}
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !/^workbench_(audit|verify)[a-zA-Z0-9_]*$/.test(decodeURIComponent(target.pathname.slice(1)))) {
  throw new Error('Audit database must use loopback and a workbench_audit or workbench_verify database name');
}

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { createDb } = require('./dist/db.js');
const { WalletService } = require('./dist/wallet.js');
const { users } = require('./dist/schema.js');
const postgres = require('postgres');
const { db, client } = createDb(databaseUrl);
const sql = postgres(databaseUrl, { max: 3 });
const wallet = new WalletService(db);
const run = `wallet-audit-${randomUUID()}`;
const retainedUsers = [];
const results = [];

async function newUser(label) {
  const id = (await db.insert(users).values({ deviceId: `${run}-${label}` }).returning())[0].id;
  retainedUsers.push(id);
  return id;
}

async function state(userId) {
  const [row] = await sql`select w.balance,
    (select sum(amount)::int from credit_logs c where c.user_id=w.user_id) as ledger_sum
    from wallets w where w.user_id=${userId}`;
  return row;
}

async function concurrent(label, operation) {
  const userId = await newUser(label);
  await wallet.grant(userId, 100, `${run}-${label}-seed`);
  let locked;
  let release;
  const ready = new Promise((resolve) => { locked = resolve; });
  const unlock = new Promise((resolve) => { release = resolve; });
  let timer;
  let lockPid;
  const lock = sql.begin(async (tx) => {
    await tx`set local lock_timeout = '5s'`;
    lockPid = (await tx`select pg_backend_pid() as pid`)[0].pid;
    await tx`select user_id from wallets where user_id=${userId} for update`;
    // Hold the row while both operations reach a database lock wait. Atomic
    // implementations may block at SELECT/UPDATE; either is a valid barrier.
    timer = setTimeout(release, 10_000);
    locked();
    await unlock;
  });
  const lockReady = lock.then(() => { throw new Error('Lock ended before barrier initialization'); });
  await Promise.race([ready, lockReady]);
  const outcomesPromise = Promise.allSettled([operation(userId, 0), operation(userId, 1)]);
  let blockedTransactions = 0;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      // pg_blocking_pids also includes a waiter queued behind the first waiter.
      // Restrict the observation to the lock held by this exact test user.
      const [row] = await sql`with recursive waiting(pid) as (
        select ${lockPid}::int
        union
        select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid))
      ) select count(*)::int as n from pg_stat_activity
        where pid in (select pid from waiting) and wait_event_type='Lock'`;
      blockedTransactions = row.n;
      if (blockedTransactions >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    release();
    clearTimeout(timer);
    await lock;
  }
  const outcomes = await outcomesPromise;
  return {
    userId,
    barrierReached: blockedTransactions >= 2,
    blockedTransactions,
    fulfilled: outcomes.filter((result) => result.status === 'fulfilled').length,
    rejected: outcomes.filter((result) => result.status === 'rejected').length,
    insufficientCredits: outcomes.filter((result) => result.status === 'rejected' && result.reason?.code === 3001).length,
    ...await state(userId),
  };
}

async function check(name, probe) {
  try {
    results.push({ name, ...await probe() });
  } catch (error) {
    // Do not dump database connection strings or driver error causes.
    results.push({ name, ok: false, error: error instanceof Error ? error.name : 'UnknownError' });
  }
}

try {
  await check('refund then settle must reject and preserve 100 credits', async () => {
    const userId = await newUser('refund-settle');
    const billingKey = `${run}-refund-settle`;
    await wallet.grant(userId, 100, `${run}-refund-settle-seed`);
    await wallet.hold(userId, billingKey, 50, { model: 'audit', estimatedCostCents: 50 });
    await wallet.refundAll(userId, billingKey);
    let rejected = false;
    try { await wallet.settle(userId, billingKey, 30, 30); } catch (error) {
      rejected = error.code === 3002;
    }
    const actual = await state(userId);
    return { ok: rejected && actual.balance === 100 && actual.ledger_sum === 100, rejected, ...actual };
  });
  await check('two grants must preserve balance and ledger sum of 120', async () => {
    const actual = await concurrent('grant', (id, i) => wallet.grant(id, 10, `${run}-grant-${i}`));
    return { ok: actual.barrierReached && actual.fulfilled === 2 && actual.balance === 120 && actual.ledger_sum === 120, ...actual };
  });
  await check('only one of two 80-credit holds may succeed against 100 credits', async () => {
    const actual = await concurrent('hold', (id, i) => wallet.hold(id, `${run}-hold-${i}`, 80, { model: 'audit', estimatedCostCents: 80 }));
    return { ok: actual.barrierReached && actual.fulfilled === 1 && actual.rejected === 1 && actual.insufficientCredits === 1 && actual.balance === 20 && actual.ledger_sum === 20, ...actual };
  });
} finally {
  await Promise.all([client.end(), sql.end()]);
}

console.log(JSON.stringify({ results, retainedTestUsers: retainedUsers, note: 'Test data retained in explicitly selected disposable database; no database was cleared.' }, null, 2));
process.exitCode = results.length === 3 && results.every((result) => result.ok) ? 0 : 1;
