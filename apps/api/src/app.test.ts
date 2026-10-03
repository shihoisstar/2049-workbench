import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from './app';

/**
 * 集成测试:需本地 postgres(infra/docker-compose,宿主端口 5433)。
 * 验收链路(T1.1):游客登录幂等 → 注销 → 同 deviceId 重新注册为新用户;未带凭证注销被拒。
 */
const app = buildApp({
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://wb:wb_dev_only@localhost:5433/workbench',
  jwtSecret: 'test-secret',
});

after(async () => {
  await app.close();
});

const DEVICE_ID = `t11-test-${Date.now()}`;

test('GET /healthz 返回契约形状', async () => {
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(['ok', 'degraded'].includes(body.status));
  assert.equal(typeof body.uptimeSec, 'number');
});

test('POST /v1/auth/guest:登录幂等(同 deviceId 同 userId)', async () => {
  const r1 = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: DEVICE_ID } });
  assert.equal(r1.statusCode, 200);
  const s1 = r1.json();
  assert.equal(typeof s1.token, 'string');
  assert.ok(s1.expiresInSec > 0);

  const r2 = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: DEVICE_ID } });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().userId, s1.userId);
});

test('POST /v1/auth/guest:非法参数被拒(ErrorBody 契约)', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: 'x' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 1001);
});

test('POST /v1/auth/deactivate:无凭证 401 → 带凭证 204 → 同 deviceId 重登录为新用户', async () => {
  const noAuth = await app.inject({ method: 'POST', url: '/v1/auth/deactivate' });
  assert.equal(noAuth.statusCode, 401);

  const login = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: DEVICE_ID } });
  const { token, userId } = login.json();

  const deactiv = await app.inject({
    method: 'POST',
    url: '/v1/auth/deactivate',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(deactiv.statusCode, 204);

  const relogin = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: DEVICE_ID } });
  assert.equal(relogin.statusCode, 200);
  assert.notEqual(relogin.json().userId, userId, '注销后同 deviceId 应注册为新用户');
});
