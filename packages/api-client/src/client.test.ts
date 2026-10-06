import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiError, createApiClient, type TransportRequest } from './index';

test('serializes JSON and headers for an injected platform transport', async () => {
  const requests: TransportRequest[] = [];
  const session = { token: 'token', userId: 'user', expiresInSec: 3600 };
  const client = createApiClient({ baseUrl: 'https://example.test/', transport: async (request) => {
    requests.push(request);
    return { status: 200, body: session };
  } });
  assert.deepEqual(await client.request('post', '/v1/auth/guest', {
    body: { deviceId: 'device-123' }, headers: { Authorization: 'Bearer test' },
  }), session);
  assert.deepEqual(requests, [{
    method: 'POST', url: 'https://example.test/v1/auth/guest',
    headers: { accept: 'application/json', authorization: 'Bearer test', 'content-type': 'application/json' },
    body: '{"deviceId":"device-123"}',
  }]);
});

test('encodes path parameters as one path segment and rejects missing values', async () => {
  const requests: TransportRequest[] = [];
  const client = createApiClient({ baseUrl: '', transport: async (request) => {
    requests.push(request);
    return { status: 200, body: {} };
  } });
  await client.request('get', '/v1/tasks/{id}', { path: { id: 'a/b ?中' } });
  assert.equal(requests[0]?.url, '/v1/tasks/a%2Fb%20%3F%E4%B8%AD');
  // @ts-expect-error Required path parameters must also be guarded at runtime for JS callers.
  await assert.rejects(client.request('get', '/v1/tasks/{id}', {}), /Missing path parameter: id/);
  assert.equal(requests.length, 1);
});

test('non-2xx preserves status and body without retrying a paid POST', async () => {
  let count = 0;
  const body = { code: 500, message: 'provider unavailable' };
  const client = createApiClient({ baseUrl: '', transport: async () => {
    count++;
    return { status: 503, body };
  } });
  await assert.rejects(client.request('post', '/v1/tasks', {
    body: { prompt: 'test', aspectRatio: '9:16', resolution: '720p', durationSec: 5 },
  }), (error: unknown) => error instanceof ApiError && error.status === 503 && error.body === body);
  assert.equal(count, 1);
});

test('204 returns undefined even if the platform supplies an empty response body', async () => {
  const client = createApiClient({ baseUrl: '', transport: async () => ({ status: 204, body: '' }) });
  assert.equal(await client.request('post', '/v1/auth/deactivate'), undefined);
});

test('rejects non-JSON content types before sending', async () => {
  let count = 0;
  const client = createApiClient({ baseUrl: '', transport: async () => {
    count++;
    return { status: 200 };
  } });
  await assert.rejects(client.request('post', '/v1/auth/guest', {
    body: { deviceId: 'device-123' }, headers: { 'Content-Type': 'multipart/form-data' },
  }), /application\/json/);
  assert.equal(count, 0);
});

test('propagates transport rejection without replaying the request', async () => {
  const failure = new Error('connection lost');
  let count = 0;
  const client = createApiClient({ baseUrl: '', transport: async () => { count++; throw failure; } });
  await assert.rejects(client.request('get', '/healthz'), (error: unknown) => error === failure);
  assert.equal(count, 1);
});
