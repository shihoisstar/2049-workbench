import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, foreignKey, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
  estimatedCostCents: credits('estimated_cost_cents'),
  status: text('status').notNull().default('held'),
  actual: credits('actual'),
  actualCostCents: credits('actual_cost_cents'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.userId, t.billingKey] }),
  check('reservation_key', sql`length(btrim(${t.billingKey})) between 1 and 200 and length(${t.billingKey}) <= 200`),
  check('reservation_model', sql`length(btrim(${t.model})) between 1 and 200 and length(${t.model}) <= 200`),
  check('reservation_amounts', sql`${t.estimate} between 1 and 9007199254740991 and (${t.estimatedCostCents} is null or ${t.estimatedCostCents} between 0 and 9007199254740991) and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
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

export const marketingCopyJobs = next.table('marketing_copy_jobs', {
  durationSec: integer('duration_sec').notNull().default(5),
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id), requestKey: uuid('request_key').notNull(), category: text('category').notNull(), sourceText: text('source_text').notNull(),
  quoteVersion: text('quote_version').notNull(), reservedCredits: credits('reserved_credits').notNull(), estimatedCostCents: credits('estimated_cost_cents'), binding: jsonb('binding'), request: jsonb('request'), response: jsonb('response'), result: jsonb('result'),
  status: text('status').notNull().default('accepted'), submissionState: text('submission_state'), token: uuid('token'), billingState: text('billing_state').notNull(),
  failureCode: text('failure_code'), submittedAt: timestamp('submitted_at', { withTimezone: true }), createdAt: createdAt(), finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('copy_request_uq').on(t.userId, t.requestKey), uniqueIndex('copy_active_category_uq').on(t.userId, t.category).where(sql`${t.status} = 'accepted'`),
  check('copy_input', sql`${t.category} in ('commerce', 'store_visit') and length(btrim(${t.sourceText})) between 2 and 3000 and length(${t.quoteVersion}) between 1 and 100 and ${t.reservedCredits} between 0 and 9007199254740991`),
  check('copy_state', sql`(${t.status} = 'accepted' and ${t.result} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.result} is not null and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.result} is null and ${t.failureCode} is not null and ${t.finishedAt} is not null)`),
  check('copy_duration', sql`${t.durationSec} in (5, 10)`),
  check('copy_billing', sql`(${t.binding} is null and ${t.reservedCredits} = 0 and ${t.billingState} = 'none') or (${t.binding} is not null and ${t.reservedCredits} > 0 and (${t.status} = 'accepted' and ${t.billingState} = 'held' or ${t.status} = 'succeeded' and ${t.billingState} = 'settled' or ${t.status} = 'failed' and ${t.billingState} = 'refunded'))`),
  check('copy_submission', sql`(${t.submissionState} is null and ${t.token} is null and ${t.request} is null and ${t.submittedAt} is null) or (${t.binding} is not null and ${t.token} is not null and ${t.request} is not null and ${t.submittedAt} is not null and (${t.submissionState} in ('submitting', 'unknown') and ${t.status} = 'accepted' and ${t.response} is null or ${t.submissionState} = 'received' and ${t.response} is not null or ${t.submissionState} = 'rejected' and ${t.status} = 'failed' and ${t.response} is null))`),
]);
export const marketingCopyOutbox = next.table('marketing_copy_outbox', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => marketingCopyJobs.id), type: text('type').notNull(), workflowId: text('workflow_id').notNull(),
  status: text('status').notNull().default('pending'), attempts: integer('attempts').notNull().default(0), availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(), leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [uniqueIndex('copy_outbox_kind_uq').on(t.jobId, t.type), check('copy_outbox_scope', sql`${t.type} in ('requested', 'resume') and ${t.workflowId} = 'marketing-copy:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('copy_outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`)]);
export const marketingCopyReviews = next.table('marketing_copy_reviews', {
  jobId: uuid('job_id').primaryKey().references(() => marketingCopyJobs.id), requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(), action: text('action').notNull(), reason: text('reason').notNull(), evidenceReference: text('evidence_reference').notNull(), priorState: text('prior_state').notNull(), createdAt: createdAt(),
}, t => [check('copy_review_action', sql`${t.action} in ('receipt', 'reject') and ${t.requestHash} ~ '^[a-f0-9]{64}$' and length(${t.reason}) between 1 and 500 and length(${t.evidenceReference}) between 1 and 300`)]);

export const generationJobs = next.table('generation_jobs', {
  nativeQuoteVersion: text('native_quote_version'), nativeBinding: text('native_binding'), nativeBillingPoint: text('native_billing_point'),
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  requestKey: text('request_key').notNull(),
  billingKey: text('billing_key').notNull(),
  prompt: text('prompt').notNull(),
  category: text('category'),
  copyJobId: uuid('copy_job_id').references(() => marketingCopyJobs.id),
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
  check('generation_category', sql`${t.category} is null or ${t.category} in ('commerce', 'store_visit')`),
  uniqueIndex('generation_billing_uq').on(t.userId, t.billingKey),
  foreignKey({ columns: [t.userId, t.billingKey], foreignColumns: [reservations.userId, reservations.billingKey] }),
  check('generation_request_key', sql`length(btrim(${t.requestKey})) between 1 and 200 and length(${t.requestKey}) <= 200`),
  check('generation_input', sql`length(btrim(${t.prompt})) between 1 and 3000 and length(${t.prompt}) <= 3000 and ${t.resolution} in ('480p', '720p') and ${t.aspectRatio} in ('9:16', '16:9', '1:1') and ((${t.durationSec} = 5 and ${t.nativeQuoteVersion} is null and ${t.nativeBinding} is null) or (${t.durationSec} = 10 and ${t.resolution} = '720p' and ${t.aspectRatio} = '9:16' and ${t.category} is not null and ${t.nativeQuoteVersion} is not null and ${t.nativeQuoteVersion} ~ '^[a-f0-9]{64}$' and ((${t.nativeBinding} is null and ${t.model} in ('mock-native:text', 'mock-native:reference')) or (${t.nativeBinding} is not null and ${t.nativeBinding} ~ '^[a-f0-9]{64}$' and ${t.model} in ('bytedance/seedance-2.0-fast/text-to-video', 'bytedance/seedance-2.0-fast/reference-to-video')))))`),
  check('generation_amounts', sql`${t.reservedCredits} between 1 and 9007199254740991 and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
  check('generation_native_billing', sql`${t.nativeBillingPoint} is null or (${t.nativeQuoteVersion} is not null and ${t.nativeBillingPoint} = 'preview')`),
  check('generation_state', sql`(${t.status} = 'accepted' and ${t.outputRef} is null and (${t.actualCredits} is null or (${t.nativeQuoteVersion} is not null and ${t.nativeBillingPoint} is not null and ${t.nativeBillingPoint} = 'preview' and ${t.actualCredits} = ${t.reservedCredits})) and ${t.actualCostCents} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputRef} is not null and length(${t.outputRef}) between 1 and 500 and ${t.actualCredits} is not null and ${t.actualCredits} between 0 and ${t.reservedCredits} and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.failureCode} is not null and length(${t.failureCode}) between 1 and 200 and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.finishedAt} is not null)`),
]);

