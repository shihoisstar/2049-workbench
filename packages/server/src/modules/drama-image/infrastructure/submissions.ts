import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { DramaImageJobLocator, DramaImageSubmission, DramaImageSubmissionClaim, DramaImageSubmissionToken } from '../public';

interface Row { job_id: string; provider_key: string; token: string; status: DramaImageSubmission['status']; provider_task_id: string | null }
const view = (row: Row): DramaImageSubmission => ({ jobId: row.job_id, providerKey: row.provider_key, status: row.status, providerTaskId: row.provider_task_id });
function conflict(): never { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama image submission conflicts with recorded state'); }
function text(value: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(character => character.charCodeAt(0) < 32)) {
    throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid provider reference');
  }
}

export function createDramaImageSubmissionStore(tx: postgres.TransactionSql) {
  async function lockJob(input: DramaImageJobLocator) {
    const [job] = await tx<{ status: string; target: string; portrait: { binding: { providerKey: string } } | null }[]>`select status, target, portrait from wb_next.drama_image_jobs
      where id = ${input.jobId} and user_id = ${input.userId} for update`;
    if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama image job not found');
    return job;
  }
  async function locked(input: DramaImageSubmissionToken): Promise<Row> {
    await lockJob(input);
    const [row] = await tx<Row[]>`select * from wb_next.drama_image_submissions where job_id = ${input.jobId} for update`;
    if (!row || row.token !== input.token) conflict();
    return row;
  }
  return {
    async get(input: DramaImageJobLocator): Promise<DramaImageSubmission | null> {
      const [job] = await tx`select id from wb_next.drama_image_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
      if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama image job not found');
      const [row] = await tx<Row[]>`select * from wb_next.drama_image_submissions where job_id = ${input.jobId}`;
      return row ? view(row) : null;
    },
    async begin(input: DramaImageJobLocator & { providerKey: string }): Promise<DramaImageSubmissionClaim> {
      text(input.providerKey, 200);
      const job = await lockJob(input);
      if (job.target === 'portrait' && job.portrait?.binding.providerKey !== input.providerKey) conflict();
      const [existing] = await tx<Row[]>`select * from wb_next.drama_image_submissions where job_id = ${input.jobId} for update`;
      if (existing) {
        if (existing.provider_key !== input.providerKey) conflict();
        if (job.target === 'portrait' && existing.status === 'submitting') {
          await tx`update wb_next.drama_image_submissions set status = 'unknown', updated_at = clock_timestamp() where job_id = ${input.jobId}`;
          existing.status = 'unknown';
        }
        return { claimed: false, submission: view(existing) };
      }
      if (job.status !== 'accepted') conflict();
      const token = randomUUID();
      const [row] = await tx<Row[]>`insert into wb_next.drama_image_submissions (job_id, provider_key, token)
        values (${input.jobId}, ${input.providerKey}, ${token}) returning *`;
      return { claimed: true, token, submission: view(row) };
    },
    async accepted(input: DramaImageSubmissionToken & { providerTaskId: string }): Promise<DramaImageSubmission> {
      text(input.providerTaskId, 500);
      const row = await locked(input);
      if (row.status === 'rejected' || (row.status === 'submitted' && row.provider_task_id !== input.providerTaskId)) conflict();
      if (row.status === 'submitted') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.drama_image_submissions set status = 'submitted',
        provider_task_id = ${input.providerTaskId}, updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`.catch(error => {
          if (error.code === '23505' && error.constraint_name === 'drama_portrait_provider_task_uq') conflict();
          throw error;
        });
      return view(updated);
    },
    async unknown(input: DramaImageSubmissionToken): Promise<DramaImageSubmission> {
      const row = await locked(input);
      if (row.status !== 'submitting') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.drama_image_submissions set status = 'unknown',
        updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`;
      return view(updated);
    },
    async reject(input: DramaImageSubmissionToken): Promise<DramaImageSubmission> {
      const row = await locked(input);
      if (row.status === 'submitted') conflict();
      if (row.status === 'rejected') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.drama_image_submissions set status = 'rejected',
        updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`;
      return view(updated);
    },
  };
}
