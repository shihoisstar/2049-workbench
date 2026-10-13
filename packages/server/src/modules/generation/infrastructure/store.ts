import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, MarketingCategory, MarketingCopyJob } from '@wb/contracts';
import { DomainError } from '../../../errors';
import { normalizeMaterialIds } from '../../materials/public';
import type {
  CompleteGenerationInput, CreateGenerationInput, FailGenerationInput,
  GenerationDelivery, GenerationJob, GenerationLocator,
} from '../public';

interface JobRow {
  id: string; user_id: string; request_key: string; prompt: string;
  category: GenerationJob['category'] | null;
  copy_job_id: string | null;
  resolution: GenerationJob['resolution']; aspect_ratio: GenerationJob['aspectRatio']; duration_sec: 5 | 10;
  native_quote_version: string | null; native_binding: string | null; native_billing_point: 'preview' | null;
  reserved_credits: string; model: string; status: GenerationJob['status'];
  output_ref: string | null; actual_credits: string | null; actual_cost_cents: string | null;
  failure_code: string | null; created_at: Date; finished_at: Date | null;
}

function job(row: JobRow, materialIds: string[]): GenerationJob {
  return {
    id: row.id, userId: row.user_id, requestKey: row.request_key, prompt: row.prompt,
    ...(row.category ? { category: row.category } : {}),
    ...(row.copy_job_id ? { copyJobId: row.copy_job_id } : {}),
    ...(row.native_quote_version ? { nativeQuoteVersion: row.native_quote_version, settlementPoint: row.native_billing_point ?? 'export', ...(row.native_binding ? { nativeBinding: row.native_binding, provider: 'atlas' as const } : { provider: 'mock' as const }) } : {}),
    resolution: row.resolution, aspectRatio: row.aspect_ratio, durationSec: row.duration_sec,
    materialIds,
    reservedCredits: Number(row.reserved_credits), model: row.model, status: row.status,
    outputRef: row.output_ref, actualCredits: row.actual_credits === null ? null : Number(row.actual_credits),
    actualCostCents: row.actual_cost_cents === null ? null : Number(row.actual_cost_cents),
    failureCode: row.failure_code, createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

function text(value: string, name: string, max: number): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || value.includes('\u0000')) {
    throw new DomainError(400, ErrorCode.VALIDATION, `Invalid ${name}`);
  }
}

function conflict(): never {
  throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Generation request conflicts with existing state');
}

