/**
 * 生成任务状态机(INF-03 / T2.2)——纯函数,零框架依赖。
 * 图形权威:docs/diagrams/diagrams-v1-20261003/v1-lifecycle.html;
 * V0 状态集与错误分类按 docs/specs/INF-03-生成任务系统.md §3。
 * 验收纪律:每条边都有测试(task-machine.test.ts)。
 */

export type TaskStatus = 'created' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type TaskEvent = 'enqueue' | 'start' | 'retry' | 'succeed' | 'fail' | 'cancel';

/** 状态转移表:表外事件一律非法(返回 null,由调用方拒绝)。 */
export const TRANSITIONS: Readonly<Record<TaskStatus, Partial<Record<TaskEvent, TaskStatus>>>> = {
  created: { enqueue: 'queued', cancel: 'canceled' },
  queued: { start: 'running', cancel: 'canceled' },
  running: { succeed: 'succeeded', fail: 'failed', retry: 'queued', cancel: 'canceled' },
  succeeded: {},
  failed: {},
  canceled: {},
};

/** 非法转移抛错(带码),合法返回新状态。 */
export function transition(status: TaskStatus, event: TaskEvent): TaskStatus {
  const next = TRANSITIONS[status][event];
  if (!next) {
    const err = new Error(`非法转移: ${status} --${event}--> ?`);
    Object.assign(err, { code: 4002 }); // TASK_ILLEGAL_TRANSITION
    throw err;
  }
  return next;
}

/** 终态判定。 */
export function isTerminal(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

/** 失败分类(INF-03:内容拒绝/余额不足不盲目重试;模型错误退避重试带上限)。 */
export type FailureClass = 'content_rejected' | 'insufficient_credits' | 'model_error';

export interface FailureSignal {
  /** 网关/业务错误码(contracts ErrorCode),可选 */
  code?: number;
  /** adapter 显式标注的类别(优先) */
  class?: FailureClass;
}

export function classifyFailure(signal: FailureSignal): FailureClass {
  if (signal.class) return signal.class;
  if (signal.code === 5001 || signal.code === 5002) return 'content_rejected';
  if (signal.code === 3001) return 'insufficient_credits';
  return 'model_error';
}

/** 重试决策:仅模型错误可重试,且不超过上限。 */
export function shouldRetry(cls: FailureClass, attempts: number, maxAttempts: number): boolean {
  return cls === 'model_error' && attempts < maxAttempts;
}

/** 退款语义:失败/取消即全额退(预留-结算的 hold 未结算)。 */
export function refundOnTerminal(status: TaskStatus): boolean {
  return status === 'failed' || status === 'canceled';
}

/** 卡单判定(INF-03:卡单可取消+超时自动退)。queued/running 超时即卡单。 */
export function isStuck(
  status: TaskStatus,
  updatedAtMs: number,
  nowMs: number,
  timeoutMs: number,
): boolean {
  if (isTerminal(status)) return false;
  return nowMs - updatedAtMs > timeoutMs;
}
