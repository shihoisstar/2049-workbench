import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ErrorCode, type GenerationTask, type TaskStatus } from '@wb/contracts';
import { isStuck, isTerminal, refundOnTerminal, transition } from '@wb/domain';

import type { Db } from './db';
import { generationTasks } from './schema';
import type { WalletService } from './wallet';

type TaskRow = typeof generationTasks.$inferSelect;

/** V0 估算:1 条 480P 预览 = 10 积分(placeholder,随 BIZ 定价校准);结算封顶于估算。 */
export const ESTIMATE_CREDITS = 10;

/** 卡单超时:running/queued 超过此时长由 sweep 自动取消退款(INF-03 D4)。 */
export const TASK_STUCK_TIMEOUT_MS = 10 * 60_000;
/** 模型错误重试上限(退避由队列 delay 实现)。 */
export const TASK_MAX_ATTEMPTS = 3;

export function toTaskView(row: TaskRow): GenerationTask {
  return {
    id: row.id,
    status: row.status as TaskStatus,
    prompt: row.prompt,
    resolution: row.resolution,
    durationSec: row.durationSec,
    estimateCredits: row.estimateCredits,
    attempts: row.attempts,
    videoUrl: row.videoUrl,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export interface CreateTaskInput {
  prompt: string;
  resolution: string;
  durationSec: number;
  model: string;
}

/**
 * 任务服务(T2.2):创建即冻结(INF-02 预留),状态迁移全部经 @wb/domain 状态机;
 * 失败/取消全额退(refundOnTerminal),卡单超时自动退(sweep)。
 */
export class TaskService {
  constructor(
    private readonly db: Db,
    private readonly wallet: WalletService,
  ) {}

  /** 创建:created → (冻结) → enqueue 由调用方完成;余额不足抛 402/3001。 */
  async create(userId: string, input: CreateTaskInput): Promise<{ task: GenerationTask; billingKey: string }> {
    const billingKey = `gen:${randomUUID()}`;
    await this.wallet.hold(userId, billingKey, ESTIMATE_CREDITS, {
      model: input.model,
      estimatedCostCents: ESTIMATE_CREDITS,
    });
    const row = (
      await this.db
        .insert(generationTasks)
        .values({
          userId,
          billingKey,
          status: 'created',
          prompt: input.prompt,
          resolution: input.resolution,
          durationSec: input.durationSec,
          model: input.model,
          estimateCredits: ESTIMATE_CREDITS,
        })
        .returning()
    )[0];
    return { task: toTaskView(row), billingKey };
  }

  /** 入队(created → queued)。冻结已在 create 完成,这里只迁移状态。 */
  async markQueued(taskId: string): Promise<void> {
    await this.apply(taskId, 'enqueue');
  }

  async get(userId: string, taskId: string): Promise<GenerationTask | null> {
    const row = (
      await this.db
        .select()
        .from(generationTasks)
        .where(and(eq(generationTasks.id, taskId), eq(generationTasks.userId, userId)))
        .limit(1)
    )[0];
    return row ? toTaskView(row) : null;
  }

  async list(userId: string, limit = 50): Promise<GenerationTask[]> {
    const rows = await this.db
      .select()
      .from(generationTasks)
      .where(eq(generationTasks.userId, userId))
      .orderBy(desc(generationTasks.createdAt))
      .limit(limit);
    return rows.map(toTaskView);
  }

  /** 用户取消:queued/running 可取消(卡单语义),成功后全额退。 */
  async cancel(userId: string, taskId: string): Promise<GenerationTask> {
    const row = await this.ownRow(userId, taskId);
    const status = row.status as TaskStatus;
    if (isTerminal(status)) {
      throw Object.assign(new Error('任务已终态'), { statusCode: 409, code: ErrorCode.TASK_ILLEGAL_TRANSITION });
    }
    const next = transition(status, 'cancel');
    await this.persist(taskId, next);
    if (refundOnTerminal(next)) {
      await this.wallet.refundAll(userId, row.billingKey);
    }
    const updated = await this.ownRow(userId, taskId);
    return toTaskView(updated);
  }

  /** worker/sweep 用:带状态机校验的迁移(refundOnTerminal 自动退款)。 */
  async apply(taskId: string, event: Parameters<typeof transition>[1]): Promise<TaskRow> {
    const row = (
      await this.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    )[0];
    if (!row) throw Object.assign(new Error('task not found'), { statusCode: 404, code: ErrorCode.TASK_NOT_FOUND });
    const next = transition(row.status as TaskStatus, event);
    return this.persist(taskId, next);
  }

  /** 卡单 sweep:超时未终态 → cancel + 全额退。返回处理数。 */
  async sweepStuck(now = Date.now()): Promise<number> {
    const rows = await this.db.select().from(generationTasks);
    let handled = 0;
    for (const row of rows) {
      const status = row.status as TaskStatus;
      if (isStuck(status, row.updatedAt.getTime(), now, TASK_STUCK_TIMEOUT_MS)) {
        const next = transition(status, 'cancel');
        await this.persist(row.id, next, { errorCode: 4003, errorMessage: '任务超时,自动取消并退积分' });
        if (refundOnTerminal(next)) await this.wallet.refundAll(row.userId, row.billingKey);
        handled += 1;
      }
    }
    return handled;
  }

  async ownRow(userId: string, taskId: string): Promise<TaskRow> {
    const row = (
      await this.db
        .select()
        .from(generationTasks)
        .where(and(eq(generationTasks.id, taskId), eq(generationTasks.userId, userId)))
        .limit(1)
    )[0];
    if (!row) throw Object.assign(new Error('task not found'), { statusCode: 404, code: ErrorCode.TASK_NOT_FOUND });
    return row;
  }

  private async persist(taskId: string, status: TaskStatus, extra?: Partial<TaskRow>): Promise<TaskRow> {
    const row = (
      await this.db
        .update(generationTasks)
        .set({ status, updatedAt: new Date(), ...extra })
        .where(eq(generationTasks.id, taskId))
        .returning()
    )[0];
    return row;
  }
}
