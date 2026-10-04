import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

/** 用量成本账本(三账本之二):模型成本核算,与余额账本经 billingKey 关联。 */
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

/** 充值档位(T1.4;定价 placeholder,随 BIZ-01/02 成本推演校准;seed 进迁移幂等插入)。 */
export const creditPackages = pgTable('credit_packages', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  credits: integer('credits').notNull(),
  priceCents: integer('price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** 订单(三账本之三:支付单据;微信回调明细/退款随商户号接入)。 */
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  packageId: text('package_id')
    .notNull()
    .references(() => creditPackages.id),
  credits: integer('credits').notNull(),
  priceCents: integer('price_cents').notNull(),
  status: text('status').notNull().default('created'),
  transactionId: text('transaction_id'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 生成任务(INF-03/T2.2):状态机见 @wb/domain task-machine;billingKey 关联钱包冻结/退回。 */
export const generationTasks = pgTable('generation_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  billingKey: text('billing_key').notNull().unique(),
  status: text('status').notNull().default('created'),
  prompt: text('prompt').notNull(),
  resolution: text('resolution').notNull().default('480p'),
  durationSec: integer('duration_sec').notNull().default(5),
  model: text('model').notNull(),
  estimateCredits: integer('estimate_credits').notNull(),
  attempts: integer('attempts').notNull().default(0),
  providerName: text('provider_name'),
  providerTaskId: text('provider_task_id'),
  channelId: integer('channel_id'),
  videoUrl: text('video_url'),
  errorCode: integer('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type CreditLog = typeof creditLogs.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
