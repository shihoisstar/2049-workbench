import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, MarketingCopyInput, MarketingCopyJob, ReviewScriptRequest, SubmitMarketingCopy, TextGenerationReceipt } from '@wb/contracts';
import type { MarketingCopyInputValue, MarketingCopyJobValue, MarketingCopyQuoteValue, MarketingCopyResultValue, ReviewScriptRequestValue, SubmitMarketingCopyValue, TextGenerationReceiptValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { ScriptBinding, ScriptRequest } from '../../drama-script/public';
import type { CopyAdmission, CopyDelivery, CopyLocator, CopySubmission } from '../public';
import { parseMarketingCopy } from '../prompt';

interface Row { duration_sec: 5 | 10; estimated_cost_cents: string | null; id: string; user_id: string; request_key: string; category: MarketingCopyInputValue['category']; source_text: string; quote_version: string; reserved_credits: string; binding: ScriptBinding | null; request: ScriptRequest | null; response: TextGenerationReceiptValue | null; result: MarketingCopyResultValue | null; status: MarketingCopyJobValue['status']; submission_state: MarketingCopyJobValue['submissionStatus']; token: string | null; billing_state: MarketingCopyJobValue['billingStatus']; failure_code: string | null; submitted_at: Date | null; created_at: Date; finished_at: Date | null }
const conflict = (message: string): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, message); };
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const view = (row: Row): MarketingCopyJobValue => MarketingCopyJob.parse({ id: row.id, requestKey: row.request_key, category: row.category, durationSec: row.duration_sec, sourceText: row.source_text, quoteVersion: row.quote_version, provider: row.binding ? 'atlas' : 'mock', status: row.status, submissionStatus: row.submission_state, billingStatus: row.billing_state, reservedCredits: Number(row.reserved_credits), actualCredits: row.billing_state === 'held' ? null : row.billing_state === 'settled' ? Number(row.reserved_credits) : 0, failureCode: row.failure_code, result: row.result, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null });
function quote(input: { userId: string; request: MarketingCopyInputValue; admission: CopyAdmission }): MarketingCopyQuoteValue {
  MarketingCopyInput.parse(input.request); const offer = input.admission.offer;
  if (!offer && !input.admission.mockAvailable) return { mode: 'disabled', credits: null, version: null };
  if (offer && (!Number.isSafeInteger(offer.credits) || offer.credits < 1 || !/^[a-f0-9]{64}$/.test(offer.binding.providerKey) || offer.binding.provider !== 'atlas' || !offer.binding.model.trim() || offer.binding.model.length > 200 || offer.estimatedCostCents !== null && (!Number.isSafeInteger(offer.estimatedCostCents) || offer.estimatedCostCents < 0))) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid copy offer');
  return { mode: offer ? 'atlas' : 'mock', credits: offer?.credits ?? 0, version: 'copy-v1:' + createHash('sha256').update(JSON.stringify({ userId: input.userId, request: MarketingCopyInput.parse(input.request), offer })).digest('hex') };
}
export function createMarketingCopyStore(tx: postgres.TransactionSql) {
  async function row(input: CopyLocator, lock = false): Promise<Row> {
    const rows = lock ? await tx<Row[]>`select * from wb_next.marketing_copy_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<Row[]>`select * from wb_next.marketing_copy_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Copy job not found'); return rows[0];
  }
  async function token(input: CopyLocator & { token: string }) { const found = await row(input, true); if (found.token !== input.token || !found.binding) conflict('Copy submission token mismatch'); return found; }
  async function enqueue(jobId: string, type: 'requested' | 'resume') { await tx`insert into wb_next.marketing_copy_outbox (id, job_id, workflow_id, type) values (${randomUUID()}, ${jobId}, ${`marketing-copy:${jobId}`}, ${type}) on conflict do nothing`; }
  return {
    quote,
    row,
    get: async (input: CopyLocator) => view(await row(input)),
    async latest(input: { userId: string; category: MarketingCopyInputValue['category'] }) {
      const [found] = await tx<Row[]>`select * from wb_next.marketing_copy_jobs where user_id = ${input.userId} and category = ${input.category} order by created_at desc, id desc limit 1`; return found ? view(found) : null;
    },
    snapshot: async (input: CopyLocator) => { const found = await row(input); return { category: found.category, text: found.source_text, durationSec: found.duration_sec }; },
    response: async (input: CopyLocator) => (await row(input)).response,
    async create(input: { userId: string; request: SubmitMarketingCopyValue; admission: CopyAdmission }) {
      const request = SubmitMarketingCopy.parse(input.request);
      const [existing] = await tx<Row[]>`select * from wb_next.marketing_copy_jobs where user_id = ${input.userId} and request_key = ${request.requestKey}`;
      if (existing) {
        if (existing.category !== request.category || existing.source_text !== request.text || existing.duration_sec !== (request.durationSec ?? 5) || existing.quote_version !== request.quoteVersion) conflict('Copy request key conflict'); return view(existing);
      }
      const current = quote({ ...input, request: { category: request.category, durationSec: request.durationSec, text: request.text } });
      if (current.mode === 'disabled') throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Copy generation unavailable');
      if (current.version !== request.quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Copy quote changed');
      if ((await tx`select id from wb_next.marketing_copy_jobs where user_id = ${input.userId} and category = ${request.category} and status = 'accepted'`).length) conflict('Category already has a pending copy task');
      const binding = input.admission.offer?.binding ?? null; const id = randomUUID();
      const [inserted] = await tx<Row[]>`insert into wb_next.marketing_copy_jobs (id, user_id, request_key, category, source_text, duration_sec, quote_version, reserved_credits, estimated_cost_cents, binding, billing_state) values (${id}, ${input.userId}, ${request.requestKey}, ${request.category}, ${request.text}, ${request.durationSec ?? 5}, ${request.quoteVersion}, ${current.credits!}, ${input.admission.offer?.estimatedCostCents ?? null}, ${binding ? tx.json(binding as unknown as postgres.JSONValue) : null}, ${binding ? 'held' : 'none'}) returning *`;
      await enqueue(id, 'requested'); return view(inserted);
    },
    async begin(input: CopyLocator & { binding: ScriptBinding; request: ScriptRequest }): Promise<CopySubmission | null> {
      const found = await row(input, true); const request = input.request;
      if (!found.binding || found.binding.provider !== input.binding.provider || found.binding.model !== input.binding.model || found.binding.providerKey !== input.binding.providerKey || request.modelName !== input.binding.model || !request.system.trim() || request.system.length > 10000 || !request.user.trim() || request.user.length > 10000 || request.maxTokens !== 1000 || request.timeoutMs !== 90000 || request.disableThinking !== true || request.requireComplete !== true) conflict('Copy provider or request mismatch');
      if (found.status !== 'accepted') return null;
      if (found.submission_state) {
        if (found.submission_state === 'submitting') await tx`update wb_next.marketing_copy_jobs set submission_state = 'unknown' where id = ${found.id}`;
        return null;
      }
      const claimed = randomUUID();
      await tx`update wb_next.marketing_copy_jobs set submission_state = 'submitting', token = ${claimed}, request = ${tx.json(request as unknown as postgres.JSONValue)}, submitted_at = clock_timestamp() where id = ${found.id}`;
      return { token: claimed, binding: found.binding!, request };
    },
    async record(input: CopyLocator & { token: string; response: TextGenerationReceiptValue }) {
      const found = await token(input); const response = TextGenerationReceipt.parse(input.response);
      if (response.provider !== 'atlas' || response.model !== found.binding!.model) conflict('Copy receipt provider mismatch');
      if (found.response) { if (!equal(TextGenerationReceipt.parse(found.response), response)) conflict('Copy receipt conflicts'); return; }
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Copy cannot receive a receipt');
      await tx`update wb_next.marketing_copy_jobs set response = ${tx.json(response as unknown as postgres.JSONValue)}, submission_state = 'received' where id = ${found.id}`;
    },
    async receive(input: CopyLocator & { response: TextGenerationReceiptValue }) {
      const found = await row(input, true); const response = TextGenerationReceipt.parse(input.response);
      if (response.provider !== (found.binding ? 'atlas' : 'mock') || found.binding && (response.model !== found.binding.model || found.submission_state !== 'received' || !found.response)) conflict('Copy receipt not recorded');
      if (found.response && !equal(TextGenerationReceipt.parse(found.response), response)) conflict('Copy response conflicts');
      if (found.status !== 'accepted') return { job: view(found), terminal: true, success: found.status === 'succeeded' };
      const result = response.finishReason === 'stop' && !response.textTruncated ? parseMarketingCopy(response.text, found.source_text, found.duration_sec) : null;
      const failure = response.finishReason !== 'stop' || response.textTruncated ? 'COPY_OUTPUT_INCOMPLETE' : !result ? 'COPY_FACTS_OR_FORMAT_INVALID' : null;
      await tx`update wb_next.marketing_copy_jobs set response = ${tx.json(response as unknown as postgres.JSONValue)}, result = ${result ? tx.json(result as unknown as postgres.JSONValue) : null}, status = ${result ? 'succeeded' : 'failed'}, billing_state = ${found.binding ? result ? 'settled' : 'refunded' : 'none'}, failure_code = ${failure}, finished_at = clock_timestamp() where id = ${found.id}`;
      return { job: view(await row(input)), terminal: false, success: !!result };
    },
    async unknown(input: CopyLocator & { token: string }) {
      const found = await token(input); if (found.submission_state === 'received' || found.submission_state === 'rejected') return;
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Copy submission is not pending');
      await tx`update wb_next.marketing_copy_jobs set submission_state = 'unknown' where id = ${found.id}`;
    },
    async reject(input: CopyLocator & { token: string }) {
      const found = await token(input); if (found.submission_state === 'rejected') return view(found);
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Copy cannot be rejected');
      await tx`update wb_next.marketing_copy_jobs set status = 'failed', submission_state = 'rejected', billing_state = 'refunded', failure_code = 'COPY_PROVIDER_REJECTED', finished_at = clock_timestamp() where id = ${found.id}`;
      return view(await row(input));
    },
    async sourceForVideo(input: CopyLocator & { category: string | undefined }) {
      const found = await row(input);
      if (found.status !== 'succeeded' || found.category !== input.category) conflict('Copy cannot be used for this video'); return found.source_text;
    },
    async claim(): Promise<CopyDelivery | null> {
      const lease = randomUUID();
      const [found] = await tx<{ id: string; job_id: string; user_id: string; workflow_id: string; type: CopyDelivery['type']; provider: CopyDelivery['provider'] }[]>`
        with candidate as (select id from wb_next.marketing_copy_outbox where (status = 'pending' and available_at <= clock_timestamp()) or (status = 'leased' and lease_until <= clock_timestamp()) order by available_at, id for update skip locked limit 1),
        claimed as (update wb_next.marketing_copy_outbox o set status = 'leased', lease_token = ${lease}, lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1 from candidate c where o.id = c.id returning o.*)
        select c.*, j.user_id, case when j.binding is null then 'mock' else 'atlas' end as provider from claimed c join wb_next.marketing_copy_jobs j on j.id = c.job_id`;
      return found ? { id: found.id, userId: found.user_id, jobId: found.job_id, workflowId: found.workflow_id, type: found.type, provider: found.provider, leaseToken: lease } : null;
    },
    async ack(input: { id: string; leaseToken: string }) {
      await tx`select id from wb_next.marketing_copy_outbox where id = ${input.id} for update`;
      if (!(await tx`update wb_next.marketing_copy_outbox set status = 'delivered', delivered_at = clock_timestamp(), lease_token = null, lease_until = null where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`).length) conflict('Copy outbox lease expired');
    },
    async release(input: { id: string; leaseToken: string }) {
      await tx`select id from wb_next.marketing_copy_outbox where id = ${input.id} for update`;
      if (!(await tx`update wb_next.marketing_copy_outbox set status = 'pending', lease_token = null, lease_until = null, available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second' where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`).length) conflict('Copy outbox lease expired');
    },
    async listReviews() {
      const rows = await tx<Row[]>`select * from wb_next.marketing_copy_jobs where binding is not null and status = 'accepted' and (submission_state = 'unknown' or submission_state = 'submitting' and submitted_at <= clock_timestamp() - interval '2 minutes') order by submitted_at, id limit 20`;
      return rows.map(found => ({ jobId: found.id, category: found.category, model: found.binding!.model, reservedCredits: Number(found.reserved_credits), submittedAt: found.submitted_at!.toISOString() }));
    },
    async prepareReview(jobId: string, raw: ReviewScriptRequestValue) {
      const request = ReviewScriptRequest.parse(raw); const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const [found] = await tx<Row[]>`select * from wb_next.marketing_copy_jobs where id = ${jobId} for update`;
      if (!found) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Copy review not found');
      const [existing] = await tx<{ request_hash: string }[]>`select * from wb_next.marketing_copy_reviews where job_id = ${jobId}`;
      if (existing) { if (existing.request_hash !== hash) conflict('Copy review request conflicts'); return { request, hash, found, replay: true }; }
      if (!(await tx`select id from wb_next.marketing_copy_jobs where id = ${jobId} and status = 'accepted' and binding is not null and (submission_state = 'unknown' or submission_state = 'submitting' and submitted_at <= clock_timestamp() - interval '2 minutes')`).length) conflict('Copy review is not required');
      return { request, hash, found, replay: false };
    },
    async reviewRecorded(jobId: string, hash: string, priorState: string, request: ReviewScriptRequestValue) {
      await tx`insert into wb_next.marketing_copy_reviews (job_id, request_key, request_hash, action, reason, evidence_reference, prior_state) values (${jobId}, ${request.requestKey}, ${hash}, ${request.action}, ${request.reason}, ${request.evidenceReference}, ${priorState})`;
      if (request.action === 'receipt') await enqueue(jobId, 'resume');
    },
  };
}
