import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { DramaScriptVersion, ErrorCode, SubmitDramaScriptJob, TextGenerationReceipt } from '@wb/contracts';
import type { DramaScriptJobViewValue, DramaScriptQuoteValue, TextGenerationReceiptValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { CreateScriptJobInput, ScriptAdmission, ScriptBinding, ScriptDelivery, ScriptJobLocator, ScriptRequest, ScriptSnapshot, ScriptSubmission, ScriptSubmissionClaim, ScriptSubmissionToken } from '../public';

interface JobRow { batch_id: string | null; episode_number: number; batch_ready: number; id: string; user_id: string; project_id: string; request_key: string; status: DramaScriptJobViewValue['status']; snapshot: ScriptSnapshot; response: TextGenerationReceiptValue | null; output_version_id: string | null; failure_code: string | null; created_at: Date; finished_at: Date | null; binding: ScriptBinding | null; request: ScriptRequest | null; submission_state: ScriptSubmission['status'] | null; submission_token: string | null; quote: { version: string; credits: number; estimatedCostCents: number | null } | null; request_quote_version: string | null; billing_state: DramaScriptJobViewValue['billingStatus'] }
interface ProjectRow { mode: string; active_version_id: string | null; title: string; idea: string; look: string; aspect_ratio: string; episode_count: number; genre: string; tone: string }
const conflict = (message: string): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, message); };
const sameBinding = (left: ScriptBinding | null, right: ScriptBinding | null) => left?.provider === right?.provider && left?.model === right?.model && left?.providerKey === right?.providerKey;
function validateBinding(binding: ScriptBinding) {
  if (binding.provider !== 'atlas' || !/^[a-f0-9]{64}$/.test(binding.providerKey) || !binding.model.trim() || binding.model.length > 200) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid script provider binding');
}
function submission(found: JobRow): ScriptSubmission | null {
  return found.binding && found.request && found.submission_state ? { binding: found.binding, request: found.request, status: found.submission_state } : null;
}
function snapshotFor(project: ProjectRow): ScriptSnapshot {
  return { title: project.title, idea: project.idea, look: project.look, aspectRatio: project.aspect_ratio, episodeCount: project.episode_count, genre: project.genre, tone: project.tone };
}
function quoteFor(input: { userId: string; projectId: string; admission: ScriptAdmission }, project: ProjectRow): DramaScriptQuoteValue {
  const { offer, mockAvailable } = input.admission;
  if (project.mode !== 'idea' || project.active_version_id || (!offer && !mockAvailable)) return { mode: 'disabled', credits: null, version: null, episodeNumber: 1 };
  if (offer) {
    validateBinding(offer.binding);
    if (!Number.isSafeInteger(offer.credits) || offer.credits < 1 || (offer.estimatedCostCents !== null && (!Number.isSafeInteger(offer.estimatedCostCents) || offer.estimatedCostCents < 0))) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid script pricing configuration');
  }
  const version = 'script-v1:' + createHash('sha256').update(JSON.stringify({ userId: input.userId, projectId: input.projectId,
    snapshot: snapshotFor(project), binding: offer ? { provider: offer.binding.provider, model: offer.binding.model, providerKey: offer.binding.providerKey } : null,
    credits: offer?.credits ?? 0, estimatedCostCents: offer?.estimatedCostCents ?? null, episodeNumber: 1 })).digest('hex');
  return offer ? { mode: 'atlas', credits: offer.credits, version, episodeNumber: 1 } : { mode: 'mock', credits: 0, version, episodeNumber: 1 };
}
export function createDramaScriptStore(tx: postgres.TransactionSql) {
  async function row(input: ScriptJobLocator, lock = false): Promise<JobRow> {
    const rows = lock ? await tx<JobRow[]>`select * from wb_next.drama_script_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.drama_script_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Script job not found');
    return rows[0];
  }
  async function view(found: JobRow): Promise<DramaScriptJobViewValue> {
    let draftVersion: DramaScriptJobViewValue['draftVersion'] = null;
    let draftScriptId: string | null = null;
    if (found.output_version_id) {
      const [version] = await tx<{ id: string; script_id: string; ordinal: number; content: string; source: string; parsed_json: unknown; created_at: Date }[]>`
        select v.* from wb_next.drama_script_versions v join wb_next.drama_scripts s on s.id = v.script_id
        where v.id = ${found.output_version_id} and s.user_id = ${found.user_id}`;
      if (!version) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Script draft not found');
      draftScriptId = version.script_id;
      draftVersion = DramaScriptVersion.parse({ id: version.id, ordinal: version.ordinal, content: version.content, source: version.source, parse: version.parsed_json, createdAt: version.created_at.toISOString() });
    }
    return { id: found.id, projectId: found.project_id, requestKey: found.request_key, status: found.status, provider: found.binding?.provider ?? 'mock', submissionStatus: found.submission_state,
      billingStatus: found.billing_state, reservedCredits: found.quote?.credits ?? 0, quoteVersion: found.request_quote_version,
      actualCredits: found.billing_state === 'held' ? null : found.billing_state === 'settled' ? found.quote!.credits : 0,
      failureCode: found.failure_code, draftScriptId, draftVersion, createdAt: found.created_at.toISOString(), finishedAt: found.finished_at?.toISOString() ?? null };
  }
  return {
    async quote(input: { userId: string; projectId: string; admission: ScriptAdmission }) {
      const [project] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId}`;
      if (!project) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
      return quoteFor(input, project);
    },
    get: async (input: ScriptJobLocator) => view(await row(input)),
    snapshot: async (input: ScriptJobLocator) => { const found = await row(input); if (found.batch_id && !found.batch_ready) conflict('Script episode is not activated'); return found.snapshot; },
    response: async (input: ScriptJobLocator) => TextGenerationReceipt.nullable().parse((await row(input)).response),
    async saveResponse(input: ScriptJobLocator, response: TextGenerationReceiptValue) {
      await tx`update wb_next.drama_script_jobs set response = ${tx.json(response as unknown as postgres.JSONValue)} where id = ${input.jobId} and user_id = ${input.userId}`;
    },
    async latest(input: { userId: string; projectId: string }) {
      const [project] = await tx`select id from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId}`;
      if (!project) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
      const [found] = await tx<JobRow[]>`select * from wb_next.drama_script_jobs where project_id = ${input.projectId} and user_id = ${input.userId} order by created_at desc, id desc limit 1`;
      return found ? view(found) : null;
    },
    async create(input: CreateScriptJobInput) {
      SubmitDramaScriptJob.parse({ requestKey: input.requestKey, quoteVersion: input.quoteVersion });
      const [project] = await tx<ProjectRow[]>`
        select * from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId} for update`;
      if (!project) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
      const [existing] = await tx<JobRow[]>`select * from wb_next.drama_script_jobs where user_id = ${input.userId} and request_key = ${input.requestKey}`;
      if (existing) {
        if (existing.project_id !== input.projectId || existing.request_quote_version !== (input.quoteVersion ?? null)) conflict('Request key belongs to another script request');
        // Historical requests replay even after price/model changes or admission closes.
        return view(existing);
      }
      if (project.mode !== 'idea' || project.active_version_id) conflict('Script generation requires an unconfirmed idea project');
      const [active] = await tx`select id from wb_next.drama_script_jobs where project_id = ${input.projectId} and status = 'accepted'`;
      if (active) conflict('Project already has a pending script job');
      const admission = input.admission ?? { offer: null, mockAvailable: true };
      const currentQuote = quoteFor({ ...input, admission }, project);
      if (currentQuote.mode === 'disabled') throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Script generation is unavailable');
      if ((currentQuote.mode === 'atlas' || input.quoteVersion !== undefined) && currentQuote.version !== input.quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Script quote changed');
      const binding = admission.offer?.binding ?? null;
      const quote = binding ? { version: currentQuote.version, credits: currentQuote.credits, estimatedCostCents: admission.offer!.estimatedCostCents } : null;
      const snapshot = snapshotFor(project);
      const id = randomUUID();
      const [inserted] = await tx<JobRow[]>`insert into wb_next.drama_script_jobs (id, user_id, project_id, request_key, snapshot, binding, quote, request_quote_version, billing_state) values (${id}, ${input.userId}, ${input.projectId}, ${input.requestKey}, ${tx.json(snapshot as unknown as postgres.JSONValue)}, ${binding ? tx.json(binding as unknown as postgres.JSONValue) : null}, ${quote ? tx.json(quote as unknown as postgres.JSONValue) : null}, ${input.quoteVersion ?? null}, ${quote ? 'held' : 'none'}) returning *`;
      await tx`insert into wb_next.drama_script_outbox (id, job_id, workflow_id) values (${randomUUID()}, ${id}, ${`drama-script:${id}`})`;
      return view(inserted);
    },
    lock: (input: ScriptJobLocator) => row(input, true),
    async beginSubmission(input: ScriptJobLocator & { binding: ScriptBinding; request: ScriptRequest }): Promise<ScriptSubmissionClaim> {
      validateBinding(input.binding);
      const request = input.request;
      if (request.modelName !== input.binding.model || !request.system.trim() || request.system.length > 10000 || !request.user.trim() || request.user.length > 10000 || !Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > 4000 || request.timeoutMs !== 90000 || request.disableThinking !== true || request.requireComplete !== true) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid script request snapshot');
      const found = await row(input, true);
      if (!found.binding || !sameBinding(found.binding, input.binding)) conflict('Script provider configuration changed');
      if (found.batch_id && !found.batch_ready) conflict('Script episode is not activated');
      if (!found.quote || found.billing_state === 'none') conflict('Real script requires an accepted quote');
      if (found.status !== 'accepted') return { claimed: false, submission: submission(found) };
      if (found.submission_state) {
        // A second caller cannot know whether the first POST reached the provider.
        if (found.submission_state === 'submitting') {
          await tx`update wb_next.drama_script_jobs set submission_state = 'unknown' where id = ${found.id}`;
          found.submission_state = 'unknown';
        }
        return { claimed: false, submission: submission(found) };
      }
      const token = randomUUID();
      const [changed] = await tx<JobRow[]>`update wb_next.drama_script_jobs set submission_state = 'submitting', submission_token = ${token}, request = ${tx.json(request as unknown as postgres.JSONValue)}, submitted_at = clock_timestamp() where id = ${found.id} returning *`;
      return { claimed: true, token, submission: submission(changed)! };
    },
    async recordResponse(input: ScriptSubmissionToken & { response: TextGenerationReceiptValue }) {
      const response = TextGenerationReceipt.parse(input.response);
      const found = await row(input, true);
      if (!found.binding || found.submission_token !== input.token || response.provider !== found.binding.provider || response.model !== found.binding.model) conflict('Script response does not match submission');
      if (found.response) {
        if (JSON.stringify(TextGenerationReceipt.parse(found.response)) !== JSON.stringify(response)) conflict('Script response conflicts');
        return;
      }
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Script submission cannot receive response');
      // Commit the provider receipt before parsing/publishing so local failures can resume it.
      await tx`update wb_next.drama_script_jobs set response = ${tx.json(response as unknown as postgres.JSONValue)}, submission_state = 'received' where id = ${found.id}`;
    },
    async submissionUnknown(input: ScriptSubmissionToken) {
      const found = await row(input, true);
      if (found.submission_token !== input.token) conflict('Script submission token mismatch');
      if (found.submission_state === 'received' || found.submission_state === 'rejected') return;
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Script submission is not pending');
      await tx`update wb_next.drama_script_jobs set submission_state = 'unknown' where id = ${found.id}`;
    },
    async rejectSubmission(input: ScriptSubmissionToken) {
      const found = await row(input, true);
      if (found.submission_token !== input.token) conflict('Script submission token mismatch');
      if (found.submission_state === 'rejected') return view(found);
      if (found.status !== 'accepted' || !['submitting', 'unknown'].includes(found.submission_state ?? '')) conflict('Script submission cannot be rejected');
      await tx`update wb_next.drama_script_jobs set submission_state = 'rejected', status = 'failed', billing_state = case when quote is null then 'none' else 'refunded' end, failure_code = 'SCRIPT_PROVIDER_REJECTED', finished_at = clock_timestamp() where id = ${found.id}`;
      return view(await row(input));
    },
    async draftScriptId(input: { userId: string; projectId: string; versionId: string }): Promise<string | null> {
      const [found] = await tx<{ script_id: string }[]>`select output.script_id from wb_next.drama_script_jobs j join wb_next.drama_script_versions output on output.id = j.output_version_id join wb_next.drama_script_versions target on target.script_id = output.script_id
        where j.project_id = ${input.projectId} and j.user_id = ${input.userId} and j.status = 'succeeded' and target.id = ${input.versionId}
        union all select output.script_id from wb_next.drama_script_batches b join wb_next.drama_script_versions output on output.id = b.output_version_id join wb_next.drama_script_versions target on target.script_id = output.script_id
        where b.project_id = ${input.projectId} and b.user_id = ${input.userId} and b.status = 'succeeded' and target.id = ${input.versionId} limit 1`;
      return found?.script_id ?? null;
    },
    async publish(input: ScriptJobLocator, versionId: string, billingState: 'none' | 'settled' | 'refunded') {
      await tx`update wb_next.drama_script_jobs set status = 'succeeded', output_version_id = ${versionId}, billing_state = ${billingState}, finished_at = clock_timestamp() where id = ${input.jobId} and user_id = ${input.userId}`;
      return view(await row(input));
    },
    async fail(input: ScriptJobLocator & { failureCode: string }) {
      if (!/^[A-Z_]{1,100}$/.test(input.failureCode)) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid script failure code');
      const found = await row(input, true);
      if (found.binding && found.submission_state !== 'received') conflict('Real script failure requires a known provider response');
      if (found.status === 'succeeded') conflict('Successful script job cannot fail');
      if (found.status === 'failed') { if (found.failure_code !== input.failureCode) conflict('Script failure conflicts'); return view(found); }
      await tx`update wb_next.drama_script_jobs set status = 'failed', billing_state = case when quote is null then 'none' else 'refunded' end, failure_code = ${input.failureCode}, finished_at = clock_timestamp() where id = ${input.jobId} and user_id = ${input.userId}`;
      return view(await row(input));
    },
    async claim(): Promise<ScriptDelivery | null> {
      const leaseToken = randomUUID();
      const [found] = await tx<{ id: string; job_id: string; workflow_id: string; user_id: string; provider: 'mock' | 'atlas' }[]>`
        with candidate as (select id from wb_next.drama_script_outbox where (status = 'pending' and available_at <= clock_timestamp()) or (status = 'leased' and lease_until <= clock_timestamp()) order by available_at, id for update skip locked limit 1),
        claimed as (update wb_next.drama_script_outbox o set status = 'leased', lease_token = ${leaseToken}, lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1 from candidate c where o.id = c.id returning o.id, o.job_id, o.workflow_id)
        select c.*, j.user_id, coalesce(j.binding->>'provider', 'mock') as provider from claimed c join wb_next.drama_script_jobs j on j.id = c.job_id`;
      return found ? { id: found.id, jobId: found.job_id, userId: found.user_id, workflowId: found.workflow_id, leaseToken, provider: found.provider } : null;
    },
    async ack(input: { id: string; leaseToken: string }) {
      await tx`select id from wb_next.drama_script_outbox where id = ${input.id} for update`;
      const changed = await tx`update wb_next.drama_script_outbox set status = 'delivered', delivered_at = clock_timestamp(), lease_token = null, lease_until = null where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (!changed.length) conflict('Script outbox lease expired');
    },
    async release(input: { id: string; leaseToken: string }) {
      await tx`select id from wb_next.drama_script_outbox where id = ${input.id} for update`;
      const changed = await tx`update wb_next.drama_script_outbox set status = 'pending', lease_token = null, lease_until = null, available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second' where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (!changed.length) conflict('Script outbox lease expired');
    },
  };
}
