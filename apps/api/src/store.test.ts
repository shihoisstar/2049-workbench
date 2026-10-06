import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from './app';
import { createDb } from './db';
import { users } from './schema';
import { WalletService } from './wallet';

/**
 * T1.4 验收:充值闭环(开发态)——档位/下单/支付入账/幂等/越权。
 * 真实微信支付(商户号)在阻塞墙;订单状态机与入账链路在此定型。
 */
const url = process.env.DATABASE_URL ?? 'postgres://wb:wb_dev_only@localhost:5433/workbench';
const { db, client } = createDb(url);
const app = buildApp({ databaseUrl: url, jwtSecret: 'test-secret' });
const wallet = new WalletService(db);

let token = '';
let userId = '';

before(async () => {
  const inserted = await db
    .insert(users)
    .values({ deviceId: `t14-test-${Date.now()}` })
    .returning();
  userId = inserted[0].id;
});

after(async () => {
  await app.close();
  await client.end();
});

test('GET /v1/store/packages:三档上架', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/store/packages' });
  assert.equal(res.statusCode, 200);
  const { packages } = res.json();
  assert.equal(packages.length, 3);
  assert.deepEqual(
    packages.map((p: { id: string }) => p.id),
    ['pkg-60', 'pkg-300', 'pkg-980'],
  );
});

test('下单→开发态支付→积分入账+流水;重复支付幂等', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/guest',
    payload: { deviceId: `t14-login-${Date.now()}` },
  });
  token = login.json().token;
  userId = login.json().userId;
  const before = (await wallet.summary(userId)).balance; // 含注册赠送 80

  const created = await app.inject({
    method: 'POST',
    url: '/v1/store/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: { packageId: 'pkg-60' },
  });
  assert.equal(created.statusCode, 201);
  const order = created.json();
  assert.equal(order.status, 'created');
  assert.equal(order.credits, 60);

  const paid = await app.inject({
    method: 'POST',
    url: `/v1/store/orders/${order.id}/dev-pay`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(paid.statusCode, 200);
  assert.equal(paid.json().status, 'paid');

  const afterPay = await wallet.summary(userId);
  assert.equal(afterPay.balance, before + 60, '注册赠送 + 60');
  const grantEntry = afterPay.entries.find((e) => e.billingKey === `order:${order.id}`);
  assert.ok(grantEntry, '充值入账流水可查');

  const replay = await app.inject({
    method: 'POST',
    url: `/v1/store/orders/${order.id}/dev-pay`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(replay.statusCode, 200);
  assert.equal((await wallet.summary(userId)).balance, before + 60, '重放不重复入账');
  assert.ok(await wallet.verifyInvariant(userId));
});

test('错误档位下单 404;未登录 401;他人订单支付 404', async () => {
  const bad = await app.inject({
    method: 'POST',
    url: '/v1/store/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: { packageId: 'pkg-not-exist' },
  });
  assert.equal(bad.statusCode, 404);
  assert.equal(Number(bad.json().code), 1002);

  const noAuth = await app.inject({ method: 'POST', url: '/v1/store/orders', payload: { packageId: 'pkg-60' } });
  assert.equal(noAuth.statusCode, 401);

  // 另一个用户的 token 支付他人订单
  const other = await app.inject({
    method: 'POST',
    url: '/v1/auth/guest',
    payload: { deviceId: `t14-other-${Date.now()}` },
  });
  const mine = await app.inject({
    method: 'GET',
    url: '/v1/store/orders',
    headers: { authorization: `Bearer ${token}` },
  });
  const anyOrder = mine.json().orders[0];
  const foreign = await app.inject({
    method: 'POST',
    url: `/v1/store/orders/${anyOrder.id}/dev-pay`,
    headers: { authorization: `Bearer ${other.json().token}` },
  });
  assert.equal(foreign.statusCode, 404, '越权视为不存在');
});

test('GET /v1/store/orders:我的订单列表', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/store/orders', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const { orders } = res.json();
  assert.ok(orders.length >= 1);
  assert.ok(orders.every((o: { status: string }) => ['created', 'paid', 'closed'].includes(o.status)));
});
