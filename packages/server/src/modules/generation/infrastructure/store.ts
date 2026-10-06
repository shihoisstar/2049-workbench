import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type {
  CompleteGenerationInput, CreateGenerationInput, FailGenerationInput,
  GenerationDelivery, GenerationJob, GenerationLocator,
} from '../public';

interface JobRow {
  id: string; user_id: string; request_key: string; prompt: string;
  resolution: GenerationJob['resolution']; aspect_ratio: GenerationJob['aspectRatio']; duration_sec: 5;
  reserved_credits: string; model: string; status: GenerationJob['status'];
  output_ref: string | null; actual_credits: string | null; actual_cost_cents: string | null;
  failure_code: string | null; created_at: Date; finished_at: Date | null;
}

function job(row: JobRow): GenerationJob {
  return {
    id: row.id, userId: row.user_id, requestKey: row.request_key, prompt: row.prompt,
    resolution: row.resolution, aspectRatio: row.aspect_ratio, durationSec: row.duration_sec,
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
  async function get(input: GenerationLocator, lock = false): Promise<GenerationJob> {
    const rows = lock
      ? await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.generation_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Generation job not found');
    return job(rows[0]);
  }

  return {
    get,
    async findRequest(input: CreateGenerationInput): Promise<GenerationJob | null> {
      text(input.requestKey, 'requestKey', 200);
      text(input.prompt, 'prompt', 3000);
      if (!['480p', '720p'].includes(input.resolution) ||
          !['9:16', '16:9', '1:1'].includes(input.aspectRatio) || input.durationSec !== 5 ||
          Object.keys(input).some(key => !['userId', 'requestKey', 'prompt', 'resolution', 'aspectRatio', 'durationSec'].includes(key))) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Unsupported generation input');
      }
      const [row] = await tx<JobRow[]>`
        select * from wb_next.generation_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update
      `;
      if (!row) return null;
      const existing = job(row);
      if (existing.prompt !== input.prompt || existing.resolution !== input.resolution ||
          existing.aspectRatio !== input.aspectRatio || existing.durationSec !== input.durationSec) conflict();
      return existing;
    },
    async insert(input: CreateGenerationInput, id: string, reservedCredits: number, model: string): Promise<GenerationJob> {
      await tx`
        insert into wb_next.generation_jobs
          (id, user_id, request_key, billing_key, prompt, resolution, aspect_ratio, duration_sec, reserved_credits, model)
        values (${id}, ${input.userId}, ${input.requestKey}, ${`generation:${id}`}, ${input.prompt},
          ${input.resolution}, ${input.aspectRatio}, ${input.durationSec}, ${reservedCredits}, ${model})
      `;
      await tx`insert into wb_next.outbox (id, job_id, workflow_id) values (${randomUUID()}, ${id}, ${`generation:${id}`})`;
      return get({ userId: input.userId, jobId: id });
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
        id: string; job_id: string; workflow_id: string; user_id: string; attempts: number;
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
          returning o.id, o.job_id, o.workflow_id, o.attempts
        )
        select c.*, j.user_id from claimed c join wb_next.generation_jobs j on j.id = c.job_id
      `;
      return row ? {
        id: row.id, type: 'generation.requested', jobId: row.job_id, userId: row.user_id,
        workflowId: row.workflow_id, leaseToken, attempt: row.attempts,
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
  };
}
