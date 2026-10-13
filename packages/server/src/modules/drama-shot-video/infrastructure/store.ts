import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type {
  CompleteDramaShotVideoInput, DramaShotVideoDelivery, DramaShotVideoJob, PlanVideoSnapshot,
  DramaShotVideoJobLocator, FailDramaShotVideoInput,
} from '../public';

interface JobRow {
  id: string; shot_id: string; candidate_id: string; user_id: string; request_key: string; model: string; reserved_credits: string;
  status: DramaShotVideoJob['status']; output_ref: string | null; actual_credits: string | null; actual_cost_cents: string | null;
  failure_code: string | null; created_at: Date; finished_at: Date | null;
  plan_snapshot: PlanVideoSnapshot | null;
}

function job(row: JobRow): DramaShotVideoJob {
  return {
    id: row.id, shotId: row.shot_id, candidateId: row.candidate_id, requestKey: row.request_key, model: row.model,
    reservedCredits: Number(row.reserved_credits), status: row.status, outputRef: row.output_ref, plan: row.plan_snapshot,
    actualCredits: row.actual_credits === null ? null : Number(row.actual_credits),
    actualCostCents: row.actual_cost_cents === null ? null : Number(row.actual_cost_cents), failureCode: row.failure_code,
    createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

function text(value: string, name: string, max: number): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || value.includes('\u0000')) {
    throw new DomainError(400, ErrorCode.VALIDATION, `Invalid ${name}`);
  }
}
function conflict(): never {
  throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama shot video request conflicts with existing state');
}

export function createDramaShotVideoStore(tx: postgres.TransactionSql) {
  async function get(input: DramaShotVideoJobLocator, lock = false): Promise<DramaShotVideoJob> {
    const rows = lock
      ? await tx<JobRow[]>`select * from wb_next.drama_shot_video_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.drama_shot_video_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama shot video job not found');
    return job(rows[0]);
  }
  return {
    get,
    async findRequest(input: { userId: string; requestKey: string }): Promise<DramaShotVideoJob | null> {
      text(input.requestKey, 'requestKey', 200);
      const [row] = await tx<JobRow[]>`select * from wb_next.drama_shot_video_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update`;
      if (!row) return null;
      return job(row);
    },
    async insert(input: { userId: string; requestKey: string }, id: string, shotId: string, candidateId: string, reservedCredits: number, model: string, plan: PlanVideoSnapshot | null = null): Promise<DramaShotVideoJob> {
      try {
        await tx`
          insert into wb_next.drama_shot_video_jobs (id, shot_id, candidate_id, user_id, request_key, billing_key, model, reserved_credits, plan_snapshot)
          values (${id}, ${shotId}, ${candidateId}, ${input.userId}, ${input.requestKey}, ${`drama-video:${id}`}, ${model}, ${reservedCredits}, ${plan ? tx.json(plan as unknown as postgres.JSONValue) : null})`;
      } catch (error) {
        const detail = error as { code?: string; constraint?: string };
        if (detail.code === '23505') {
          if (detail.constraint === 'drama_shot_video_jobs_active_uq') {
            throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'A shot video job is already running for this shot');
          }
          conflict();
        }
        throw error;
      }
      await tx`insert into wb_next.drama_shot_video_outbox (id, job_id, workflow_id, type) values (${randomUUID()}, ${id}, ${`drama-video:${id}`}, 'drama_video.requested')`;
      return get({ userId: input.userId, jobId: id });
    },
    async listForCandidates(input: { userId: string; candidateIds: string[] }): Promise<DramaShotVideoJob[]> {
      if (!input.candidateIds.length) return [];
      const rows = await tx<JobRow[]>`
        select distinct on (candidate_id) * from wb_next.drama_shot_video_jobs
        where user_id = ${input.userId} and candidate_id = any(${input.candidateIds})
        order by candidate_id, created_at desc, id desc`;
      return rows.map(job);
    },
    async requestResume(jobId: string): Promise<void> {
      await tx`
        insert into wb_next.drama_shot_video_outbox (id, job_id, workflow_id, type)
        values (${randomUUID()}, ${jobId}, ${`drama-video:${jobId}`}, 'drama_video.resume')
        on conflict do nothing`;
    },
    async prepareComplete(input: CompleteDramaShotVideoInput): Promise<DramaShotVideoJob> {
      text(input.outputRef, 'outputRef', 500);
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input.outputRef)) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'outputRef must be an internal reference');
      }
      if (!Number.isSafeInteger(input.actualCredits) || input.actualCredits < 0 ||
          (input.actualCostCents !== undefined && (!Number.isSafeInteger(input.actualCostCents) || input.actualCostCents < 0))) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid actual drama shot video amount');
      }
      const existing = await get(input, true);
      if (existing.status === 'failed' || (existing.status === 'succeeded' && (existing.outputRef !== input.outputRef ||
          existing.actualCredits !== input.actualCredits || existing.actualCostCents !== (input.actualCostCents ?? null)))) conflict();
      if (input.actualCredits > existing.reservedCredits) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Actual credits exceed reservation');
      }
      return existing;
    },
    async complete(input: CompleteDramaShotVideoInput): Promise<DramaShotVideoJob> {
      await tx`update wb_next.drama_shot_video_jobs set status = 'succeeded', output_ref = ${input.outputRef},
        actual_credits = ${input.actualCredits}, actual_cost_cents = ${input.actualCostCents ?? null}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async prepareFail(input: FailDramaShotVideoInput): Promise<DramaShotVideoJob> {
      text(input.failureCode, 'failureCode', 200);
      const existing = await get(input, true);
      if (existing.status === 'succeeded' || (existing.status === 'failed' && existing.failureCode !== input.failureCode)) conflict();
      return existing;
    },
    async fail(input: FailDramaShotVideoInput): Promise<DramaShotVideoJob> {
      await tx`update wb_next.drama_shot_video_jobs set status = 'failed', failure_code = ${input.failureCode}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async claim(): Promise<DramaShotVideoDelivery | null> {
      const leaseToken = randomUUID();
      const [row] = await tx<{
        id: string; type: DramaShotVideoDelivery['type']; job_id: string; workflow_id: string; user_id: string; attempts: number;
      }[]>`
        with candidate as (
          select id from wb_next.drama_shot_video_outbox
          where (status = 'pending' and available_at <= clock_timestamp())
             or (status = 'leased' and lease_until <= clock_timestamp())
          order by available_at, id for update skip locked limit 1
        ), claimed as (
          update wb_next.drama_shot_video_outbox o set status = 'leased', lease_token = ${leaseToken},
            lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1
          from candidate c where o.id = c.id
          returning o.id, o.type, o.job_id, o.workflow_id, o.attempts
        )
        select c.*, j.user_id from claimed c join wb_next.drama_shot_video_jobs j on j.id = c.job_id
      `;
      return row ? { id: row.id, type: row.type, jobId: row.job_id, userId: row.user_id,
        workflowId: row.workflow_id, leaseToken, attempt: row.attempts } : null;
    },
    async ack(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_shot_video_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_shot_video_outbox set status = 'delivered', delivered_at = clock_timestamp(),
        lease_token = null, lease_until = null where id = ${input.id} and status = 'leased'
        and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
    async release(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_shot_video_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_shot_video_outbox set status = 'pending', lease_token = null, lease_until = null,
        available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second'
        where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken}
          and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
  };
}