export const nativeMarketingMedia = next.table('native_marketing_media', {
  jobId: uuid('job_id').primaryKey().references(() => generationJobs.id), sourceObjectKey: text('source_object_key').notNull(), sourceSha256: text('source_sha256').notNull(), byteLength: integer('byte_length').notNull(), width: integer('width').notNull(), height: integer('height').notNull(), durationMs: integer('duration_ms').notNull(),
  state: text('state').notNull().default('transcribing'), revision: integer('revision').notNull().default(0), transcript: text('transcript').notNull().default(''), recognizedCues: jsonb('recognized_cues').notNull().default([]), confirmedCues: jsonb('confirmed_cues'), confirmationRequestKey: uuid('confirmation_request_key'), confirmationHash: text('confirmation_hash'), issue: text('issue'), createdAt: createdAt(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [check('native_media_source', sql`${t.sourceSha256} ~ '^[a-f0-9]{64}$' and ${t.sourceObjectKey} = 'native-marketing-source/' || ${t.jobId}::text || '/' || ${t.sourceSha256} || '.mp4' and ${t.byteLength} between 1 and 67108864 and ${t.width} between 720 and 4096 and ${t.height} between 720 and 4096 and ${t.durationMs} between 9700 and 10300 and ${t.expiresAt} > ${t.createdAt}`),
  check('native_media_state', sql`(${t.state} = 'transcribing' and ${t.revision} = 0 and ${t.confirmedCues} is null and ${t.confirmationRequestKey} is null and ${t.confirmationHash} is null) or (${t.state} = 'review' and ${t.revision} = 1 and ${t.confirmedCues} is null and ${t.confirmationRequestKey} is null and ${t.confirmationHash} is null) or (${t.state} = 'ready' and ${t.revision} = 2 and ${t.confirmedCues} is not null and ${t.confirmationRequestKey} is not null and ${t.confirmationHash} is not null and ${t.confirmationHash} ~ '^[a-f0-9]{64}$')`),
  check('native_media_issue', sql`${t.issue} is null or ${t.issue} in ('transcription_failed', 'render_failed')`)]);

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
  check('media_size', sql`${t.byteLength} between 1 and 67108864 and ${t.width} between 16 and 4096 and ${t.height} between 16 and 4096 and ${t.durationMs} between 500 and 10600`),
  check('media_key', sql`${t.objectKey} = 'jobs/' || ${t.jobId}::text || '/' || ${t.sha256} || '.mp4'`),
  check('media_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const userMaterials = next.table('user_materials', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  byteLength: integer('byte_length').notNull(),
  contentType: text('content_type').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('material_object_uq').on(t.objectKey),
  index('material_user_idx').on(t.userId),
  check('material_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('material_size', sql`${t.byteLength} between 1 and 10485760 and ${t.width} between 1 and 8192 and ${t.height} between 1 and 8192`),
  check('material_type_key', sql`(${t.contentType} = 'image/jpeg' and ${t.objectKey} ~ '^materials/[a-f0-9-]{36}/[a-f0-9]{64}\\.jpg$')
    or (${t.contentType} = 'image/png' and ${t.objectKey} ~ '^materials/[a-f0-9-]{36}/(generated/[a-f0-9-]{36}/)?[a-f0-9]{64}\\.png$')
    or (${t.contentType} = 'image/webp' and ${t.objectKey} ~ '^materials/[a-f0-9-]{36}/[a-f0-9]{64}\\.webp$')`),
  check('material_state', sql`(${t.status} = 'active' and ${t.expiresAt} > ${t.createdAt}) or (${t.status} = 'expired')`),
]);

export const generationJobMaterials = next.table('generation_job_materials', {
  jobId: uuid('job_id').notNull().references(() => generationJobs.id),
  materialId: uuid('material_id').notNull().references(() => userMaterials.id),
  position: integer('position').notNull(),
}, t => [
  primaryKey({ columns: [t.jobId, t.materialId] }),
  uniqueIndex('job_material_position_uq').on(t.jobId, t.position),
  index('job_material_material_idx').on(t.materialId),
  check('job_material_position', sql`${t.position} between 0 and 2`),
]);

export const dramaScripts = next.table('drama_scripts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  createdAt: createdAt(),
}, t => [
  index('drama_scripts_user_created_idx').on(t.userId, t.createdAt, t.id),
  check('drama_scripts_title', sql`length(btrim(${t.title})) between 1 and 30 and length(${t.title}) <= 30`),
]);

export const dramaScriptVersions = next.table('drama_script_versions', {
  id: uuid('id').primaryKey(),
  scriptId: uuid('script_id').notNull().references(() => dramaScripts.id),
  ordinal: integer('ordinal').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  parseStatus: text('parse_status').notNull(),
  parsedJson: jsonb('parsed_json').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_script_version_ordinal_uq').on(t.scriptId, t.ordinal),
  index('drama_script_versions_script_idx').on(t.scriptId, t.ordinal),
  check('drama_script_version_content', sql`length(btrim(${t.content})) between 1 and 20000 and length(${t.content}) <= 20000`),
  check('drama_script_version_source', sql`${t.source} in ('imported', 'manual_repair', 'mock_generated', 'ai_generated')`),
  check('drama_script_version_parse', sql`${t.parseStatus} in ('parsed', 'needs_repair')`),
  check('drama_script_version_ordinal', sql`${t.ordinal} >= 1`),
]);

export const dramaProjects = next.table('drama_projects', {
  preparation: jsonb('preparation'), preparationRevision: integer('preparation_revision').notNull().default(0),
  preparationUpdatedAt: timestamp('preparation_updated_at', { withTimezone: true }),
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  scriptId: uuid('script_id').references(() => dramaScripts.id),
  activeVersionId: uuid('active_version_id'),
  confirmedVersionId: uuid('confirmed_version_id').references(() => dramaScriptVersions.id),
  mode: text('mode').notNull(),
  title: text('title').notNull(),
  idea: text('idea'),
  look: text('look').notNull(),
  aspectRatio: text('aspect_ratio').notNull(),
  episodeCount: integer('episode_count').notNull(),
  genre: text('genre'),
  tone: text('tone'),
  createdAt: createdAt(),
}, t => [
  index('drama_projects_user_created_idx').on(t.userId, t.createdAt, t.id),
  index('drama_projects_script_idx').on(t.scriptId),
  check('drama_project_preparation', sql`((${t.preparation} is null and ${t.preparationRevision} = 0 and ${t.preparationUpdatedAt} is null) or (jsonb_typeof(${t.preparation}) = 'object' and ${t.preparationRevision} > 0 and ${t.preparationUpdatedAt} is not null and ${t.confirmedVersionId} = ${t.activeVersionId} and ${t.preparation}->>'scriptVersionId' = ${t.confirmedVersionId}::text)) is true`),
  check('drama_project_mode', sql`${t.mode} in ('idea', 'script')`),
  check('drama_project_title', sql`length(btrim(${t.title})) between 1 and 30 and length(${t.title}) <= 30`),
  check('drama_project_look', sql`${t.look} in ('3D国创', '都市言情', '美式3D', '都市漫画')`),
  check('drama_project_ratio', sql`${t.aspectRatio} in ('4:3', '3:4', '16:9', '9:16')`),
  check('drama_project_episodes', sql`${t.episodeCount} between 1 and 40`),
  check('drama_project_mode_data', sql`(${t.mode} = 'idea' and length(btrim(${t.idea})) between 1 and 1000 and ((${t.scriptId} is null and ${t.activeVersionId} is null and ${t.confirmedVersionId} is null) or (${t.scriptId} is not null and ${t.activeVersionId} is not null and ${t.confirmedVersionId} is not null and ${t.confirmedVersionId} = ${t.activeVersionId})) and ${t.genre} in ('通用', '动作', '玄幻', '言情', '悬疑', '古装', '现代', '穿越', '重生', '都市', '宫斗', '喜剧', '科幻', '校园', '青春') and ${t.tone} in ('通用', '严肃', '搞笑', '讽刺', '稳重', '简洁')) or (${t.mode} = 'script' and ${t.idea} is null and ${t.scriptId} is not null and ${t.activeVersionId} is not null and ${t.genre} is null and ${t.tone} is null)`),
]);

export const dramaRoles = next.table('drama_roles', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_roles_project_name_uq').on(t.projectId, t.name),
  index('drama_roles_user_project_idx').on(t.userId, t.projectId),
  check('drama_roles_name', sql`length(btrim(${t.name})) between 1 and 100 and length(${t.name}) <= 100`),
]);

