import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from './app';
import { createDb } from './db';
import { users } from './schema';
import { WalletService } from './wallet';

/**
 * T1.2 验收链路:每笔生成可查 估算/冻结/实扣/退款 全链路。
 * 附加守护:幂等重放不重复扣费;不变式 balance = SUM(credit_logs.amount)。
 */
const url = process.env.DATABASE_URL ?? 'postgres://wb:wb_dev_only@localhost:5433/workbench';
const { db, client } = createDb(url);
const wallet = new WalletService(db);
const app = buildApp({ databaseUrl: url, jwtSecret: 'test-secret' });

let userId = '';

/** billing_key 全局唯一(2049 模式):测试键必须带运行标识,防跨运行冲突。 */
const RUN = Date.now().toString(36);

before(async () => {
  const inserted = await db
    .insert(users)
    .values({ deviceId: `t12-test-${Date.now()}` })
    .returning();
  userId = inserted[0].id;
});

after(async () => {
  await app.close(); // 关 fastify 侧池
  await client.end();
});

test('全链路:发放→冻结→结算(退差)→流水四态可查→不变式成立', async () => {
  assert.equal(await wallet.grant(userId, 100, 'signup-grant:' + RUN, '注册赠送'), true);

  await wallet.hold(userId, 'gen-1:' + RUN, 40, { model: 'seedance-2.0', estimatedCostCents: 40 });
  await wallet.settle(userId, 'gen-1:' + RUN, 35, 35);

  const s = await wallet.summary(userId);
  assert.equal(s.balance, 65, '100 - 40(冻结) + 5(退差) = 65(净耗 35)');
  const settle = s.entries.find((e) => e.type === 'settle');
  assert.equal(settle?.amount, 5);
  assert.ok(await wallet.verifyInvariant(userId), '不变式:余额=流水之和');
});

test('失败全额退回:hold→refundAll,余额复原', async () => {
  await wallet.hold(userId, 'gen-2:' + RUN, 30, { model: 'seedance-2.0', estimatedCostCents: 30 });
  await wallet.refundAll(userId, 'gen-2:' + RUN);
  const s = await wallet.summary(userId);
  assert.equal(s.balance, 65, '失败任务余额复原');
  assert.ok(await wallet.verifyInvariant(userId));
});

test('幂等:重复 hold / 重复 settle / 重复 grant 不二次变动', async () => {
  const before = (await wallet.summary(userId)).balance;

  await wallet.hold(userId, 'gen-3:' + RUN, 20, { model: 'seedance-2.0', estimatedCostCents: 20 });
  await wallet.hold(userId, 'gen-3:' + RUN, 20, { model: 'seedance-2.0', estimatedCostCents: 20 }); // 重放
  assert.equal((await wallet.summary(userId)).balance, before - 20, '重放不二次冻结');

  await wallet.settle(userId, 'gen-3:' + RUN, 20);
  await wallet.settle(userId, 'gen-3:' + RUN, 20); // 重放
  assert.equal((await wallet.summary(userId)).balance, before - 20, '足额结算净耗 20,重放不再变动');

  assert.equal(await wallet.grant(userId, 5, 'dup:' + RUN), true);
  assert.equal(await wallet.grant(userId, 5, 'dup:' + RUN), false, '重复 grant 被唯一约束拒绝');
  assert.equal((await wallet.summary(userId)).balance, before - 20 + 5, '净:gen-3 消耗 20 + 赠送 5');
  assert.ok(await wallet.verifyInvariant(userId));
});

test('余额不足:hold 抛 INSUFFICIENT_CREDITS(402)', async () => {
  const balance = (await wallet.summary(userId)).balance;
  await assert.rejects(
    () => wallet.hold(userId, 'gen-4:' + RUN, balance + 1, { model: 'seedance-2.0', estimatedCostCents: 0 }),
    (e: { code?: number }) => e.code === 3001,
  );
});

test('违规操作:无 hold 的 settle / 已结算的 refundAll → HOLD_CONFLICT', async () => {
  await assert.rejects(
    () => wallet.settle(userId, 'no-hold:' + RUN, 10),
    (e: { code?: number }) => e.code === 3002,
  );
  await assert.rejects(
    () => wallet.refundAll(userId, 'gen-1:' + RUN), // gen-001 已结算
    (e: { code?: number }) => e.code === 3002,
  );
});

test('路由:GET /v1/wallet 返回契约形状', async () => {
  const login = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: { deviceId: `t12-route-${Date.now()}` } });
  const { token } = login.json();
  // 直接为该路由测试用户造一笔流水
  const routeUserId = JSON.parse(
    Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'),
  ).sub;
  const w = new WalletService(db);
  await w.grant(routeUserId, 10, 'route:' + RUN);

  const res = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.balance, 20, '注册赠送 10 + 本测试发放 10');
  assert.equal(body.entries.length, 2);
  assert.ok(body.entries.every((e: { type: string }) => e.type === 'grant'));
  assert.equal(typeof body.entries[0].createdAt, 'string');
});
