import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, foreignKey, index, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Migration composition only. Runtime modules never import or export these tables.
export const next = pgSchema('wb_next');
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const credits = (name: string) => bigint(name, { mode: 'number' });

export const users = next.table('users', {
  id: uuid('id').primaryKey(),
  credentialHash: text('credential_hash').notNull().unique(),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
}, t => [
  check('users_hash', sql`${t.credentialHash} ~ '^[a-f0-9]{64}$'`),
  check('users_status', sql`(${t.status} = 'active' and ${t.deactivatedAt} is null) or (${t.status} = 'deactivated' and ${t.deactivatedAt} is not null)`),
]);

export const sessions = next.table('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, t => [check('sessions_hash', sql`${t.tokenHash} ~ '^[a-f0-9]{64}$'`), index('sessions_user_idx').on(t.userId)]);

export const wallets = next.table('wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  balance: credits('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('wallet_balance_range', sql`${t.balance} between 0 and 9007199254740991`)]);

export const reservations = next.table('reservations', {
  userId: uuid('user_id').notNull().references(() => wallets.userId),
  billingKey: text('billing_key').notNull(),
  estimate: credits('estimate').notNull(),
  model: text('model').notNull(),
  estimatedCostCents: credits('estimated_cost_cents').notNull(),
  status: text('status').notNull().default('held'),
  actual: credits('actual'),
  actualCostCents: credits('actual_cost_cents'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.userId, t.billingKey] }),
  check('reservation_key', sql`length(btrim(${t.billingKey})) between 1 and 200 and length(${t.billingKey}) <= 200`),
  check('reservation_model', sql`length(btrim(${t.model})) between 1 and 200 and length(${t.model}) <= 200`),
  check('reservation_amounts', sql`${t.estimate} between 1 and 9007199254740991 and ${t.estimatedCostCents} between 0 and 9007199254740991 and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
  check('reservation_state', sql`(${t.status} = 'held' and ${t.actual} is null and ${t.finishedAt} is null) or (${t.status} = 'settled' and ${t.actual} is not null and ${t.actual} between 0 and ${t.estimate} and ${t.finishedAt} is not null) or (${t.status} = 'refunded' and ${t.actual} is null and ${t.finishedAt} is not null)`),
]);

export const ledger = next.table('ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => wallets.userId),
  billingKey: text('billing_key').notNull(),
  kind: text('kind').notNull(),
  amount: credits('amount').notNull(),
  remark: text('remark'),
  reservationKey: text('reservation_key'),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('ledger_operation_uq').on(t.userId, t.billingKey, t.kind),
  uniqueIndex('ledger_terminal_uq').on(t.userId, t.billingKey).where(sql`${t.kind} in ('settle', 'refund')`),
  index('ledger_user_history_idx').on(t.userId, t.id),
  foreignKey({ columns: [t.userId, t.reservationKey], foreignColumns: [reservations.userId, reservations.billingKey] }),
  check('ledger_key', sql`length(btrim(${t.billingKey})) between 1 and 200 and length(${t.billingKey}) <= 200`),
  check('ledger_amount_range', sql`${t.amount} between -9007199254740991 and 9007199254740991`),
  check('ledger_kind_amount', sql`(${t.kind} = 'grant' and ${t.amount} > 0) or (${t.kind} = 'hold' and ${t.amount} < 0) or (${t.kind} = 'settle' and ${t.amount} >= 0) or (${t.kind} = 'refund' and ${t.amount} > 0)`),
  check('ledger_reservation', sql`(${t.kind} = 'grant' and ${t.reservationKey} is null) or (${t.kind} <> 'grant' and ${t.reservationKey} is not null and ${t.reservationKey} = ${t.billingKey})`),
]);
