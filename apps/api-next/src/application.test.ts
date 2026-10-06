import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorBody, ErrorCode, HealthResponse } from '@wb/contracts';
import { createApplication } from './application';
import { readConfig } from './config';
import type { DatabaseConnection } from './database';

const config = readConfig({ API_NEXT_DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/api_next_test' });

async function testApplication(database: DatabaseConnection) {
  const app = await createApplication({ config, database });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

test('liveness does not query the database; readiness does; close releases the resource', async () => {
  let probes = 0;
  let closes = 0;
  const app = await testApplication({
    async probe() { probes += 1; },
    async close() { closes += 1; },
  });
  try {
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(live.statusCode, 200);
    assert.equal(HealthResponse.parse(live.json()).status, 'ok');
    assert.equal(probes, 0);
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    assert.equal(ready.statusCode, 200);
    assert.equal(HealthResponse.parse(ready.json()).status, 'ok');
    assert.equal(probes, 1);
  } finally {
    await app.close();
  }
  assert.equal(closes, 1);
});

test('database failure returns a sanitized 503 and recovers on the next probe', async () => {
  let failing = true;
  const app = await testApplication({
    async probe() {
      if (failing) throw new Error('postgres://secret:password@private-host/internal');
    },
    async close() {},
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(ErrorBody.parse(response.json()), {
      code: ErrorCode.INTERNAL, message: 'Service unavailable',
      requestId: response.headers['x-request-id'],
    });
    assert.doesNotMatch(response.body, /secret|password|private-host|stack/);
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(live.statusCode, 200);
    failing = false;
    assert.equal((await app.inject({ method: 'GET', url: '/readyz' })).statusCode, 200);
  } finally {
    await app.close();
  }
});

test('404 uses the contract and request IDs are server generated and distinct', async () => {
  const app = await testApplication({ async probe() {}, async close() {} });
  try {
    const responses = await Promise.all([1, 2].map(() => app.inject({
      method: 'GET', url: '/private-token', headers: { 'x-request-id': 'untrusted-input' },
    })));
    for (const response of responses) {
      assert.equal(response.statusCode, 404);
      const body = ErrorBody.parse(response.json());
      assert.equal(body.code, ErrorCode.NOT_FOUND);
      assert.equal(body.requestId, response.headers['x-request-id']);
      assert.match(body.requestId ?? '', /^[0-9a-f-]{36}$/);
      assert.doesNotMatch(response.body, /untrusted-input|private-token/);
    }
    assert.notEqual(responses[0].headers['x-request-id'], responses[1].headers['x-request-id']);
  } finally {
    await app.close();
  }
});

test('unexpected application errors produce a sanitized 500', async () => {
  const app = await createApplication({ config, database: { async probe() {}, async close() {} } });
  app.useGlobalInterceptors({ intercept() { throw new Error('sensitive-user-prompt-and-api-key'); } });
  try {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(ErrorBody.parse(response.json()), {
      code: ErrorCode.INTERNAL, message: 'Internal server error',
      requestId: response.headers['x-request-id'],
    });
    assert.doesNotMatch(response.body, /sensitive|prompt|api-key|stack/);
  } finally {
    await app.close();
  }
});

test('configuration requires an explicit database and validates port without coercion', () => {
  assert.equal(config.port, 3011);
  assert.equal(readConfig({ API_NEXT_DATABASE_URL: config.databaseUrl, API_NEXT_PORT: '65535' }).port, 65535);
  assert.throws(() => readConfig({ DATABASE_URL: config.databaseUrl }), /API_NEXT_DATABASE_URL is required/);
  for (const port of ['', '0', '-1', '65536', '3011x', '3.5', ' 3011', '1e3']) {
    assert.throws(() => readConfig({ API_NEXT_DATABASE_URL: config.databaseUrl, API_NEXT_PORT: port }), /API_NEXT_PORT/);
  }
  for (const databaseUrl of ['not-a-url', 'https://example.com/db', 'postgres://localhost/', 'postgres://localhost/db#secret']) {
    assert.throws(() => readConfig({ API_NEXT_DATABASE_URL: databaseUrl }), /API_NEXT_DATABASE_URL/);
  }
});

test('malformed JSON returns a sanitized contract error with HTTP 400', async () => {
  const app = await testApplication({ async probe() {}, async close() {} });
  try {
    const response = await app.inject({
      method: 'POST', url: '/healthz', headers: { 'content-type': 'application/json' },
      payload: '{"sensitive-prompt":',
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(ErrorBody.parse(response.json()), {
      code: ErrorCode.VALIDATION, message: 'Invalid request', requestId: response.headers['x-request-id'],
    });
    assert.doesNotMatch(response.body, /sensitive|SyntaxError|stack/);
  } finally {
    await app.close();
  }
});

test('oversized JSON is a client validation error with HTTP 413', async () => {
  const app = await testApplication({ async probe() {}, async close() {} });
  try {
    const response = await app.inject({
      method: 'POST', url: '/healthz', headers: { 'content-type': 'application/json' },
      payload: JSON.stringify('a'.repeat(1024 * 1024)),
    });
    assert.equal(response.statusCode, 413);
    assert.equal(ErrorBody.parse(response.json()).code, ErrorCode.VALIDATION);
  } finally {
    await app.close();
  }
});

test('invalid URL errors before routing use the contract without echoing the URL', async () => {
  const app = await testApplication({ async probe() {}, async close() {} });
  try {
    const response = await app.inject({
      method: 'GET', url: '/private-token/%ZZ', headers: { 'x-request-id': 'untrusted-input' },
    });
    assert.equal(response.statusCode, 400);
    const body = ErrorBody.parse(response.json());
    assert.equal(body.code, ErrorCode.VALIDATION);
    assert.match(body.requestId ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(body.requestId, response.headers['x-request-id']);
    assert.doesNotMatch(response.body, /private-token|%ZZ|FST_ERR|untrusted-input/);
  } finally {
    await app.close();
  }
});