export const dramaRoleVersions = next.table('drama_role_versions', {
  id: uuid('id').primaryKey(),
  roleId: uuid('role_id').notNull().references(() => dramaRoles.id),
  ordinal: integer('ordinal').notNull(),
  description: text('description').notNull(),
  referenceMaterialId: uuid('reference_material_id').notNull().references(() => userMaterials.id),
  referenceSha256: text('reference_sha256').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_role_versions_ordinal_uq').on(t.roleId, t.ordinal),
  index('drama_role_versions_role_idx').on(t.roleId, t.ordinal),
  check('drama_role_versions_description', sql`length(btrim(${t.description})) between 1 and 2000 and length(${t.description}) <= 2000`),
  check('drama_role_versions_reference_hash', sql`${t.referenceSha256} ~ '^[a-f0-9]{64}$'`),
  check('drama_role_versions_ordinal', sql`${t.ordinal} >= 1`),
]);

export const dramaRoleSelections = next.table('drama_role_selections', {
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id), roleKey: text('role_key').notNull(),
  scriptVersionId: uuid('script_version_id').notNull().references(() => dramaScriptVersions.id),
  roleVersionId: uuid('role_version_id').notNull().references(() => dramaRoleVersions.id), fingerprint: text('fingerprint').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.projectId, t.roleKey] }),
  check('drama_role_selection_fields', sql`length(btrim(${t.roleKey})) between 1 and 100 and ${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
]);

export const dramaScenes = next.table('drama_scenes', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_scenes_project_name_uq').on(t.projectId, t.name),
  index('drama_scenes_user_project_idx').on(t.userId, t.projectId),
  check('drama_scenes_name', sql`length(btrim(${t.name})) between 1 and 100 and length(${t.name}) <= 100`),
]);

export const dramaSceneVersions = next.table('drama_scene_versions', {
  id: uuid('id').primaryKey(),
  sceneId: uuid('scene_id').notNull().references(() => dramaScenes.id),
  ordinal: integer('ordinal').notNull(),
  description: text('description').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_scene_versions_ordinal_uq').on(t.sceneId, t.ordinal),
  index('drama_scene_versions_scene_idx').on(t.sceneId, t.ordinal),
  check('drama_scene_versions_description', sql`length(btrim(${t.description})) between 1 and 2000 and length(${t.description}) <= 2000`),
  check('drama_scene_versions_ordinal', sql`${t.ordinal} >= 1`),
]);

export const dramaStoryboardShots = next.table('drama_storyboard_shots', {
  planId: uuid('plan_id').references(() => dramaStoryboardPlans.id), shotNumber: integer('shot_number').notNull().default(1),
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  episodeNumber: integer('episode_number').notNull(),
  sceneNumber: integer('scene_number').notNull(),
  prompt: text('prompt').notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_storyboard_shots_project_scene_uq').on(t.projectId, t.episodeNumber, t.sceneNumber).where(sql`${t.planId} is null`),
  uniqueIndex('drama_storyboard_shots_plan_order_uq').on(t.planId, t.episodeNumber, t.sceneNumber, t.shotNumber).where(sql`${t.planId} is not null`),
  index('drama_storyboard_shots_user_project_idx').on(t.userId, t.projectId),
  check('drama_storyboard_shots_ordinal', sql`${t.episodeNumber} >= 1 and ${t.sceneNumber} >= 1 and ${t.shotNumber} >= 1`),
  check('drama_storyboard_shots_prompt', sql`length(btrim(${t.prompt})) between 1 and 3000 and length(${t.prompt}) <= 3000`),
]);

export const dramaStoryboardPlans = next.table('drama_storyboard_plans', {
  id: uuid('id').primaryKey(), projectId: uuid('project_id').notNull().references(() => dramaProjects.id), userId: uuid('user_id').notNull().references(() => users.id),
  sourceKey: text('source_key').notNull(), snapshot: jsonb('snapshot').notNull(), shots: jsonb('shots').notNull(), revision: integer('revision').notNull().default(1),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('drama_storyboard_plan_source_uq').on(t.projectId, t.sourceKey), index('drama_storyboard_plan_project_idx').on(t.userId, t.projectId, t.createdAt),
  check('drama_storyboard_plan_fields', sql`${t.sourceKey} ~ '^[a-f0-9]{64}$' and ${t.revision} >= 1 and jsonb_typeof(${t.snapshot}) = 'object' and jsonb_typeof(${t.shots}) = 'array'`),
]);

export const dramaStoryboardCandidates = next.table('drama_storyboard_candidates', {
  sourceKey: text('source_key'), planRevision: integer('plan_revision'), quoteVersion: text('quote_version'), sceneSnapshot: jsonb('scene_snapshot'),
  id: uuid('id').primaryKey(),
  shotId: uuid('shot_id').notNull().references(() => dramaStoryboardShots.id),
  scriptVersionId: uuid('script_version_id').notNull().references(() => dramaScriptVersions.id),
  roleVersionId: uuid('role_version_id').references(() => dramaRoleVersions.id),
  sceneVersionId: uuid('scene_version_id').references(() => dramaSceneVersions.id),
  ordinal: integer('ordinal').notNull(),
  prompt: text('prompt').notNull(),
  selectedAt: timestamp('selected_at', { withTimezone: true }),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_storyboard_candidates_ordinal_uq').on(t.shotId, t.ordinal),
  uniqueIndex('drama_storyboard_candidates_selected_uq').on(t.shotId).where(sql`${t.selectedAt} is not null`),
  index('drama_storyboard_candidates_shot_idx').on(t.shotId, t.ordinal),
  check('drama_storyboard_candidates_ordinal', sql`${t.ordinal} >= 1`),
  check('drama_storyboard_candidates_source', sql`((${t.sourceKey} is null and ${t.planRevision} is null and ${t.quoteVersion} is null and ${t.roleVersionId} is not null and ${t.sceneVersionId} is not null and ${t.sceneSnapshot} is null) or (${t.sourceKey} ~ '^[a-f0-9]{64}$' and ${t.planRevision} >= 1 and length(${t.quoteVersion}) between 1 and 100 and ${t.roleVersionId} is null and ${t.sceneVersionId} is null and jsonb_typeof(${t.sceneSnapshot}) = 'object')) is true`),
  check('drama_storyboard_candidates_prompt', sql`length(btrim(${t.prompt})) between 1 and 3000 and length(${t.prompt}) <= 3000`),
]);

export const dramaPlanCandidateRoles = next.table('drama_plan_candidate_roles', {
  candidateId: uuid('candidate_id').notNull().references(() => dramaStoryboardCandidates.id), roleVersionId: uuid('role_version_id').notNull().references(() => dramaRoleVersions.id), position: integer('position').notNull(),
}, t => [uniqueIndex('drama_plan_candidate_role_uq').on(t.candidateId, t.roleVersionId), uniqueIndex('drama_plan_candidate_position_uq').on(t.candidateId, t.position), check('drama_plan_candidate_position', sql`${t.position} >= 0 and ${t.position} < 10`)]);

export const dramaImageJobs = next.table('drama_image_jobs', {
  target: text('target').notNull().default('candidate'), projectId: uuid('project_id').references(() => dramaProjects.id),
  roleKey: text('role_key'), portrait: jsonb('portrait'),
  id: uuid('id').primaryKey(),
  candidateId: uuid('candidate_id').references(() => dramaStoryboardCandidates.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  requestKey: text('request_key').notNull(),
  billingKey: text('billing_key').notNull(),
  model: text('model').notNull(),
  reservedCredits: credits('reserved_credits').notNull(),
  status: text('status').notNull().default('accepted'),
  outputRef: text('output_ref'),
  actualCredits: credits('actual_credits'),
  actualCostCents: credits('actual_cost_cents'),
  failureCode: text('failure_code'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_image_jobs_request_uq').on(t.userId, t.requestKey),
  uniqueIndex('drama_image_jobs_candidate_uq').on(t.candidateId),
  uniqueIndex('drama_portrait_active_uq').on(t.projectId, t.roleKey).where(sql`${t.target} = 'portrait' and ${t.status} = 'accepted'`),
  check('drama_image_jobs_target', sql`((${t.target} = 'candidate' and ${t.candidateId} is not null and ${t.projectId} is null and ${t.roleKey} is null and ${t.portrait} is null) or (${t.target} = 'portrait' and ${t.candidateId} is null and ${t.projectId} is not null and length(btrim(${t.roleKey})) between 1 and 100 and jsonb_typeof(${t.portrait}) = 'object')) is true`),
  uniqueIndex('drama_image_jobs_billing_uq').on(t.userId, t.billingKey),
  foreignKey({ columns: [t.userId, t.billingKey], foreignColumns: [reservations.userId, reservations.billingKey] }),
  check('drama_image_jobs_request_key', sql`length(btrim(${t.requestKey})) between 1 and 200 and length(${t.requestKey}) <= 200`),
  check('drama_image_jobs_model', sql`length(btrim(${t.model})) between 1 and 200 and length(${t.model}) <= 200`),
  check('drama_image_jobs_amounts', sql`${t.reservedCredits} between 1 and 9007199254740991 and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
  check('drama_image_jobs_state', sql`(${t.status} = 'accepted' and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputRef} is not null and length(${t.outputRef}) between 1 and 500 and ${t.actualCredits} is not null and ${t.actualCredits} between 0 and ${t.reservedCredits} and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.failureCode} is not null and length(${t.failureCode}) between 1 and 200 and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.finishedAt} is not null)`),
]);

