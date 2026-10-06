import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, foreignKey, index, integer, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

export const generationJobs = next.table('generation_jobs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  requestKey: text('request_key').notNull(),
  billingKey: text('billing_key').notNull(),
  prompt: text('prompt').notNull(),
  resolution: text('resolution').notNull(),
  aspectRatio: text('aspect_ratio').notNull(),
  durationSec: integer('duration_sec').notNull(),
  reservedCredits: credits('reserved_credits').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull().default('accepted'),
  outputRef: text('output_ref'),
  actualCredits: credits('actual_credits'),
  actualCostCents: credits('actual_cost_cents'),
  failureCode: text('failure_code'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('generation_request_uq').on(t.userId, t.requestKey),
  uniqueIndex('generation_billing_uq').on(t.userId, t.billingKey),
  foreignKey({ columns: [t.userId, t.billingKey], foreignColumns: [reservations.userId, reservations.billingKey] }),
  check('generation_request_key', sql`length(btrim(${t.requestKey})) between 1 and 200 and length(${t.requestKey}) <= 200`),
  check('generation_input', sql`length(btrim(${t.prompt})) between 1 and 3000 and length(${t.prompt}) <= 3000 and ${t.resolution} in ('480p', '720p') and ${t.aspectRatio} in ('9:16', '16:9', '1:1') and ${t.durationSec} = 5`),
  check('generation_amounts', sql`${t.reservedCredits} between 1 and 9007199254740991 and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
  check('generation_state', sql`(${t.status} = 'accepted' and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputRef} is not null and length(${t.outputRef}) between 1 and 500 and ${t.actualCredits} is not null and ${t.actualCredits} between 0 and ${t.reservedCredits} and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.failureCode} is not null and length(${t.failureCode}) between 1 and 200 and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.finishedAt} is not null)`),
]);

export const mediaAssets = next.table('media_assets', {
  id: uuid('id').primaryKey(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  byteLength: integer('byte_length').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(), durationMs: integer('duration_ms').notNull(),
  createdAt: createdAt(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('media_job_uq').on(t.jobId), uniqueIndex('media_object_uq').on(t.objectKey),
  check('media_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('media_size', sql`${t.byteLength} between 1 and 67108864 and ${t.width} between 16 and 4096 and ${t.height} between 16 and 4096 and ${t.durationMs} between 500 and 7000`),
  check('media_key', sql`${t.objectKey} = 'jobs/' || ${t.jobId}::text || '/' || ${t.sha256} || '.mp4'`),
  check('media_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const providerSubmissions = next.table('provider_submissions', {
  jobId: uuid('job_id').primaryKey().references(() => generationJobs.id),
  providerKey: text('provider_key').notNull(),
  token: uuid('token').notNull(),
  status: text('status').notNull().default('submitting'),
  providerTaskId: text('provider_task_id'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('submission_provider_key', sql`length(btrim(${t.providerKey})) between 1 and 200 and length(${t.providerKey}) <= 200`),
  check('submission_state', sql`(${t.status} in ('submitting', 'unknown', 'rejected') and ${t.providerTaskId} is null) or (${t.status} = 'submitted' and ${t.providerTaskId} is not null and length(btrim(${t.providerTaskId})) between 1 and 500 and length(${t.providerTaskId}) <= 500)`),
]);

export const generationOutbox = next.table('outbox', {
  id: uuid('id').primaryKey(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id),
  type: text('type').notNull().default('generation.requested'),
  workflowId: text('workflow_id').notNull(),
  status: text('status').notNull().default('pending'),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  createdAt: createdAt(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  uniqueIndex('outbox_job_uq').on(t.jobId),
  uniqueIndex('outbox_workflow_uq').on(t.workflowId),
  index('outbox_claim_idx').on(t.status, t.availableAt),
  check('outbox_event', sql`${t.type} = 'generation.requested' and ${t.workflowId} = 'generation:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);
