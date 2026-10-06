import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

// This executable is owned by verify:isolated, never the developer's .env.
const databaseUrl = process.env.API_NEXT_DATABASE_URL;
const target = databaseUrl ? new URL(databaseUrl) : undefined;
assert.ok(target && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  && target.pathname === '/workbench_verify', 'Smoke test requires the isolated verification database');
const require = createRequire(new URL('../apps/api-next/package.json', import.meta.url));
const { createApplication } = require('./dist/application.js');
const { connectDatabase } = require('./dist/database.js');
let connection = connectDatabase(databaseUrl);
const app = await createApplication({
  config: { databaseUrl, port: 3011 },
  database: { probe: () => connection.probe(), close: () => connection.close() },
});

try {
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  let requests = 0;
  const request = (path, options) => {
    requests++;
    return fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  };
  const get = (path, headers) => request(path, { headers });
  const live = await get('/healthz');
  assert.equal(live.status, 200);
  assert.equal((await live.json()).status, 'ok');
  const ready = await get('/readyz');
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ok');

  await connection.close();
  const unavailable = await get('/readyz');
  assert.equal(unavailable.status, 503);
  const body = await unavailable.json();
  assert.equal(body.message, 'Service unavailable');
  assert.equal(body.requestId, unavailable.headers.get('x-request-id'));
  assert.equal(JSON.stringify(body).includes(databaseUrl), false);
  assert.equal((await get('/healthz')).status, 200);

  connection = connectDatabase(databaseUrl);
  assert.equal((await get('/readyz')).status, 200);
  const missing = await get('/unknown');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 1002);
  const credential = randomBytes(32).toString('hex');
  const loginRequest = () => request('/v2/auth/guest', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }),
  });
  const login = await loginRequest();
  assert.equal(login.status, 200);
  const session = await login.json();
  const authorization = { authorization: `Bearer ${session.token}` };
  const wallet = await get('/v2/wallet', authorization);
  assert.equal(wallet.status, 200);
  assert.equal((await wallet.json()).balance, 80);
  const resumed = await loginRequest();
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).userId, session.userId);
  const unchanged = await get('/v2/wallet', authorization);
  assert.equal((await unchanged.json()).balance, 80);
  assert.equal((await get('/v2/wallet')).status, 401);
  assert.equal((await request('/v2/auth/deactivate', { method: 'POST', headers: authorization })).status, 204);
  assert.equal((await get('/v2/wallet', authorization)).status, 401);
  assert.equal((await loginRequest()).status, 403);
  console.log(`api-next smoke: ${requests} HTTP requests; PostgreSQL recovery, guest identity, one-time grant, authenticated wallet access and session revocation verified.`);
} finally {
  await app.close();
}