export const dramaImageAssets = next.table('drama_image_assets', {
  referenceMaterialId: uuid('reference_material_id').references(() => userMaterials.id),
  id: uuid('id').primaryKey(),
  jobId: uuid('job_id').notNull().references(() => dramaImageJobs.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  byteLength: integer('byte_length').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(),
  createdAt: createdAt(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('drama_image_assets_job_uq').on(t.jobId), uniqueIndex('drama_image_assets_object_uq').on(t.objectKey),
  check('drama_image_assets_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('drama_image_assets_size', sql`${t.byteLength} between 1 and 10485760 and ${t.width} between 16 and 8192 and ${t.height} between 16 and 8192`),
  check('drama_image_assets_key', sql`${t.objectKey} = 'drama-image-jobs/' || ${t.jobId}::text || '/' || ${t.sha256} || '.png'`),
  check('drama_image_assets_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const dramaImageSubmissions = next.table('drama_image_submissions', {
  jobId: uuid('job_id').primaryKey().references(() => dramaImageJobs.id),
  providerKey: text('provider_key').notNull(), token: uuid('token').notNull(), status: text('status').notNull().default('submitting'),
  providerTaskId: text('provider_task_id'), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('drama_portrait_provider_task_uq').on(t.providerKey, t.providerTaskId).where(sql`${t.providerKey} like 'portrait:%' and ${t.providerTaskId} is not null`),
  check('drama_image_submissions_provider_key', sql`length(btrim(${t.providerKey})) between 1 and 200 and length(${t.providerKey}) <= 200`),
  check('drama_image_submissions_state', sql`(${t.status} in ('submitting', 'unknown', 'rejected') and ${t.providerTaskId} is null) or (${t.status} = 'submitted' and ${t.providerTaskId} is not null and length(btrim(${t.providerTaskId})) between 1 and 500 and length(${t.providerTaskId}) <= 500)`),
]);

export const dramaPortraitReviews = next.table('drama_portrait_reviews', {
  jobId: uuid('job_id').primaryKey().references(() => dramaImageJobs.id), requestKey: uuid('request_key').notNull(),
  action: text('action').notNull(), requestHash: text('request_hash').notNull(), reason: text('reason').notNull(), evidenceReference: text('evidence_reference').notNull(),
  priorState: text('prior_state').notNull(), authSource: text('auth_source').notNull(), createdAt: createdAt(),
}, t => [uniqueIndex('drama_portrait_review_request_uq').on(t.requestKey),
  check('drama_portrait_review_fields', sql`${t.action} in ('receipt', 'reject') and ${t.priorState} in ('submitting', 'unknown') and ${t.authSource} = 'ops-token' and ${t.requestHash} ~ '^[a-f0-9]{64}$' and length(btrim(${t.reason})) between 8 and 1000 and length(btrim(${t.evidenceReference})) between 1 and 500`),
]);

export const dramaImageOutbox = next.table('drama_image_outbox', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => dramaImageJobs.id), type: text('type').notNull().default('drama_image.requested'),
  workflowId: text('workflow_id').notNull(), status: text('status').notNull().default('pending'), availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }), attempts: integer('attempts').notNull().default(0), createdAt: createdAt(), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_image_outbox_request_uq').on(t.jobId).where(sql`${t.type} = 'drama_image.requested'`),
  uniqueIndex('drama_image_outbox_resume_uq').on(t.jobId).where(sql`${t.type} = 'drama_image.resume'`),
  index('drama_image_outbox_claim_idx').on(t.status, t.availableAt),
  check('drama_image_outbox_event', sql`${t.type} in ('drama_image.requested', 'drama_image.resume') and ${t.workflowId} = 'drama-image:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('drama_image_outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);

export const dramaShotVideoJobs = next.table('drama_shot_video_jobs', {
  planSnapshot: jsonb('plan_snapshot'),
  id: uuid('id').primaryKey(),
  shotId: uuid('shot_id').notNull().references(() => dramaStoryboardShots.id),
  candidateId: uuid('candidate_id').notNull().references(() => dramaStoryboardCandidates.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  requestKey: text('request_key').notNull(),
  billingKey: text('billing_key').notNull(),
  model: text('model').notNull(),
  reservedCredits: credits('reserved_credits').notNull(),
  status: text('status').notNull().default('accepted'),
  outputRef: text('output_ref'),
  actualCredits: credits('actual_credits'),
  actualCostCents: credits('actual_cost_cents'),
  failureCode: text('failure_code'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_shot_video_jobs_request_uq').on(t.userId, t.requestKey),
  uniqueIndex('drama_shot_video_jobs_billing_uq').on(t.userId, t.billingKey),
  // At most one in-flight video per shot; terminal jobs free the slot so retries create a new job.
  uniqueIndex('drama_shot_video_jobs_active_uq').on(t.shotId).where(sql`${t.status} = 'accepted'`),
  index('drama_shot_video_jobs_shot_idx').on(t.shotId, t.createdAt),
  foreignKey({ columns: [t.userId, t.billingKey], foreignColumns: [reservations.userId, reservations.billingKey] }),
  check('drama_shot_video_jobs_request_key', sql`length(btrim(${t.requestKey})) between 1 and 200 and length(${t.requestKey}) <= 200`),
  check('drama_shot_video_jobs_model', sql`length(btrim(${t.model})) between 1 and 200 and length(${t.model}) <= 200`),
  check('drama_shot_video_jobs_amounts', sql`${t.reservedCredits} between 1 and 9007199254740991 and (${t.actualCostCents} is null or ${t.actualCostCents} between 0 and 9007199254740991)`),
  check('drama_shot_video_jobs_state', sql`(${t.status} = 'accepted' and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputRef} is not null and length(${t.outputRef}) between 1 and 500 and ${t.actualCredits} is not null and ${t.actualCredits} between 0 and ${t.reservedCredits} and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.failureCode} is not null and length(${t.failureCode}) between 1 and 200 and ${t.outputRef} is null and ${t.actualCredits} is null and ${t.actualCostCents} is null and ${t.finishedAt} is not null)`),
]);

export const dramaShotVideoAssets = next.table('drama_shot_video_assets', {
  id: uuid('id').primaryKey(),
  jobId: uuid('job_id').notNull().references(() => dramaShotVideoJobs.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  byteLength: integer('byte_length').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(), durationMs: integer('duration_ms').notNull(),
  createdAt: createdAt(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('drama_shot_video_assets_job_uq').on(t.jobId), uniqueIndex('drama_shot_video_assets_object_uq').on(t.objectKey),
  check('drama_shot_video_assets_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('drama_shot_video_assets_size', sql`${t.byteLength} between 1 and 67108864 and ${t.width} between 16 and 4096 and ${t.height} between 16 and 4096 and ${t.durationMs} between 500 and 7000`),
  check('drama_shot_video_assets_key', sql`${t.objectKey} = 'drama-shot-video-jobs/' || ${t.jobId}::text || '/' || ${t.sha256} || '.mp4'`),
  check('drama_shot_video_assets_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const dramaShotVideoSubmissions = next.table('drama_shot_video_submissions', {
  jobId: uuid('job_id').primaryKey().references(() => dramaShotVideoJobs.id),
  providerKey: text('provider_key').notNull(), token: uuid('token').notNull(), status: text('status').notNull().default('submitting'),
  providerTaskId: text('provider_task_id'), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('drama_shot_video_submissions_provider_key', sql`length(btrim(${t.providerKey})) between 1 and 200 and length(${t.providerKey}) <= 200`),
  check('drama_shot_video_submissions_state', sql`(${t.status} in ('submitting', 'unknown', 'rejected') and ${t.providerTaskId} is null) or (${t.status} = 'submitted' and ${t.providerTaskId} is not null and length(btrim(${t.providerTaskId})) between 1 and 500 and length(${t.providerTaskId}) <= 500)`),
]);

export const dramaShotVideoOutbox = next.table('drama_shot_video_outbox', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => dramaShotVideoJobs.id), type: text('type').notNull().default('drama_video.requested'),
  workflowId: text('workflow_id').notNull(), status: text('status').notNull().default('pending'), availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }), attempts: integer('attempts').notNull().default(0), createdAt: createdAt(), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_shot_video_outbox_request_uq').on(t.jobId).where(sql`${t.type} = 'drama_video.requested'`),
  uniqueIndex('drama_shot_video_outbox_resume_uq').on(t.jobId).where(sql`${t.type} = 'drama_video.resume'`),
  index('drama_shot_video_outbox_claim_idx').on(t.status, t.availableAt),
  check('drama_shot_video_outbox_event', sql`${t.type} in ('drama_video.requested', 'drama_video.resume') and ${t.workflowId} = 'drama-video:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('drama_shot_video_outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);

