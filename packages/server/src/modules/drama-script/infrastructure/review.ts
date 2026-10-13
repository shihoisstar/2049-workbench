import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, ReviewScriptRequest } from '@wb/contracts';
import type { ReviewScriptRequestValue, ScriptReviewListValue, ScriptReviewResultValue } from '@wb/contracts';
import { DomainError } from '../../../errors';

interface ReviewRow { job_id: string; request_key: string; action: 'receipt' | 'reject'; request_hash: string; reason: string; evidence_reference: string; auth_source: 'ops-token'; created_at: Date }
const view = (row: ReviewRow): ScriptReviewResultValue['review'] => ({ action: row.action, requestKey: row.request_key, reason: row.reason, evidenceReference: row.evidence_reference, authSource: row.auth_source, reviewedAt: row.created_at.toISOString() });
const conflict = (): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script review conflicts or is no longer required'); };
export function createScriptReviewStore(tx: postgres.TransactionSql) {
  return {
    async locate(jobId: string) {
      const [job] = await tx<{ user_id: string; project_id: string }[]>`select user_id, project_id from wb_next.drama_script_jobs where id = ${jobId}`;
      if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Script review not found'); return { userId: job.user_id, projectId: job.project_id };
    },
    async list(cursor?: string): Promise<ScriptReviewListValue> {
      if (cursor && !(await tx`select id from wb_next.drama_script_jobs where id = ${cursor} and submitted_at is not null`).length) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Review cursor not found');
      const rows = await tx<{ id: string; project_id: string; snapshot: { title: string }; binding: { model: string }; submission_state: 'unknown' | 'submitting'; quote: { credits: number } | null; submitted_at: Date }[]>`
        select * from wb_next.drama_script_jobs where binding is not null and status = 'accepted'
        and (submission_state = 'unknown' or (submission_state = 'submitting' and submitted_at <= clock_timestamp() - interval '2 minutes'))
        and (${cursor ?? null}::uuid is null or (submitted_at, id) > (select submitted_at, id from wb_next.drama_script_jobs where id = ${cursor ?? null}::uuid))
        order by submitted_at, id limit 21`;
      return { items: rows.slice(0, 20).map(row => ({ jobId: row.id, projectId: row.project_id, title: row.snapshot.title, model: row.binding.model,
        submissionStatus: row.submission_state, reservedCredits: row.quote?.credits ?? 0, submittedAt: row.submitted_at.toISOString() })), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async prepare(jobId: string, body: ReviewScriptRequestValue) {
      const request = ReviewScriptRequest.parse(body);
      const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const [job] = await tx<{ user_id: string; submission_token: string | null; submission_state: string | null }[]>`select user_id, submission_token, submission_state from wb_next.drama_script_jobs where id = ${jobId} for update`;
      if (!job) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Script job not found');
      const [review] = await tx<ReviewRow[]>`select * from wb_next.drama_script_reviews where job_id = ${jobId} or request_key = ${request.requestKey} limit 1`;
      if (review) {
        if (review.job_id !== jobId || review.request_key !== request.requestKey || review.request_hash !== hash) conflict();
        return { replay: true as const, review: view(review), locator: { userId: job.user_id, jobId } };
      }
      const eligible = await tx`select id from wb_next.drama_script_jobs where id = ${jobId} and binding is not null and status = 'accepted' and response is null
        and (submission_state = 'unknown' or (submission_state = 'submitting' and submitted_at <= clock_timestamp() - interval '2 minutes'))`;
      if (!eligible.length || !job.submission_token) conflict();
      return { replay: false as const, hash, request, priorState: job.submission_state!, locator: { userId: job.user_id, jobId }, token: job.submission_token! };
    },
    async record(input: { jobId: string; hash: string; priorState: string; request: ReviewScriptRequestValue }) {
      const [row] = await tx<ReviewRow[]>`insert into wb_next.drama_script_reviews (job_id, request_key, action, request_hash, reason, evidence_reference, prior_state, auth_source)
        values (${input.jobId}, ${input.request.requestKey}, ${input.request.action}, ${input.hash}, ${input.request.reason}, ${input.request.evidenceReference}, ${input.priorState}, 'ops-token')
        on conflict do nothing returning *`;
      if (!row) conflict();
      return view(row);
    },
  };
}
