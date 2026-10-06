import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { GenerationLocator, ProviderSubmission, SubmissionClaim, SubmissionToken } from '../public';

interface Row { job_id: string; provider_key: string; token: string; status: ProviderSubmission['status']; provider_task_id: string | null }
const view = (row: Row): ProviderSubmission => ({ jobId: row.job_id, providerKey: row.provider_key, status: row.status, providerTaskId: row.provider_task_id });
function conflict(): never { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Provider submission conflicts with recorded state'); }
function text(value: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(character => character.charCodeAt(0) < 32)) {
    throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid provider reference');
  }
}

export function createSubmissionStore(tx: postgres.TransactionSql) {
  async function lockJob(input: GenerationLocator) {
    const [job] = await tx<{ status: string }[]>`select status from wb_next.generation_jobs
      where id = ${input.jobId} and user_id = ${input.userId} for update`;
    if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Generation job not found');
    return job;
  }
  async function locked(input: SubmissionToken): Promise<Row> {
    await lockJob(input);
    const [row] = await tx<Row[]>`select * from wb_next.provider_submissions where job_id = ${input.jobId} for update`;
    if (!row || row.token !== input.token) conflict();
    return row;
  }
  return {
    async get(input: GenerationLocator): Promise<ProviderSubmission | null> {
      const [job] = await tx`select id from wb_next.generation_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
      if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Generation job not found');
      const [row] = await tx<Row[]>`select * from wb_next.provider_submissions where job_id = ${input.jobId}`;
      return row ? view(row) : null;
    },
    async begin(input: GenerationLocator & { providerKey: string }): Promise<SubmissionClaim> {
      text(input.providerKey, 200);
      const job = await lockJob(input);
      const [existing] = await tx<Row[]>`select * from wb_next.provider_submissions where job_id = ${input.jobId} for update`;
      if (existing) {
        if (existing.provider_key !== input.providerKey) conflict();
        return { claimed: false, submission: view(existing) };
      }
      if (job.status !== 'accepted') conflict();
      const token = randomUUID();
      const [row] = await tx<Row[]>`insert into wb_next.provider_submissions (job_id, provider_key, token)
        values (${input.jobId}, ${input.providerKey}, ${token}) returning *`;
      return { claimed: true, token, submission: view(row) };
    },
    async accepted(input: SubmissionToken & { providerTaskId: string }): Promise<ProviderSubmission> {
      text(input.providerTaskId, 500);
      const row = await locked(input);
      if (row.status === 'rejected' || (row.status === 'submitted' && row.provider_task_id !== input.providerTaskId)) conflict();
      if (row.status === 'submitted') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.provider_submissions set status = 'submitted',
        provider_task_id = ${input.providerTaskId}, updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`;
      return view(updated);
    },
    async unknown(input: SubmissionToken): Promise<ProviderSubmission> {
      const row = await locked(input);
      if (row.status !== 'submitting') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.provider_submissions set status = 'unknown',
        updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`;
      return view(updated);
    },
    async reject(input: SubmissionToken): Promise<ProviderSubmission> {
      const row = await locked(input);
      if (row.status === 'submitted') conflict();
      if (row.status === 'rejected') return view(row);
      const [updated] = await tx<Row[]>`update wb_next.provider_submissions set status = 'rejected',
        updated_at = clock_timestamp() where job_id = ${input.jobId} returning *`;
      return view(updated);
    },
  };
}