export const dramaExportJobs = next.table('drama_export_jobs', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id), episodeNumber: integer('episode_number').notNull(),
  requestKey: text('request_key').notNull(), status: text('status').notNull().default('accepted'), outputRef: text('output_ref'),
  failureCode: text('failure_code'), createdAt: createdAt(), finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_export_jobs_request_uq').on(t.userId, t.requestKey), index('drama_export_jobs_project_episode_idx').on(t.projectId, t.episodeNumber, t.createdAt),
  check('drama_export_jobs_request_key', sql`length(btrim(${t.requestKey})) between 1 and 200 and length(${t.requestKey}) <= 200`),
  check('drama_export_jobs_episode', sql`${t.episodeNumber} between 1 and 1000`),
  check('drama_export_jobs_state', sql`(${t.status} = 'accepted' and ${t.outputRef} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputRef} is not null and length(${t.outputRef}) between 1 and 500 and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.outputRef} is null and ${t.failureCode} is not null and length(${t.failureCode}) between 1 and 200 and ${t.finishedAt} is not null)`),
]);

export const dramaExportVersions = next.table('drama_export_versions', {
  id: uuid('id').primaryKey(), exportJobId: uuid('export_job_id').notNull().references(() => dramaExportJobs.id),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id), episodeNumber: integer('episode_number').notNull(),
  ordinal: integer('ordinal').notNull(), manifest: jsonb('manifest').notNull(), manifestSha256: text('manifest_sha256').notNull(), createdAt: createdAt(),
}, t => [
  uniqueIndex('drama_export_versions_job_uq').on(t.exportJobId), uniqueIndex('drama_export_versions_ordinal_uq').on(t.projectId, t.episodeNumber, t.ordinal),
  check('drama_export_versions_episode', sql`${t.episodeNumber} between 1 and 1000`), check('drama_export_versions_ordinal', sql`${t.ordinal} between 1 and 2147483647`),
  check('drama_export_versions_hash', sql`${t.manifestSha256} ~ '^[a-f0-9]{64}$'`),
]);

