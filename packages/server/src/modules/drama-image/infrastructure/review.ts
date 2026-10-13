import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, ReviewPortraitRequest } from '@wb/contracts';
import type { PortraitReviewListValue, ReviewPortraitRequestValue, PortraitReviewResultValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
interface Row { job_id: string; request_key: string; action: 'receipt' | 'reject'; request_hash: string; reason: string; evidence_reference: string; auth_source: 'ops-token'; created_at: Date }
const view = (row: Row): PortraitReviewResultValue['review'] => ({ action: row.action, requestKey: row.request_key, reason: row.reason, evidenceReference: row.evidence_reference, authSource: row.auth_source, reviewedAt: row.created_at.toISOString() });
function conflict(): never { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Portrait review conflicts or is no longer required'); }
export function createPortraitReviewStore(tx: postgres.TransactionSql) {
  return {
    async list(cursor?: string): Promise<PortraitReviewListValue> {
      if (cursor && !(await tx`select j.id from wb_next.drama_image_jobs j join wb_next.drama_image_submissions s on s.job_id = j.id where j.id = ${cursor} and j.target = 'portrait'`).length) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Review cursor not found');
      const rows = await tx<{ id: string; project_id: string; portrait: { roleName: string; binding: { model: string; provider: 'mock' | 'atlas' } }; status: 'submitting' | 'unknown'; reserved_credits: number; submitted_at: Date }[]>`
        select j.id, j.project_id, j.portrait, j.reserved_credits, s.status, s.created_at as submitted_at from wb_next.drama_image_jobs j join wb_next.drama_image_submissions s on s.job_id = j.id
        where j.target = 'portrait' and j.status = 'accepted' and (s.status = 'unknown' or (s.status = 'submitting' and s.created_at <= clock_timestamp() - interval '2 minutes'))
        and (${cursor ?? null}::uuid is null or (s.created_at, j.id) > (select created_at, job_id from wb_next.drama_image_submissions where job_id = ${cursor ?? null}::uuid)) order by s.created_at, j.id limit 21`;
      return { items: rows.slice(0, 20).map(row => ({ jobId: row.id, projectId: row.project_id, roleName: row.portrait.roleName, model: row.portrait.binding.model, provider: row.portrait.binding.provider,
        submissionStatus: row.status, reservedCredits: Number(row.reserved_credits), submittedAt: row.submitted_at.toISOString() })), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async prepare(jobId: string, body: ReviewPortraitRequestValue) {
      const request = ReviewPortraitRequest.parse(body); const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const [job] = await tx<{ user_id: string; status: string; portrait: { binding: { provider: string; model: string; providerKey: string } } }[]>`select user_id, status, portrait from wb_next.drama_image_jobs where id = ${jobId} and target = 'portrait' for update`;
      if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Portrait job not found');
      const locator = { userId: job.user_id, jobId };
      const [review] = await tx<Row[]>`select * from wb_next.drama_portrait_reviews where job_id = ${jobId} or request_key = ${request.requestKey} limit 1`;
      if (review) { if (review.job_id !== jobId || review.request_key !== request.requestKey || review.request_hash !== hash) conflict(); return { replay: true as const, locator, review: view(review) }; }
      const [submission] = await tx<{ token: string; status: string; provider_key: string; eligible: boolean }[]>`select *, (status = 'unknown' or (status = 'submitting' and created_at <= clock_timestamp() - interval '2 minutes')) as eligible from wb_next.drama_image_submissions where job_id = ${jobId} for update`;
      if (job.status !== 'accepted' || !submission?.eligible || submission.provider_key !== job.portrait.binding.providerKey) conflict();
      if (request.action === 'receipt' && (request.model !== job.portrait.binding.model || request.provider !== job.portrait.binding.provider)) conflict();
      return { replay: false as const, locator, token: submission.token, priorState: submission.status, hash, request };
    },
    async record(input: { jobId: string; hash: string; priorState: string; request: ReviewPortraitRequestValue }) {
      const [row] = await tx<Row[]>`insert into wb_next.drama_portrait_reviews (job_id, request_key, action, request_hash, reason, evidence_reference, prior_state, auth_source)
        values (${input.jobId}, ${input.request.requestKey}, ${input.request.action}, ${input.hash}, ${input.request.reason}, ${input.request.evidenceReference}, ${input.priorState}, 'ops-token') on conflict do nothing returning *`;
      if (!row) conflict(); return view(row);
    },
  };
}
