import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type {
  CompleteDramaImageInput, CreateDramaImageJobInput, DramaImageDelivery, DramaImageJob,
  DramaImageJobLocator, FailDramaImageInput, PortraitSnapshot,
} from '../public';

interface JobRow {
  id: string; candidate_id: string | null; user_id: string; request_key: string; model: string; reserved_credits: string;
  target: 'candidate' | 'portrait'; project_id: string | null; role_key: string | null; portrait: PortraitSnapshot | null;
  status: DramaImageJob['status']; output_ref: string | null; actual_credits: string | null; actual_cost_cents: string | null;
  failure_code: string | null; created_at: Date; finished_at: Date | null;
}

function job(row: JobRow): DramaImageJob {
  return {
    target: row.target, projectId: row.project_id, roleKey: row.role_key, portrait: row.portrait,
    id: row.id, candidateId: row.candidate_id, requestKey: row.request_key, model: row.model, reservedCredits: Number(row.reserved_credits),
    status: row.status, outputRef: row.output_ref, actualCredits: row.actual_credits === null ? null : Number(row.actual_credits),
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
  throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama image request conflicts with existing state');
}

export function createDramaImageStore(tx: postgres.TransactionSql) {
  async function get(input: DramaImageJobLocator, lock = false): Promise<DramaImageJob> {
    const rows = lock
      ? await tx<JobRow[]>`select * from wb_next.drama_image_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.drama_image_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama image job not found');
    return job(rows[0]);
  }
  return {
    get,
    async findPortraitRequest(input: { userId: string; projectId: string; roleKey: string; requestKey: string; quoteVersion: string; preparationRevision: number }) {
      const [row] = await tx<JobRow[]>`select * from wb_next.drama_image_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update`;
      if (!row) return null;
      if (row.target !== 'portrait' || row.project_id !== input.projectId || row.role_key !== input.roleKey || row.portrait?.quoteVersion !== input.quoteVersion || row.portrait.preparationRevision !== input.preparationRevision) conflict();
      return job(row);
    },
    async insertPortrait(input: { userId: string; projectId: string; roleKey: string; requestKey: string; id: string; credits: number; snapshot: PortraitSnapshot }) {
      const [pending] = await tx`select id from wb_next.drama_image_jobs where project_id = ${input.projectId} and role_key = ${input.roleKey} and target = 'portrait' and status = 'accepted'`;
      if (pending) conflict();
      await tx`insert into wb_next.drama_image_jobs (id, candidate_id, target, project_id, role_key, portrait, user_id, request_key, billing_key, model, reserved_credits)
        values (${input.id}, null, 'portrait', ${input.projectId}, ${input.roleKey}, ${tx.json(input.snapshot as unknown as postgres.JSONValue)}, ${input.userId}, ${input.requestKey}, ${`drama-image:${input.id}`}, ${input.snapshot.binding.model}, ${input.credits})`;
      await tx`insert into wb_next.drama_image_outbox (id, job_id, workflow_id, type) values (${randomUUID()}, ${input.id}, ${`drama-image:${input.id}`}, 'drama_image.requested')`;
      return get({ userId: input.userId, jobId: input.id });
    },
    async listPortraits(input: { userId: string; projectId: string; roleKey: string; cursor?: string }) {
      if (input.cursor && !(await tx`select id from wb_next.drama_image_jobs where id = ${input.cursor} and user_id = ${input.userId} and project_id = ${input.projectId} and role_key = ${input.roleKey} and target = 'portrait'`).length) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Portrait cursor not found');
      const rows = await tx<JobRow[]>`select * from wb_next.drama_image_jobs where user_id = ${input.userId} and project_id = ${input.projectId} and role_key = ${input.roleKey} and target = 'portrait'
        and (${input.cursor ?? null}::uuid is null or (created_at, id) < (select created_at, id from wb_next.drama_image_jobs where id = ${input.cursor ?? null}::uuid)) order by created_at desc, id desc limit 21`;
      return { items: rows.slice(0, 20).map(job), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async findRequest(input: CreateDramaImageJobInput): Promise<DramaImageJob | null> {
      text(input.requestKey, 'requestKey', 200);
      const [row] = await tx<JobRow[]>`select * from wb_next.drama_image_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update`;
      if (!row) return null;
      const existing = job(row);
      if (existing.candidateId !== input.candidateId) conflict();
      return existing;
    },
    async insert(input: CreateDramaImageJobInput, id: string, reservedCredits: number, model: string): Promise<DramaImageJob> {
      await tx`
        insert into wb_next.drama_image_jobs (id, candidate_id, user_id, request_key, billing_key, model, reserved_credits)
        values (${id}, ${input.candidateId}, ${input.userId}, ${input.requestKey}, ${`drama-image:${id}`}, ${model}, ${reservedCredits})`;
      await tx`insert into wb_next.drama_image_outbox (id, job_id, workflow_id, type) values (${randomUUID()}, ${id}, ${`drama-image:${id}`}, 'drama_image.requested')`;
      return get({ userId: input.userId, jobId: id });
    },
    async requestResume(jobId: string): Promise<void> {
      await tx`
        insert into wb_next.drama_image_outbox (id, job_id, workflow_id, type)
        values (${randomUUID()}, ${jobId}, ${`drama-image:${jobId}`}, 'drama_image.resume')
        on conflict do nothing`;
    },
    async prepareComplete(input: CompleteDramaImageInput): Promise<DramaImageJob> {
      text(input.outputRef, 'outputRef', 500);
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input.outputRef)) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'outputRef must be an internal reference');
      }
      if (!Number.isSafeInteger(input.actualCredits) || input.actualCredits < 0 ||
          (input.actualCostCents !== undefined && (!Number.isSafeInteger(input.actualCostCents) || input.actualCostCents < 0))) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid actual drama image amount');
      }
      const existing = await get(input, true);
      if (existing.status === 'failed' || (existing.status === 'succeeded' && (existing.outputRef !== input.outputRef ||
          existing.actualCredits !== input.actualCredits || existing.actualCostCents !== (input.actualCostCents ?? null)))) conflict();
      if (input.actualCredits > existing.reservedCredits) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Actual credits exceed reservation');
      }
      return existing;
    },
    async complete(input: CompleteDramaImageInput): Promise<DramaImageJob> {
      await tx`update wb_next.drama_image_jobs set status = 'succeeded', output_ref = ${input.outputRef},
        actual_credits = ${input.actualCredits}, actual_cost_cents = ${input.actualCostCents ?? null}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async prepareFail(input: FailDramaImageInput): Promise<DramaImageJob> {
      text(input.failureCode, 'failureCode', 200);
      const existing = await get(input, true);
      if (existing.status === 'succeeded' || (existing.status === 'failed' && existing.failureCode !== input.failureCode)) conflict();
      return existing;
    },
    async fail(input: FailDramaImageInput): Promise<DramaImageJob> {
      await tx`update wb_next.drama_image_jobs set status = 'failed', failure_code = ${input.failureCode}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async claim(): Promise<DramaImageDelivery | null> {
      const leaseToken = randomUUID();
      const [row] = await tx<{
        id: string; type: DramaImageDelivery['type']; job_id: string; workflow_id: string; user_id: string; attempts: number; target: 'candidate' | 'portrait';
      }[]>`
        with candidate as (
          select id from wb_next.drama_image_outbox
          where (status = 'pending' and available_at <= clock_timestamp())
             or (status = 'leased' and lease_until <= clock_timestamp())
          order by available_at, id for update skip locked limit 1
        ), claimed as (
          update wb_next.drama_image_outbox o set status = 'leased', lease_token = ${leaseToken},
            lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1
          from candidate c where o.id = c.id
          returning o.id, o.type, o.job_id, o.workflow_id, o.attempts
        )
        select c.*, j.user_id, j.target from claimed c join wb_next.drama_image_jobs j on j.id = c.job_id
      `;
      return row ? { id: row.id, type: row.type, jobId: row.job_id, userId: row.user_id,
        workflowId: row.workflow_id, leaseToken, attempt: row.attempts, target: row.target } : null;
    },
    async ack(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_image_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_image_outbox set status = 'delivered', delivered_at = clock_timestamp(),
        lease_token = null, lease_until = null where id = ${input.id} and status = 'leased'
        and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
    async release(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_image_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_image_outbox set status = 'pending', lease_token = null, lease_until = null,
        available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second'
        where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken}
          and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict();
    },
  };
}