export const dramaExportAssets = next.table('drama_export_assets', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => dramaExportJobs.id), userId: uuid('user_id').notNull().references(() => users.id),
  objectKey: text('object_key').notNull(), sha256: text('sha256').notNull(), byteLength: integer('byte_length').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(), durationMs: integer('duration_ms').notNull(), createdAt: createdAt(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('drama_export_assets_job_uq').on(t.jobId), uniqueIndex('drama_export_assets_object_uq').on(t.objectKey),
  check('drama_export_assets_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  check('drama_export_assets_size', sql`${t.byteLength} between 1 and 67108864 and ${t.width} between 16 and 4096 and ${t.height} between 16 and 4096 and ${t.durationMs} between 500 and 7200000`),
  check('drama_export_assets_key', sql`${t.objectKey} = 'drama-export-jobs/' || ${t.jobId}::text || '/' || ${t.sha256} || '.mp4'`),
  check('drama_export_assets_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const dramaExportOutbox = next.table('drama_export_outbox', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => dramaExportJobs.id), type: text('type').notNull().default('drama_export.requested'),
  workflowId: text('workflow_id').notNull(), status: text('status').notNull().default('pending'), availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }), attempts: integer('attempts').notNull().default(0), createdAt: createdAt(), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_export_outbox_request_uq').on(t.jobId).where(sql`${t.type} = 'drama_export.requested'`),
  uniqueIndex('drama_export_outbox_resume_uq').on(t.jobId).where(sql`${t.type} = 'drama_export.resume'`),
  index('drama_export_outbox_claim_idx').on(t.status, t.availableAt),
  check('drama_export_outbox_event', sql`${t.type} in ('drama_export.requested', 'drama_export.resume') and ${t.workflowId} = 'drama-export:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('drama_export_outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);

export const dramaScriptBatches = next.table('drama_script_batches', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id), projectId: uuid('project_id').notNull().references(() => dramaProjects.id),
  requestKey: uuid('request_key').notNull(), quoteVersion: text('quote_version').notNull(), binding: jsonb('binding'),
  creditsPerEpisode: credits('credits_per_episode').notNull(), estimatedCostCents: credits('estimated_cost_cents'), episodeCount: integer('episode_count').notNull(),
  reused: jsonb('reused').notNull(), maximumCharacters: integer('maximum_characters').notNull(), status: text('status').notNull().default('accepted'),
  outputVersionId: uuid('output_version_id').references(() => dramaScriptVersions.id), createdAt: createdAt(), finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('script_batch_request_uq').on(t.userId, t.requestKey), uniqueIndex('script_batch_active_uq').on(t.projectId).where(sql`${t.status} = 'accepted'`),
  check('script_batch_scope', sql`${t.episodeCount} between 1 and 40 and ${t.maximumCharacters} between 1 and 900 and ${t.creditsPerEpisode} between 0 and 9007199254740991`),
  check('script_batch_state', sql`(${t.status} = 'accepted' and ${t.outputVersionId} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputVersionId} is not null and ${t.finishedAt} is not null) or (${t.status} = 'needs_attention' and ${t.outputVersionId} is null and ${t.finishedAt} is not null)`),
]);

export const dramaScriptJobs = next.table('drama_script_jobs', {
  quote: jsonb('quote'), requestQuoteVersion: text('request_quote_version'), billingState: text('billing_state').notNull().default('none'),
  binding: jsonb('binding'), request: jsonb('request'),
  submissionState: text('submission_state'), submissionToken: uuid('submission_token'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id),
  projectId: uuid('project_id').notNull().references(() => dramaProjects.id), requestKey: uuid('request_key').notNull(),
  batchId: uuid('batch_id').references(() => dramaScriptBatches.id), episodeNumber: integer('episode_number').notNull().default(1), batchReady: integer('batch_ready').notNull().default(0),
  status: text('status').notNull().default('accepted'), snapshot: jsonb('snapshot').notNull(),
  response: jsonb('response'),
  outputVersionId: uuid('output_version_id').references(() => dramaScriptVersions.id), failureCode: text('failure_code'),
  createdAt: createdAt(), finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_script_job_request_uq').on(t.userId, t.requestKey),
  uniqueIndex('drama_script_job_active_uq').on(t.projectId).where(sql`${t.status} = 'accepted' and ${t.batchId} is null`),
  uniqueIndex('drama_script_job_batch_episode_uq').on(t.batchId, t.episodeNumber),
  check('drama_script_job_batch', sql`${t.episodeNumber} between 1 and 40 and ${t.batchReady} in (0, 1) and (${t.batchId} is not null or ${t.episodeNumber} = 1 and ${t.batchReady} = 0)`),
  index('drama_script_job_project_idx').on(t.projectId, t.createdAt, t.id),
  check('drama_script_job_billing', sql`((${t.quote} is null and ${t.billingState} = 'none') or (${t.binding} is not null and jsonb_typeof(${t.quote}) = 'object' and length(${t.quote}->>'version') between 1 and 100 and jsonb_typeof(${t.quote}->'credits') = 'number' and (${t.quote}->>'credits')::numeric between 1 and 9007199254740991 and trunc((${t.quote}->>'credits')::numeric) = (${t.quote}->>'credits')::numeric and (${t.billingState} = 'held' and ${t.status} = 'accepted' or ${t.billingState} = 'settled' and ${t.status} = 'succeeded' or ${t.billingState} = 'refunded' and ${t.status} in ('succeeded', 'failed')))) is true`),
  check('drama_script_job_binding', sql`${t.binding} is null or (jsonb_typeof(${t.binding}) = 'object' and ${t.binding}->>'provider' = 'atlas' and length(${t.binding}->>'model') between 1 and 200 and ${t.binding}->>'providerKey' ~ '^[a-f0-9]{64}$') is true`),
  check('drama_script_job_submission', sql`((${t.submissionState} is null and ${t.submissionToken} is null and ${t.request} is null and ${t.submittedAt} is null and (${t.binding} is null or ${t.status} = 'accepted' and ${t.response} is null or ${t.batchId} is not null and ${t.batchReady} = 0 and ${t.status} = 'failed' and ${t.failureCode} = 'SCRIPT_BATCH_PAUSED' and ${t.response} is null)) or (${t.binding} is not null and ${t.submissionToken} is not null and ${t.request} is not null and ${t.submittedAt} is not null and (${t.submissionState} in ('submitting', 'unknown') and ${t.status} = 'accepted' and ${t.response} is null or ${t.submissionState} = 'received' and ${t.response} is not null or ${t.submissionState} = 'rejected' and ${t.status} = 'failed' and ${t.response} is null))) is true`),
  check('drama_script_job_state', sql`(${t.status} = 'accepted' and ${t.outputVersionId} is null and ${t.failureCode} is null and ${t.finishedAt} is null) or (${t.status} = 'succeeded' and ${t.outputVersionId} is not null and ${t.failureCode} is null and ${t.finishedAt} is not null) or (${t.status} = 'failed' and ${t.outputVersionId} is null and ${t.failureCode} is not null and ${t.finishedAt} is not null)`),
]);

export const dramaScriptOutbox = next.table('drama_script_outbox', {
  id: uuid('id').primaryKey(), jobId: uuid('job_id').notNull().references(() => dramaScriptJobs.id),
  workflowId: text('workflow_id').notNull(), status: text('status').notNull().default('pending'),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0), createdAt: createdAt(), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  uniqueIndex('drama_script_outbox_job_uq').on(t.jobId), index('drama_script_outbox_claim_idx').on(t.status, t.availableAt),
  check('drama_script_outbox_workflow', sql`${t.workflowId} = 'drama-script:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('drama_script_outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);

