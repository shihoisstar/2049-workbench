import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canHold, invariantHolds, ledgerSum, settleAdjustment } from './wallet';

test('不变式:余额=流水之和(grant/hold/settle/refund 混合)', () => {
  const entries = [
    { type: 'grant', amount: 100 },
    { type: 'hold', amount: -40 },
    { type: 'settle', amount: 5 },
  ] as const;
  assert.equal(ledgerSum([...entries]), 65);
  assert.ok(invariantHolds(65, [...entries]));
  assert.equal(invariantHolds(64, [...entries]), false);
});

test('结算差额:实际低于冻结 → 正差额退回;足额 → 0;超耗 → 抛错(V0 封顶)', () => {
  assert.equal(settleAdjustment(40, 35), 5);
  assert.equal(settleAdjustment(40, 40), 0);
  assert.throws(() => settleAdjustment(40, 41));
});

test('结算差额:非法输入抛错', () => {
  assert.throws(() => settleAdjustment(0, 1));
  assert.throws(() => settleAdjustment(10, -1));
});

test('canHold:余额足够且估算为正才可冻结', () => {
  assert.equal(canHold(100, 40), true);
  assert.equal(canHold(39, 40), false);
  assert.equal(canHold(100, 0), false);
});
