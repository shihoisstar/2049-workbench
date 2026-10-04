import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSITIONS,
  classifyFailure,
  isStuck,
  isTerminal,
  refundOnTerminal,
  shouldRetry,
  transition,
} from './task-machine';

/** 验收(工单 T2.2):状态机每条边有测试——本测试锁定完整边集,多边/少边都红。 */
test('状态机边集 = v1-lifecycle V0 定义(全量锁定)', () => {
  const actualEdges: string[] = [];
  for (const [from, events] of Object.entries(TRANSITIONS)) {
    for (const [event, to] of Object.entries(events)) {
      actualEdges.push(`${from} --${event}--> ${to}`);
    }
  }
  const expectedEdges = [
    'created --enqueue--> queued',
    'created --cancel--> canceled',
    'queued --start--> running',
    'queued --cancel--> canceled',
    'running --succeed--> succeeded',
    'running --fail--> failed',
    'running --retry--> queued',
    'running --cancel--> canceled',
  ];
  assert.deepEqual(actualEdges.sort(), [...expectedEdges].sort());
});

test('合法转移逐边走通;终态无出边', () => {
  assert.equal(transition('created', 'enqueue'), 'queued');
  assert.equal(transition('created', 'cancel'), 'canceled');
  assert.equal(transition('queued', 'start'), 'running');
  assert.equal(transition('queued', 'cancel'), 'canceled');
  assert.equal(transition('running', 'succeed'), 'succeeded');
  assert.equal(transition('running', 'fail'), 'failed');
  assert.equal(transition('running', 'retry'), 'queued');
  assert.equal(transition('running', 'cancel'), 'canceled');

  for (const s of ['succeeded', 'failed', 'canceled'] as const) {
    assert.ok(isTerminal(s));
    assert.deepEqual(TRANSITIONS[s], {}, `${s} 应无出边`);
  }
  assert.equal(isTerminal('running'), false);
});

test('非法转移抛 TASK_ILLEGAL_TRANSITION(4002)', () => {
  assert.throws(() => transition('created', 'succeed'), (e: { code?: number }) => e.code === 4002);
  assert.throws(() => transition('succeeded', 'retry'), (e: { code?: number }) => e.code === 4002);
  assert.throws(() => transition('queued', 'succeed'), (e: { code?: number }) => e.code === 4002);
});

test('失败分类:显式标注 > 错误码 > 默认模型错误', () => {
  assert.equal(classifyFailure({ class: 'content_rejected' }), 'content_rejected');
  assert.equal(classifyFailure({ code: 5001 }), 'content_rejected');
  assert.equal(classifyFailure({ code: 5002 }), 'content_rejected');
  assert.equal(classifyFailure({ code: 3001 }), 'insufficient_credits');
  assert.equal(classifyFailure({ code: 1000 }), 'model_error');
  assert.equal(classifyFailure({}), 'model_error');
});

test('重试决策:仅模型错误且未达上限', () => {
  assert.equal(shouldRetry('model_error', 0, 3), true);
  assert.equal(shouldRetry('model_error', 2, 3), true);
  assert.equal(shouldRetry('model_error', 3, 3), false, '达上限不重试');
  assert.equal(shouldRetry('content_rejected', 0, 3), false, '内容拒绝不重试');
  assert.equal(shouldRetry('insufficient_credits', 0, 3), false, '余额不足不重试');
});

test('终态退款语义:failed/canceled 全额退', () => {
  assert.equal(refundOnTerminal('failed'), true);
  assert.equal(refundOnTerminal('canceled'), true);
  assert.equal(refundOnTerminal('succeeded'), false);
  assert.equal(refundOnTerminal('running'), false);
});

test('卡单判定:queued/running 超时即卡单,终态永不卡单', () => {
  const t0 = 1_000_000;
  assert.equal(isStuck('running', t0, t0 + 60_001, 60_000), true);
  assert.equal(isStuck('queued', t0, t0 + 60_001, 60_000), true);
  assert.equal(isStuck('running', t0, t0 + 60_000, 60_000), false, '边界:恰好到期不算');
  assert.equal(isStuck('succeeded', t0, t0 + 999_999, 60_000), false);
});
