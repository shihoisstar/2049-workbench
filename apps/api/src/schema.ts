import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export type User = typeof users.$inferSelect;
