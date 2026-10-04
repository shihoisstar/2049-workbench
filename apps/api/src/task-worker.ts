/**
 * 任务 worker(T2.2):submit → poll 轮询 → 终态(结算/退款)。
 * 处理器与 BullMQ 解耦(handleX 依赖注入,可脱离 redis 单测);
 * 重试/退款语义全部经 @wb/domain task-machine;上游轮询失败原地续轮询(不重复受理)。
 */
import { eq } from 'drizzle-orm';
import { Worker, type Queue, type Worker as WorkerT } from 'bullmq';
import { ErrorCode } from '@wb/contracts';
import type { GatewayRouter } from '@wb/model-gateway';
import { classifyFailure, refundOnTerminal, shouldRetry } from '@wb/domain';

import { createRedisConnection, QUEUE_NAME, type TaskJobData } from './queue';
import type { Db } from './db';
import { generationTasks } from './schema';
import { TASK_MAX_ATTEMPTS, TaskService } from './tasks';
import type { WalletService } from './wallet';

export interface WorkerTimings {
  pollIntervalMs: number;
  retryBackoffMs: number;
}

export interface TaskWorkerDeps {
  db: Db;
  wallet: WalletService;
  tasks: TaskService;
  router: GatewayRouter;
  queue: Queue<TaskJobData>;
  timings: WorkerTimings;
}

type TaskRow = typeof generationTasks.$inferSelect;

async function loadRow(deps: TaskWorkerDeps, taskId: string): Promise<TaskRow | null> {
  const row = (await deps.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1))[0];
  if (!row) return null;
  const s = row.status as string;
  if (s === 'succeeded' || s === 'failed' || s === 'canceled') return null; // 终态幂等
  return row;
}

/** 失败收尾:fail 迁移(状态+错误信息原子落库)+ 全额退款(钱包侧 billingKey 幂等)。 */
async function failTask(deps: TaskWorkerDeps, taskId: string, userId: string, billingKey: string, code: number, message: string) {
  await deps.tasks.apply(taskId, 'fail', {
    errorCode: code,
    errorMessage: message.slice(0, 300),
    finishedAt: new Date(),
  });
  if (refundOnTerminal('failed')) {
    await deps.wallet.refundAll(userId, billingKey);
  }
}

/** 成功收尾:succeed 迁移(状态+videoUrl 原子落库)+ 结算(足额;差额退语义见钱包)。 */
async function succeedTask(deps: TaskWorkerDeps, taskId: string, userId: string, billingKey: string, estimate: number, videoUrl: string) {
  await deps.tasks.apply(taskId, 'succeed', { videoUrl, finishedAt: new Date() });
  await deps.wallet.settle(userId, billingKey, estimate, estimate);
}

/** submit 处理器:queued → running → 网关受理;失败按分类走 重试/终态退款。 */
export async function handleSubmitTask(deps: TaskWorkerDeps, taskId: string): Promise<void> {
  const row = await loadRow(deps, taskId);
  if (!row || row.status !== 'queued') return;

  await deps.tasks.apply(taskId, 'start'); // queued → running
  try {
    const res = await deps.router.dispatch({
      modelName: row.model,
      modelType: 'video',
      payload: { prompt: row.prompt, aspectRatio: row.aspectRatio, resolution: row.resolution, durationSec: row.durationSec },
      taskOperation: 'submit',
    });
    await deps.db
      .update(generationTasks)
      .set({ providerName: res.providerName, providerTaskId: res.providerTaskId, channelId: res.channelId, updatedAt: new Date() })
      .where(eq(generationTasks.id, taskId));
    await deps.queue.add('poll', { taskId }, { delay: deps.timings.pollIntervalMs, jobId: `poll:${taskId}:${Date.now()}` });
  } catch (e) {
    const err = e as { gatewayCode?: string; class?: 'content_rejected' | 'insufficient_credits' | 'model_error'; message?: string };
    const code = mapGatewayCode(err.gatewayCode);
    const cls = classifyFailure({ code, class: err.class });
    const attempts = row.attempts + 1;
    await deps.db.update(generationTasks).set({ attempts, updatedAt: new Date() }).where(eq(generationTasks.id, taskId));
    if (shouldRetry(cls, attempts, TASK_MAX_ATTEMPTS)) {
      await deps.tasks.apply(taskId, 'retry'); // running → queued
      await deps.queue.add('submit', { taskId }, { delay: deps.timings.retryBackoffMs * attempts });
      return;
    }
    await failTask(deps, taskId, row.userId, row.billingKey, code, err.message ?? '生成失败');
  }
}

/** poll 处理器:轮询受理渠道;成功结算/失败退款/继续轮询(轮询侧错误原地退避续轮询,不重复受理)。 */
export async function handlePollTask(deps: TaskWorkerDeps, taskId: string): Promise<void> {
  const row = await loadRow(deps, taskId);
  if (!row || row.status !== 'running' || !row.providerTaskId) return;

  try {
    const res = await deps.router.dispatch({
      modelName: row.model,
      modelType: 'video',
      payload: { providerTaskId: row.providerTaskId },
      taskOperation: 'poll',
      channelId: row.channelId ?? undefined,
    });
    const body = res.body as { status: 'queued' | 'processing' | 'succeeded' | 'failed'; videoUrl?: string };
    if (body.status === 'succeeded' && body.videoUrl) {
      await succeedTask(deps, taskId, row.userId, row.billingKey, row.estimateCredits, body.videoUrl);
      return;
    }
    if (body.status === 'failed') {
      await failTask(deps, taskId, row.userId, row.billingKey, ErrorCode.INTERNAL, '上游任务失败');
      return;
    }
    await deps.queue.add('poll', { taskId }, { delay: deps.timings.pollIntervalMs, jobId: `poll:${taskId}:${Date.now()}` });
  } catch (e) {
    // 轮询网络/上游瞬断:原地退避续轮询;卡单由 sweep 兜底(超时自动取消退款)
    await deps.queue.add('poll', { taskId }, { delay: deps.timings.pollIntervalMs * 2, jobId: `poll:${taskId}:${Date.now()}` });
    void e;
  }
}

/** sweep 处理器:卡单超时自动取消退款(D4)。 */
export async function handleSweep(deps: TaskWorkerDeps): Promise<number> {
  return deps.tasks.sweepStuck();
}

/** 组装 BullMQ Worker(独立进程运行;测试直接调 handleX 不经 redis)。 */
export function createTaskWorker(deps: TaskWorkerDeps, connection = createRedisConnection(process.env.REDIS_URL ?? 'redis://localhost:6379')): WorkerT<TaskJobData> {
  return new Worker<TaskJobData>(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'submit' && job.data.taskId) return handleSubmitTask(deps, job.data.taskId);
      if (job.name === 'poll' && job.data.taskId) return handlePollTask(deps, job.data.taskId);
      if (job.name === 'sweep') return handleSweep(deps);
    },
    { connection },
  );
}

/** gateway GatewayErrorCode → contracts ErrorCode(面向前端文案)。 */
function mapGatewayCode(code?: string): number {
  if (code === 'rate_limited') return ErrorCode.RATE_LIMITED;
  if (code === 'no_channel_available') return ErrorCode.QUEUE_FULL;
  return ErrorCode.INTERNAL;
}
