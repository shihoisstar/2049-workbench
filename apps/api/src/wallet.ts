import { and, desc, eq, sum } from 'drizzle-orm';
import { ErrorCode } from '@wb/contracts';
import { canHold, settleAdjustment } from '@wb/domain';

import type { Db, Tx } from './db';
import { creditLogs, usageLogs, wallets } from './schema';

export type WalletEntry = {
  billingKey: string;
  type: string;
  amount: number;
  remark: string | null;
  createdAt: Date;
};

/**
 * 积分钱包服务(INF-02 / T1.2):预留-结算 + 三账本,事务双写。
 * 大厂纪律:所有余额变动只经本服务入口;余额表与流水表同事务提交,
 * 不变式 balance = SUM(credit_logs.amount) 由测试守护。
 */
export class WalletService {
  constructor(private readonly db: Db) {}

  /** 发放(注册赠送/充值入账)。幂等:同 billingKey 重复调用返回 false。 */
  async grant(userId: string, amount: number, billingKey: string, remark?: string): Promise<boolean> {
    return this.db.transaction((tx) => this.grantTx(tx, userId, amount, billingKey, remark));
  }

  /** 跨服务事务内入账(如订单支付:订单置 paid 与积分入账同一事务)。幂等同 grant。 */
  async grantTx(tx: Tx, userId: string, amount: number, billingKey: string, remark?: string): Promise<boolean> {
    if (amount <= 0) throw new Error('grant amount must be positive');
    const dup = await this.findEntry(tx, userId, billingKey, 'grant');
    if (dup) return false;
    const inserted = await this.insertEntry(tx, userId, { billingKey, type: 'grant', amount, remark });
    if (!inserted) return false;
    await this.applyBalance(tx, userId, amount);
    return true;
  }

  /** 冻结(生成前,估算上限)。余额不足抛 INSUFFICIENT_CREDITS;重复 billingKey 幂等返回(已冻结)。 */
  async hold(userId: string, billingKey: string, estimate: number, usage: { model: string; estimatedCostCents: number }): Promise<void> {
    if (estimate <= 0) throw new Error('hold estimate must be positive');
    await this.db.transaction(async (tx) => {
      const dup = await this.findEntry(tx, userId, billingKey, 'hold');
      if (dup) return; // 幂等:重放(如前端重试)不二次冻结

      const balance = await this.getBalance(tx, userId);
      if (!canHold(balance, estimate)) {
        throw Object.assign(new Error('insufficient credits'), { statusCode: 402, code: ErrorCode.INSUFFICIENT_CREDITS });
      }
      await tx.insert(usageLogs).values({
        userId,
        billingKey,
        model: usage.model,
        estimatedCostCents: usage.estimatedCostCents,
      });
      const inserted = await this.insertEntry(tx, userId, { billingKey, type: 'hold', amount: -estimate, remark: '冻结(估算上限)' });
      if (!inserted) return;
      await this.applyBalance(tx, userId, -estimate);
    });
  }