export const dramaScriptReviews = next.table('drama_script_reviews', {
  jobId: uuid('job_id').primaryKey().references(() => dramaScriptJobs.id), requestKey: uuid('request_key').notNull(),
  action: text('action').notNull(), requestHash: text('request_hash').notNull(), reason: text('reason').notNull(), evidenceReference: text('evidence_reference').notNull(),
  priorState: text('prior_state').notNull(), authSource: text('auth_source').notNull(), createdAt: createdAt(),
}, t => [uniqueIndex('drama_script_review_request_uq').on(t.requestKey),
  check('drama_script_review_fields', sql`${t.action} in ('receipt', 'reject') and ${t.priorState} in ('submitting', 'unknown') and ${t.authSource} = 'ops-token' and ${t.requestHash} ~ '^[a-f0-9]{64}$' and length(btrim(${t.reason})) between 8 and 1000 and length(btrim(${t.evidenceReference})) between 1 and 500`),
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
  uniqueIndex('outbox_request_uq').on(t.jobId).where(sql`${t.type} = 'generation.requested'`),
  uniqueIndex('outbox_resume_uq').on(t.jobId).where(sql`${t.type} = 'generation.resume'`),
  index('outbox_claim_idx').on(t.status, t.availableAt),
  check('outbox_event', sql`${t.type} in ('generation.requested', 'generation.resume') and ${t.workflowId} = 'generation:' || ${t.jobId}::text and ${t.attempts} >= 0`),
  check('outbox_state', sql`(${t.status} = 'pending' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is null) or (${t.status} = 'leased' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.deliveredAt} is null) or (${t.status} = 'delivered' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.deliveredAt} is not null)`),
]);