/** Called only by the transaction composition layer. No billing or identity imports. */
export function createGenerationStore(tx: postgres.TransactionSql) {
  async function materialIdsOf(jobIds: string[]): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>();
    if (jobIds.length === 0) return grouped;
    const rows = await tx<{ job_id: string; material_id: string }[]>`
      select job_id, material_id from wb_next.generation_job_materials
      where job_id in ${tx(jobIds)} order by job_id, position`;
    for (const row of rows) {
      const list = grouped.get(row.job_id) ?? [];
      list.push(row.material_id);
      grouped.set(row.job_id, list);
    }
    return grouped;
  }
  async function get(input: GenerationLocator, lock = false): Promise<GenerationJob> {
    const rows = lock
      ? await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Generation job not found');
    return job(rows[0], (await materialIdsOf([rows[0].id])).get(rows[0].id) ?? []);
  }

  return {
    get,
    /** Internal cross-user lookup for the ops review channel. */
    async getById(jobId: string, lock = false): Promise<GenerationJob> {
      const rows = lock
        ? await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${jobId} for update`
        : await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${jobId}`;
      if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Generation job not found');
      return job(rows[0], (await materialIdsOf([rows[0].id])).get(rows[0].id) ?? []);
    },
    async list(input: { userId: string; cursor?: string }) {
      if (input.cursor) await get({ userId: input.userId, jobId: input.cursor });
      const rows = input.cursor
        ? await tx<JobRow[]>`select * from wb_next.generation_jobs where user_id = ${input.userId}
            and (created_at, id) < (select created_at, id from wb_next.generation_jobs where id = ${input.cursor} and user_id = ${input.userId})
            order by created_at desc, id desc limit 21`
        : await tx<JobRow[]>`select * from wb_next.generation_jobs where user_id = ${input.userId} order by created_at desc, id desc limit 21`;
      const materials = await materialIdsOf(rows.map(row => row.id));
      return {
        items: rows.slice(0, 20).map(row => job(row, materials.get(row.id) ?? [])),
        nextCursor: rows.length > 20 ? rows[19].id : null,
      };
    },
    async findRequest(input: CreateGenerationInput): Promise<GenerationJob | null> {
      text(input.requestKey, 'requestKey', 200);
      text(input.prompt, 'prompt', 3000);
      const materialIds = normalizeMaterialIds(input.materialIds ?? []);
      if (input.category !== undefined && !MarketingCategory.safeParse(input.category).success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid marketing category');
      if (input.copyJobId !== undefined && !MarketingCopyJob.shape.id.safeParse(input.copyJobId).success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid copy reference');
      if (!['480p', '720p'].includes(input.resolution) ||
          !['9:16', '16:9', '1:1'].includes(input.aspectRatio) || ![5, 10].includes(input.durationSec) ||
          Object.keys(input).some(key => !['userId', 'requestKey', 'prompt', 'category', 'copyJobId', 'resolution', 'aspectRatio', 'durationSec', 'materialIds'].includes(key))) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Unsupported generation input');
      }
      const [row] = await tx<JobRow[]>`
        select * from wb_next.generation_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update
      `;
      if (!row) return null;
      const existing = job(row, (await materialIdsOf([row.id])).get(row.id) ?? []);
      if (existing.prompt !== input.prompt || existing.resolution !== input.resolution ||
          existing.category !== input.category ||
          existing.copyJobId !== input.copyJobId ||
          existing.aspectRatio !== input.aspectRatio || existing.durationSec !== input.durationSec ||
          existing.materialIds.length !== materialIds.length || existing.materialIds.some((id, index) => id !== materialIds[index])) conflict();
      return existing;
    },
    async insert(input: CreateGenerationInput, id: string, reservedCredits: number, model: string, nativeQuoteVersion?: string, nativeBinding?: string): Promise<GenerationJob> {
      const materialIds = normalizeMaterialIds(input.materialIds ?? []);
      await tx`
        insert into wb_next.generation_jobs
          (id, user_id, request_key, billing_key, prompt, category, copy_job_id, resolution, aspect_ratio, duration_sec, reserved_credits, model, native_quote_version, native_binding, native_billing_point)
        values (${id}, ${input.userId}, ${input.requestKey}, ${`generation:${id}`}, ${input.prompt},
          ${input.category ?? null},
          ${input.copyJobId ?? null},
          ${input.resolution}, ${input.aspectRatio}, ${input.durationSec}, ${reservedCredits}, ${model}, ${nativeQuoteVersion ?? null}, ${nativeBinding ?? null}, ${nativeQuoteVersion ? 'preview' : null})
      `;
      for (const [position, materialId] of materialIds.entries()) {
        await tx`insert into wb_next.generation_job_materials (job_id, material_id, position) values (${id}, ${materialId}, ${position})`;
      }
      await tx`insert into wb_next.outbox (id, job_id, workflow_id, type) values (${randomUUID()}, ${id}, ${`generation:${id}`}, 'generation.requested')`;
      return get({ userId: input.userId, jobId: id });
    },
    /** Idempotent resume signal carrier; the partial unique index keeps one pending resume per job. */
    async requestResume(jobId: string): Promise<void> {
      await tx`
        insert into wb_next.outbox (id, job_id, workflow_id, type)
        values (${randomUUID()}, ${jobId}, ${`generation:${jobId}`}, 'generation.resume')
        on conflict do nothing
      `;
    },
    async prepareComplete(input: CompleteGenerationInput): Promise<GenerationJob> {
      text(input.outputRef, 'outputRef', 500);
      // References are opaque internal identifiers, never external provider URLs.
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input.outputRef)) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'outputRef must be an internal reference');
      }
      if (!Number.isSafeInteger(input.actualCredits) || input.actualCredits < 0 ||
          (input.actualCostCents !== undefined && (!Number.isSafeInteger(input.actualCostCents) || input.actualCostCents < 0))) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid actual generation amount');
      }
      const existing = await get(input, true);
      if (existing.status === 'failed') conflict();
      if (existing.status === 'succeeded' && (existing.outputRef !== input.outputRef ||
          existing.actualCredits !== input.actualCredits || existing.actualCostCents !== (input.actualCostCents ?? null))) conflict();
      if (input.actualCredits > existing.reservedCredits) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Actual credits exceed reservation');
      }
      return existing;
    },
    async recordNativePreviewCharge(input: GenerationLocator): Promise<void> {
      const existing = await get(input, true);
      if (existing.status !== 'accepted' || existing.settlementPoint !== 'preview' || !existing.nativeQuoteVersion) conflict();
      if (existing.actualCredits !== null && existing.actualCredits !== existing.reservedCredits) conflict();
      await tx`update wb_next.generation_jobs set actual_credits=reserved_credits where id=${input.jobId} and user_id=${input.userId} and actual_credits is null`;
    },
    async complete(input: CompleteGenerationInput): Promise<GenerationJob> {
      await tx`update wb_next.generation_jobs set status = 'succeeded', output_ref = ${input.outputRef},
        actual_credits = ${input.actualCredits}, actual_cost_cents = ${input.actualCostCents ?? null}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async prepareFail(input: FailGenerationInput): Promise<GenerationJob> {
      text(input.failureCode, 'failureCode', 200);
      const existing = await get(input, true);
      if (existing.status === 'succeeded' || (existing.status === 'failed' && existing.failureCode !== input.failureCode)) conflict();
      if (existing.status === 'accepted' && existing.actualCredits !== null) conflict();
      return existing;
    },
    async fail(input: FailGenerationInput): Promise<GenerationJob> {
      await tx`update wb_next.generation_jobs set status = 'failed', failure_code = ${input.failureCode}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async claim(): Promise<GenerationDelivery | null> {
      const leaseToken = randomUUID();
      const [row] = await tx<{
        id: string; type: GenerationDelivery['type']; job_id: string; workflow_id: string; user_id: string; attempts: number; duration_sec: number;
      }[]>`
        with candidate as (
          select id from wb_next.outbox
          where (status = 'pending' and available_at <= clock_timestamp())
             or (status = 'leased' and lease_until <= clock_timestamp())
          order by available_at, id for update skip locked limit 1
        ), claimed as (
          update wb_next.outbox o set status = 'leased', lease_token = ${leaseToken},
            lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1
          from candidate c where o.id = c.id
          returning o.id, o.type, o.job_id, o.workflow_id, o.attempts
        )
        select c.*, j.user_id, j.duration_sec from claimed c join wb_next.generation_jobs j on j.id = c.job_id
      `;
      return row ? {
        id: row.id, type: row.type, jobId: row.job_id, userId: row.user_id,
        workflowId: row.workflow_id, leaseToken, attempt: row.attempts,
        ...(row.duration_sec === 10 ? { nativeMarketing: true as const } : {}),
      } : null;
    },
    async ack(input: { id: string; leaseToken: string }): Promise<void> {
      // UPDATE predicates can be evaluated before waiting for an unchanged locked row.
      // Acquire the row first so the following clock check uses the post-wait time.
      await tx`select id from wb_next.outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.outbox set status = 'delivered', delivered_at = clock_timestamp(),
        lease_token = null, lease_until = null where id = ${input.id} and status = 'leased'
        and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
    async release(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.outbox set status = 'pending', lease_token = null, lease_until = null,
        available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second'
        where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken}
          and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
    /** Unknown-acceptance review queue for the ops channel (cross-user, newest first capped). */
    async listUnknownReviews() {
      return tx<{
        job_id: string; user_id: string; prompt: string; resolution: GenerationJob['resolution'];
        reserved_credits: string; provider_key: string; created_at: Date;
      }[]>`
        select j.id job_id, j.user_id, j.prompt, j.resolution, j.reserved_credits, s.provider_key, j.created_at
        from wb_next.provider_submissions s
        join wb_next.generation_jobs j on j.id = s.job_id
        where s.status = 'unknown'
        order by j.created_at desc limit 200
      `;
    },
  };
}
