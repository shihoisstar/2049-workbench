import { and, asc, desc, eq } from 'drizzle-orm';
import { ErrorCode, type StoreOrder } from '@wb/contracts';

import type { Db } from './db';
import { creditPackages, orders } from './schema';
import type { WalletService } from './wallet';

type OrderRow = typeof orders.$inferSelect;

function toOrder(row: OrderRow): StoreOrder {
  return {
    id: row.id,
    packageId: row.packageId,
    credits: row.credits,
    priceCents: row.priceCents,
    status: row.status as StoreOrder['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 充值门店(T1.4 / BIZ-01/02):档位 + 订单 + (开发态)支付闭环。
 * 真实微信支付(商户号/prepay/回调验签)在资质落地后接入——订单状态机与入账链路现在即定型。
 */
export class StoreService {
  constructor(
    private readonly db: Db,
    private readonly wallet: WalletService,
  ) {}

  async listPackages() {
    return this.db
      .select({
        id: creditPackages.id,
        label: creditPackages.label,
        credits: creditPackages.credits,
        priceCents: creditPackages.priceCents,
      })
      .from(creditPackages)
      .where(eq(creditPackages.active, true))
      .orderBy(asc(creditPackages.sortOrder));
  }

  async createOrder(userId: string, packageId: string): Promise<StoreOrder> {
    const pkg = (
      await this.db
        .select()
        .from(creditPackages)
        .where(and(eq(creditPackages.id, packageId), eq(creditPackages.active, true)))
        .limit(1)
    )[0];
    if (!pkg) {
      throw Object.assign(new Error('package not found'), { statusCode: 404, code: ErrorCode.NOT_FOUND });
    }
    const row = (
      await this.db
        .insert(orders)
        .values({ userId, packageId: pkg.id, credits: pkg.credits, priceCents: pkg.priceCents })
        .returning()
    )[0];
    return toOrder(row);
  }

  async myOrders(userId: string): Promise<StoreOrder[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    return rows.map(toOrder);
  }

  /**
   * DEV-ONLY 支付闭环:订单置 paid + 积分入账**同一事务**(wallet.grantTx)。
   * 幂等:已支付订单重复调用为 no-op(真实回调重放同样安全)。
   */
  async devPay(userId: string, orderId: string): Promise<StoreOrder> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: 'paid', paidAt: new Date(), transactionId: `dev-${Date.now().toString(36)}` })
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId), eq(orders.status, 'created')))
        .returning();

      if (!updated[0]) {
        const existing = (
          await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1)
        )[0];
        if (!existing) {
          throw Object.assign(new Error('order not found'), { statusCode: 404, code: ErrorCode.NOT_FOUND });
        }
        return toOrder(existing); // 已支付 → 幂等
      }

      const paid = updated[0];
      await this.wallet.grantTx(tx, userId, paid.credits, `order:${paid.id}`, `充值入账(${paid.credits} 积分)`);
      return toOrder(paid);
    });
  }
}
