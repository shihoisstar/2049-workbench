import { createApiClient } from './index';

// Compiled, never executed: types must come from generated OpenAPI operations.
async function check(client: ReturnType<typeof createApiClient>) {
  const session = await client.request('post', '/v1/auth/guest', { body: { deviceId: 'device-123' } });
  const token: string = session.token;
  // @ts-expect-error Success response types must not degrade to any.
  const invalidToken: number = session.token;
  void token;
  void invalidToken;
  client.request('get', '/healthz');
  client.request('get', '/v1/tasks/{id}', { path: { id: 'task-id' } });
  client.request('post', '/v1/tasks', {
    body: { prompt: 'test', aspectRatio: '9:16', resolution: '720p', durationSec: 5 },
  });
  // @ts-expect-error No such API path.
  client.request('get', '/missing');
  // @ts-expect-error No POST health operation.
  client.request('post', '/healthz');
  // @ts-expect-error Required JSON body missing.
  client.request('post', '/v1/auth/guest');
  // @ts-expect-error Required deviceId missing.
  client.request('post', '/v1/auth/guest', { body: {} });
  // @ts-expect-error Path parameter required.
  client.request('get', '/v1/tasks/{id}');
  // @ts-expect-error Wrong path parameter name.
  client.request('get', '/v1/tasks/{id}', { path: { taskId: 'id' } });
  // @ts-expect-error Query parameters not supported by this operation.
  client.request('get', '/healthz', { query: { page: 1 } });
  // @ts-expect-error No body on GET health.
  client.request('get', '/healthz', { body: {} });
  // @ts-expect-error Resolution constrained by generated enum.
  client.request('post', '/v1/tasks', { body: { prompt: 'test', aspectRatio: '9:16', resolution: '4k', durationSec: 5 } });
  // @ts-expect-error Duration is numeric (range constraints stay runtime validators).
  client.request('post', '/v1/tasks', { body: { prompt: 'test', aspectRatio: '9:16', resolution: '720p', durationSec: '5' } });
  // @ts-expect-error Binary multipart upload is handled outside this JSON client.
  client.request('post', '/v1/uploads', { body: {} });
}
void check;
