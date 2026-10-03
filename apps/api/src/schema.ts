import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * 用户表(INF-01 / T1.1)。
 * 游客 = deviceId 匿名身份;手机号绑定随小程序认证资质解锁(工单板阻塞墙)。
 * 注销 = 软删除:status=deactivated + 清空 deviceId/phone(可重新注册),行留存合规。
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: text('device_id').unique(),
  phone: text('phone').unique(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
});

/** 钱包余额表:与流水事务双写,不变式 balance = SUM(credit_logs.amount)(domain/wallet)。 */
export const wallets = pgTable('wallets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  balance: integer('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 余额流水账本(三账本之一)——预留-结算模式:
 * hold(冻结,-estimate)→ settle(实扣,-actual)→ refund(退回,+差额或全额);grant(发放,+)。
 * (billing_key, type) 唯一:同一业务键同类型只允许一条 → 重复扣费/重复退款被结构性拒绝。
 */
export const creditLogs = pgTable(
  'credit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    billingKey: text('billing_key').notNull(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('credit_logs_billing_key_type_uq').on(t.billingKey, t.type)],
);

/** 用量成本账本(三账本之二):模型成本核算,与余额账本经 billingKey 关联。支付账本随 T1.4。 */
export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  billingKey: text('billing_key').notNull(),
  model: text('model').notNull(),
  estimatedCostCents: integer('estimated_cost_cents').notNull(),
  actualCostCents: integer('actual_cost_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type CreditLog = typeof creditLogs.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
