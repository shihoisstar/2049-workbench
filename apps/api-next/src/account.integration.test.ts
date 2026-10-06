import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { ErrorBody, ErrorCode, GuestSession, WalletSummary } from '@wb/contracts';
import { createServices } from '@wb/server';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated; account tests require an explicit test database');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 2 });
const appPromise = createApplication({ config: { databaseUrl, port: 3011 }, services });
before(async () => {
  const app = await appPromise;
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
after(async () => { await (await appPromise).close(); await sql.end(); });
const credential = () => randomBytes(32).toString('hex');
const headers = (token: string) => ({ authorization: `Bearer ${token}` });

async function login(secret = credential()) {
  const response = await (await appPromise).inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: secret } });
  assert.equal(response.statusCode, 200, response.body);
  return GuestSession.parse(response.json());
}

test('HTTP guest login resumes the same identity and grants 80 only once', async () => {
  const app = await appPromise;
  const secret = credential();
  const first = await login(secret);
  const second = await login(secret);
  assert.equal(first.userId, second.userId);
  assert.notEqual(first.token, second.token);
  const response = await app.inject({ method: 'GET', url: '/v2/wallet', headers: headers(second.token) });
  assert.equal(response.statusCode, 200);
  const wallet = WalletSummary.parse(response.json());
  assert.equal(wallet.balance, 80);
  assert.equal(wallet.entries.length, 1);
  assert.equal(wallet.entries[0].type, 'grant');
});

test('wallet ownership comes from the bearer session, never a client userId', async () => {
  const app = await appPromise;
  const a = await login();
  const b = await login();
  await services.billing.grant({ userId: b.userId, billingKey: 'test-topup', amount: 10 });
  const response = await app.inject({ method: 'GET', url: `/v2/wallet?userId=${b.userId}`, headers: headers(a.token) });
  assert.equal(response.statusCode, 200);
  assert.equal(WalletSummary.parse(response.json()).balance, 80);
  assert.equal((await services.billing.summary(b.userId)).balance, 90);
});

test('unknown, missing and malformed sessions return contract errors without leaking the token', async () => {
  const app = await appPromise;
  const unknown = randomBytes(32).toString('base64url');
  for (const authorization of [undefined, 'Bearer invalid', `Bearer ${unknown}`]) {
    const response = await app.inject({ method: 'GET', url: '/v2/wallet', headers: authorization ? { authorization } : {} });
    assert.equal(response.statusCode, 401);
    const error = ErrorBody.parse(response.json());
    assert.equal(error.code, ErrorCode.UNAUTHORIZED);
    assert.equal(error.requestId, response.headers['x-request-id']);
    assert.equal(response.body.includes(unknown), false);
  }
});

test('deactivation revokes both sessions and cannot target another account or reclaim a grant', async () => {
  const app = await appPromise;
  const secret = credential();
  const a = await login(secret);
  const anotherSession = await login(secret);
  const b = await login();
  const deactivated = await app.inject({ method: 'POST', url: '/v2/auth/deactivate', headers: headers(a.token), payload: { userId: b.userId } });
  assert.equal(deactivated.statusCode, 204);
  assert.equal(deactivated.body, '');
  for (const token of [a.token, anotherSession.token]) {
    assert.equal((await app.inject({ method: 'GET', url: '/v2/wallet', headers: headers(token) })).statusCode, 401);
  }
  assert.equal((await app.inject({ method: 'GET', url: '/v2/wallet', headers: headers(b.token) })).statusCode, 200);
  const relogin = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: secret } });
  assert.equal(relogin.statusCode, 403);
  assert.equal(ErrorBody.parse(relogin.json()).code, ErrorCode.ACCOUNT_DEACTIVATED);
  assert.equal((await services.billing.summary(a.userId)).balance, 80);
});

test('expired sessions return CREDENTIAL_EXPIRED', async () => {
  const app = await appPromise;
  const session = await login();
  const digest = createHash('sha256').update(session.token).digest('hex');
  await sql`update wb_next.sessions set expires_at = now() - interval '1 second' where token_hash = ${digest}`;
  const response = await app.inject({ method: 'GET', url: '/v2/wallet', headers: headers(session.token) });
  assert.equal(response.statusCode, 401);
  assert.equal(ErrorBody.parse(response.json()).code, ErrorCode.CREDENTIAL_EXPIRED);
});

test('new login rejects deviceId and extra fields; no credit mutation endpoint is exposed', async () => {
  const app = await appPromise;
  for (const payload of [{ deviceId: 'known-device' }, { credential: 'x' }, { credential: credential(), balance: 10000 }]) {
    const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload });
    assert.equal(response.statusCode, 400);
    assert.equal(ErrorBody.parse(response.json()).code, ErrorCode.VALIDATION);
  }
  const session = await login();
  const response = await app.inject({ method: 'POST', url: '/v2/wallet/grant', headers: headers(session.token), payload: { amount: 10000 } });
  assert.equal(response.statusCode, 404);
  assert.equal((await services.billing.summary(session.userId)).balance, 80);
});
