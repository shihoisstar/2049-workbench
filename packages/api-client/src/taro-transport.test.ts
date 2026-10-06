import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createTaroTransport, type TaroJsonRequest } from './taro-transport';

test('Taro adapter sends the serialized JSON string and decodes H5 JSON text', async () => {
  const calls: TaroJsonRequest[] = [];
  const transport = createTaroTransport(async (options) => {
    calls.push(options);
    return { statusCode: 201, data: '{"id":"created"}' };
  });
  assert.deepEqual(await transport({
    method: 'POST', url: '/v1/tasks', headers: { 'content-type': 'application/json' }, body: '{"prompt":"test"}',
  }), { status: 201, body: { id: 'created' } });
  assert.deepEqual(calls, [{
    method: 'POST', url: '/v1/tasks', header: { 'content-type': 'application/json' },
    data: '{"prompt":"test"}', dataType: 'json', responseType: 'text',
  }]);
});

test('Taro adapter preserves decoded objects and non-2xx statusCode', async () => {
  const body = { code: 2001, message: 'unauthorized' };
  const transport = createTaroTransport(async () => ({ statusCode: 401, data: body }));
  const result = await transport({ method: 'GET', url: '/v1/wallet', headers: {} });
  assert.equal(result.status, 401);
  assert.equal(result.body, body);
});

test('Taro adapter preserves non-JSON gateway errors', async () => {
  const transport = createTaroTransport(async () => ({ statusCode: 502, data: '<html>Bad gateway</html>' }));
  assert.deepEqual(await transport({ method: 'GET', url: '/healthz', headers: {} }), {
    status: 502, body: '<html>Bad gateway</html>',
  });
});

test('Taro adapter does not replay requests after network failure', async () => {
  const error = { errMsg: 'request:fail timeout' };
  let count = 0;
  const transport = createTaroTransport(async () => { count++; throw error; });
  await assert.rejects(transport({ method: 'POST', url: '/v1/tasks', headers: {}, body: '{}' }),
    (received: unknown) => received === error);
  assert.equal(count, 1);
});

test('Taro adapter treats 204 as no content and omits data when no request body exists', async () => {
  const transport = createTaroTransport(async (options) => {
    assert.equal(Object.hasOwn(options, 'data'), false);
    return { statusCode: 204, data: '' };
  });
  assert.deepEqual(await transport({ method: 'POST', url: '/v1/auth/deactivate', headers: {} }), {
    status: 204, body: undefined,
  });
});

function checkMethod(transport: ReturnType<typeof createTaroTransport>) {
  // @ts-expect-error Only the supported uppercase HTTP methods reach Taro.
  transport({ method: 'post', url: '/v1/tasks', headers: {} });
  // @ts-expect-error Arbitrary HTTP method strings are forbidden.
  transport({ method: 'INVALID', url: '/v1/tasks', headers: {} });
}
void checkMethod;