  /** 结算(生成完成,按实际用量):settle 条目=差额退回(估算-实际,≥0);重复结算幂等。 */
  async settle(userId: string, billingKey: string, actual: number, actualCostCents?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const dup = await this.findEntry(tx, userId, billingKey, 'settle');
      if (dup) return; // 幂等

      const holdEntry = await this.findEntry(tx, userId, billingKey, 'hold');
      if (!holdEntry) throw Object.assign(new Error('no hold found'), { statusCode: 409, code: ErrorCode.HOLD_CONFLICT });

      const estimate = -holdEntry.amount;
      const adjustment = settleAdjustment(estimate, actual);
      const settled = await this.insertEntry(tx, userId, {
        billingKey,
        type: 'settle',
        amount: adjustment,
        remark: adjustment > 0 ? '结算退差(估算-实际)' : '结算足额',
      });
      if (!settled) return;
      if (adjustment > 0) {
        await this.applyBalance(tx, userId, adjustment);
      }
      if (actualCostCents !== undefined) {
        await tx.update(usageLogs).set({ actualCostCents }).where(and(eq(usageLogs.billingKey, billingKey), eq(usageLogs.userId, userId)));
      }
    });
  }

  /** 全额退回(生成失败)。无冻结或已结算时抛 HOLD_CONFLICT;重复退回幂等。 */
  async refundAll(userId: string, billingKey: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const dup = await this.findEntry(tx, userId, billingKey, 'refund');
      if (dup) return; // 幂等

      const holdEntry = await this.findEntry(tx, userId, billingKey, 'hold');
      if (!holdEntry) throw Object.assign(new Error('no hold found'), { statusCode: 409, code: ErrorCode.HOLD_CONFLICT });
      const settled = await this.findEntry(tx, userId, billingKey, 'settle');
      if (settled) throw Object.assign(new Error('already settled'), { statusCode: 409, code: ErrorCode.HOLD_CONFLICT });

      const refundAmount = -holdEntry.amount;
      const inserted = await this.insertEntry(tx, userId, { billingKey, type: 'refund', amount: refundAmount, remark: '退回(失败全额)' });
      if (!inserted) return;
      await this.applyBalance(tx, userId, refundAmount);
    });
  }

  /** 概览:余额 + 最近流水(前端 T1.3 积分明细页数据源)。 */
  async summary(userId: string, limit = 20): Promise<{ balance: number; entries: WalletEntry[] }> {
    const balance = await this.getBalance(this.db, userId);
    const rows = await this.db
      .select({
        billingKey: creditLogs.billingKey,
        type: creditLogs.type,
        amount: creditLogs.amount,
        remark: creditLogs.remark,
        createdAt: creditLogs.createdAt,
      })
      .from(creditLogs)
      .where(eq(creditLogs.userId, userId))
      .orderBy(desc(creditLogs.createdAt))
      .limit(limit);
    return { balance, entries: rows };
  }

  /** 不变式校验(测试/对账用):余额表 vs 流水求和。 */
  async verifyInvariant(userId: string): Promise<boolean> {
    const balance = await this.getBalance(this.db, userId);
    const aggregated = await this.db
      .select({ total: sum(creditLogs.amount) })
      .from(creditLogs)
      .where(eq(creditLogs.userId, userId));
    return balance === Number(aggregated[0]?.total ?? 0);
  }

  private async getBalance(tx: Db | Tx, userId: string): Promise<number> {
    const rows = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return rows[0]?.balance ?? 0;
  }

  private async applyBalance(tx: Tx, userId: string, delta: number): Promise<void> {
    const existing = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    if (existing[0]) {
      await tx
        .update(wallets)
        .set({ balance: existing[0].balance + delta, updatedAt: new Date() })
        .where(eq(wallets.userId, userId));
    } else {
      await tx.insert(wallets).values({ userId, balance: delta });
    }
  }

  private async findEntry(tx: Tx, userId: string, billingKey: string, type: string) {
    const rows = await tx
      .select()
      .from(creditLogs)
      .where(and(eq(creditLogs.userId, userId), eq(creditLogs.billingKey, billingKey), eq(creditLogs.type, type)))
      .limit(1);
    return rows[0];
  }

  /** 插入流水;唯一约束冲突(并发重放的兜底)返回 false。 */
  private async insertEntry(tx: Tx, userId: string, entry: { billingKey: string; type: string; amount: number; remark?: string }): Promise<boolean> {
    try {
      await tx.insert(creditLogs).values({
        userId,
        billingKey: entry.billingKey,
        type: entry.type,
        amount: entry.amount,
        remark: entry.remark,
      });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }
}

/** 沿错误链找 unique_violation(drizzle/postgres.js 的包装层级不稳定)。 */
function isUniqueViolation(e: unknown): boolean {
  let cur = e as { code?: string; cause?: unknown } | null | undefined;
  for (let i = 0; cur && i < 5; i++) {
    if (cur.code === '23505') return true;
    cur = cur.cause as typeof cur;
  }
  const msg = (e as Error | undefined)?.message ?? '';
  return msg.includes('duplicate key') || msg.includes('unique constraint');
}
