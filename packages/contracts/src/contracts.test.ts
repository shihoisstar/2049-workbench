import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_VERSION,
  buildOpenApiDocument,
  endpointList,
  ErrorBody,
  ErrorCode,
  GuestLoginRequest,
  GuestSession,
  HealthResponse,
} from './index';

test('错误码唯一且在已分配段位内', () => {
  const values = Object.values(ErrorCode);
  assert.equal(new Set(values).size, values.length, '错误码有重复');
  for (const [name, code] of Object.entries(ErrorCode)) {
    assert.ok(code >= 1000 && code < 10000, `${name}=${code} 超出段位`);
  }
});

test('ErrorBody 接受合法错误并拒绝未知错误码', () => {
  const body = { code: ErrorCode.INSUFFICIENT_CREDITS, message: '积分不足' };
  assert.equal(ErrorBody.parse(body).code, 3001);
  assert.equal(ErrorBody.safeParse({ code: 9999, message: 'x' }).success, false);
});

test('HealthResponse 往返解析且拒绝非法状态', () => {
  const sample = { status: 'ok', apiVersion: API_VERSION, uptimeSec: 12 };
  assert.equal(HealthResponse.parse(sample).status, 'ok');
  assert.equal(
    HealthResponse.safeParse({ status: 'down', apiVersion: 'v1', uptimeSec: 1 }).success,
    false,
  );
});

test('auth:游客登录契约往返与校验', () => {
  assert.equal(GuestLoginRequest.parse({ deviceId: 'abcd1234' }).deviceId, 'abcd1234');
  assert.equal(GuestLoginRequest.safeParse({ deviceId: 'short' }).success, false);
  const session: GuestSession = GuestSession.parse({
    token: 't',
    userId: 'u1',
    expiresInSec: 3600,
  });
  assert.equal(session.expiresInSec, 3600);
  assert.equal(GuestSession.safeParse({ token: 't', userId: 'u1', expiresInSec: 0 }).success, false);
});

test('openapi:端点注册表与错误引用', () => {
  const doc = buildOpenApiDocument();
  const eps = endpointList(doc);
  assert.ok(eps.includes('GET /healthz'), '缺 /healthz');
  assert.ok(eps.includes('POST /v1/auth/guest'), '缺 /v1/auth/guest');
  assert.ok(JSON.stringify(doc.components.schemas.ErrorBody).includes('code'), 'ErrorBody 未引用 code');
});
