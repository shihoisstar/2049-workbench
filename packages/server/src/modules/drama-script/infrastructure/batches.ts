import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { DramaScriptVersion, ErrorCode, ScriptBatch, SubmitScriptBatch } from '@wb/contracts';
import type { DramaParseResultValue, ScriptBatchQuoteValue, ScriptBatchValue, SubmitScriptBatchValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { ScriptAdmission, ScriptBinding, ScriptJobLocator, ScriptSnapshot } from '../public';

interface ReusedEpisode { number: number; versionId: string; scriptId: string; content: string; roles: string[] }
interface BatchRow { id: string; user_id: string; project_id: string; request_key: string; quote_version: string; binding: ScriptBinding | null; credits_per_episode: string; estimated_cost_cents: string | null; episode_count: number; maximum_characters: number; reused: ReusedEpisode[]; status: ScriptBatchValue['status']; output_version_id: string | null; created_at: Date; finished_at: Date | null }
interface ChildRow { id: string; user_id: string; project_id: string; batch_id: string | null; episode_number: number; batch_ready: number; status: 'accepted' | 'succeeded' | 'failed'; snapshot: ScriptSnapshot; submission_state: string | null; billing_state: string; quote: { credits: number } | null; output_version_id: string | null; failure_code: string | null; script_id: string | null; content: string | null; parsed_json: DramaParseResultValue | null }
interface ProjectRow { title: string; idea: string; mode: string; active_version_id: string | null; episode_count: number; look: string; aspect_ratio: string; genre: string; tone: string }
const conflict = (message: string): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, message); };
function episodes(version: { id: string; script_id: string; content: string; parsed_json: DramaParseResultValue }): ReusedEpisode[] {
  if (version.parsed_json.status !== 'parsed') return [];
  const heads = [...version.content.matchAll(/^(?:\uFEFF)?##\s+第\s*(\d+)\s*集\s*$/gm)];
  return heads.map((head, index) => ({ number: Number(head[1]), versionId: version.id, scriptId: version.script_id,
    content: version.content.slice(head.index!, heads[index + 1]?.index ?? version.content.length).trim(), roles: version.parsed_json.roles }));
}
function usable(child: ChildRow) {
  return child.status === 'succeeded' && child.parsed_json?.status === 'parsed' && child.parsed_json.episodes.length === 1
    && child.parsed_json.episodes[0].number === child.episode_number && !!child.content && child.content.length <= (child.snapshot.maximumCharacters ?? 900);
}
export function createScriptBatchStore(tx: postgres.TransactionSql) {
  async function row(userId: string, batchId: string, lock = false): Promise<BatchRow> {
    const rows = lock ? await tx<BatchRow[]>`select * from wb_next.drama_script_batches where id = ${batchId} and user_id = ${userId} for update`
      : await tx<BatchRow[]>`select * from wb_next.drama_script_batches where id = ${batchId} and user_id = ${userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Script batch not found'); return rows[0];
  }
  async function children(batchId: string, lock = false): Promise<ChildRow[]> {
    return lock ? tx<ChildRow[]>`select j.*, v.script_id, v.content, v.parsed_json from wb_next.drama_script_jobs j left join wb_next.drama_script_versions v on v.id = j.output_version_id where j.batch_id = ${batchId} order by j.episode_number for update of j`
      : tx<ChildRow[]>`select j.*, v.script_id, v.content, v.parsed_json from wb_next.drama_script_jobs j left join wb_next.drama_script_versions v on v.id = j.output_version_id where j.batch_id = ${batchId} order by j.episode_number`;
  }
  async function latest(input: { userId: string; projectId: string }): Promise<BatchRow | null> {
    const [found] = await tx<BatchRow[]>`select * from wb_next.drama_script_batches where project_id = ${input.projectId} and user_id = ${input.userId} order by created_at desc, id desc limit 1`; return found ?? null;
  }
  async function latestVersion(versionId: string) {
    const [version] = await tx<{ id: string; script_id: string; content: string; parsed_json: DramaParseResultValue }[]>`select v.* from wb_next.drama_script_versions v where v.script_id = (select script_id from wb_next.drama_script_versions where id = ${versionId}) order by v.ordinal desc limit 1`;
    return version;
  }
  async function view(found: BatchRow): Promise<ScriptBatchValue> {
    const jobs = await children(found.id); let draftVersion: ScriptBatchValue['draftVersion'] = null; let draftScriptId: string | null = null;
    if (found.output_version_id) {
      const [version] = await tx<{ id: string; script_id: string; ordinal: number; content: string; source: string; parsed_json: unknown; created_at: Date }[]>`select * from wb_next.drama_script_versions where id = ${found.output_version_id}`;
      draftScriptId = version.script_id; draftVersion = DramaScriptVersion.parse({ id: version.id, ordinal: version.ordinal, content: version.content, source: version.source, parse: version.parsed_json, createdAt: version.created_at.toISOString() });
    }
    return ScriptBatch.parse({ id: found.id, projectId: found.project_id, requestKey: found.request_key, quoteVersion: found.quote_version, status: found.status,
      provider: found.binding ? 'atlas' : 'mock', episodeCount: found.episode_count, reservedCredits: jobs.reduce((sum, job) => sum + (job.quote?.credits ?? 0), 0),
      actualCredits: jobs.filter(job => job.billing_state === 'settled').reduce((sum, job) => sum + job.quote!.credits, 0), heldCredits: jobs.filter(job => job.billing_state === 'held').reduce((sum, job) => sum + job.quote!.credits, 0), refundedCredits: jobs.filter(job => job.billing_state === 'refunded').reduce((sum, job) => sum + job.quote!.credits, 0),
      episodes: Array.from({ length: found.episode_count }, (_, index) => {
        const number = index + 1; const reused = found.reused.find(item => item.number === number); const job = jobs.find(item => item.episode_number === number);
        return reused ? { number, status: 'reused', jobId: null, scriptId: reused.scriptId, versionId: reused.versionId, failureCode: null }
          : { number, status: job!.failure_code === 'SCRIPT_BATCH_PAUSED' ? 'paused' : job!.status === 'failed' ? 'failed' : job!.status === 'succeeded' ? usable(job!) ? 'succeeded' : 'needs_repair' : !job!.batch_ready ? 'waiting' : job!.submission_state === 'unknown' ? 'review_required' : 'generating', jobId: job!.id, scriptId: job!.script_id, versionId: job!.output_version_id, failureCode: job!.failure_code };
      }), draftScriptId, draftVersion, createdAt: found.created_at.toISOString(), finishedAt: found.finished_at?.toISOString() ?? null });
  }
  async function offer(input: { userId: string; projectId: string; admission: ScriptAdmission }) {
    const [project] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId}`;
    if (!project) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
    const previous = await latest(input); let candidates: ReusedEpisode[] = [];
    if (previous && (!input.admission.offer || previous.binding)) {
      if (previous.output_version_id) candidates = episodes(await latestVersion(previous.output_version_id));
      else {
        candidates = [...previous.reused];
        for (const child of await children(previous.id)) if (child.output_version_id) {
          const version = await latestVersion(child.output_version_id);
          if (usable(child) || version.id !== child.output_version_id) candidates.push(...episodes(version));
        }
      }
    } else if (!previous) {
      const [job] = await tx<{ output_version_id: string }[]>`select output_version_id from wb_next.drama_script_jobs where project_id = ${input.projectId} and user_id = ${input.userId} and batch_id is null and status = 'succeeded' and (${!!input.admission.offer} = false or binding is not null) order by created_at desc, id desc limit 1`;
      if (job?.output_version_id) candidates = episodes(await latestVersion(job.output_version_id));
    }
    const reused: ReusedEpisode[] = [];
    for (let number = 1; number <= project.episode_count; number++) { const found = candidates.find(item => item.number === number); if (!found) break; reused.push(found); }
    const toGenerate = Array.from({ length: project.episode_count - reused.length }, (_, index) => reused.length + index + 1);
    const maximumCharacters = toGenerate.length ? Math.min(900, Math.floor((20000 - reused.reduce((sum, item) => sum + item.content.length, 0) - 2 * (project.episode_count - 1)) / toGenerate.length)) : 900;
    const admission = input.admission.offer; const perEpisode = admission?.credits ?? 0; const total = perEpisode * toGenerate.length;
    if (!Number.isSafeInteger(perEpisode) || perEpisode < 0 || admission && perEpisode === 0 || !Number.isSafeInteger(total) || admission && (admission.estimatedCostCents !== null && (!Number.isSafeInteger(admission.estimatedCostCents) || admission.estimatedCostCents < 0))) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid batch price');
    const [active] = await tx`select id from wb_next.drama_script_jobs where project_id = ${input.projectId} and status = 'accepted' limit 1`;
    const disabled = project.mode !== 'idea' || !!project.active_version_id || previous?.status === 'accepted' || !!active || maximumCharacters < 1 || !admission && !input.admission.mockAvailable;
    const version = 'batch-v1:' + createHash('sha256').update(JSON.stringify({ userId: input.userId, projectId: input.projectId, project, reused, maximumCharacters, admission })).digest('hex');
    const quote: ScriptBatchQuoteValue = { mode: disabled ? 'disabled' : admission ? 'atlas' : 'mock', version: disabled ? null : version, credits: disabled ? null : total, creditsPerEpisode: disabled ? null : perEpisode, episodeCount: project.episode_count, reusedEpisodes: reused.map(item => item.number), toGenerate };
    return { quote, reused, maximumCharacters, project };
  }
  return {
    offer,
    get: async (input: { userId: string; batchId: string }) => view(await row(input.userId, input.batchId)),
    latest: async (input: { userId: string; projectId: string }) => { if (!(await tx`select id from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId}`).length) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found'); const found = await latest(input); return found ? view(found) : null; },
    async findRequest(input: { userId: string; projectId: string; request: SubmitScriptBatchValue }) {
      SubmitScriptBatch.parse(input.request);
      const [found] = await tx<BatchRow[]>`select * from wb_next.drama_script_batches where user_id = ${input.userId} and request_key = ${input.request.requestKey}`;
      if (!found) return null;
      if (found.project_id !== input.projectId || found.quote_version !== input.request.quoteVersion) conflict('Batch request key conflict'); return view(found);
    },
    async insert(input: { userId: string; projectId: string; request: SubmitScriptBatchValue; admission: ScriptAdmission }, prepared: Awaited<ReturnType<typeof offer>>) {
      if (prepared.quote.mode === 'disabled') throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Batch generation unavailable');
      if (input.request.quoteVersion !== prepared.quote.version) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Batch quote changed');
      const id = randomUUID(); const binding = input.admission.offer?.binding ?? null; const credits = prepared.quote.creditsPerEpisode!;
      await tx`insert into wb_next.drama_script_batches (id, user_id, project_id, request_key, quote_version, binding, credits_per_episode, estimated_cost_cents, episode_count, reused, maximum_characters) values (${id}, ${input.userId}, ${input.projectId}, ${input.request.requestKey}, ${input.request.quoteVersion}, ${binding ? tx.json(binding as unknown as postgres.JSONValue) : null}, ${credits}, ${input.admission.offer?.estimatedCostCents ?? null}, ${prepared.project.episode_count}, ${tx.json(prepared.reused as unknown as postgres.JSONValue)}, ${prepared.maximumCharacters})`;
      const inserted: { id: string; credits: number; model: string }[] = [];
      for (const number of prepared.quote.toGenerate) {
        const jobId = randomUUID(); const project = prepared.project;
        const snapshot: ScriptSnapshot = { title: project.title, idea: project.idea, look: project.look, aspectRatio: project.aspect_ratio, episodeCount: project.episode_count, genre: project.genre, tone: project.tone, episodeNumber: number, maximumCharacters: prepared.maximumCharacters };
        const quote = binding ? { version: input.request.quoteVersion, credits, estimatedCostCents: input.admission.offer!.estimatedCostCents } : null;
        await tx`insert into wb_next.drama_script_jobs (id, user_id, project_id, request_key, batch_id, episode_number, snapshot, binding, quote, request_quote_version, billing_state) values (${jobId}, ${input.userId}, ${input.projectId}, ${randomUUID()}, ${id}, ${number}, ${tx.json(snapshot as unknown as postgres.JSONValue)}, ${binding ? tx.json(binding as unknown as postgres.JSONValue) : null}, ${quote ? tx.json(quote as unknown as postgres.JSONValue) : null}, ${input.request.quoteVersion}, ${quote ? 'held' : 'none'})`;
        inserted.push({ id: jobId, credits, model: binding?.model ?? 'script-fixture-v1' });
      }
      return { id, inserted };
    },
    async advance(input: { userId: string; batchId: string }) {
      const batch = await row(input.userId, input.batchId, true); const jobs = await children(batch.id, true);
      if (batch.status !== 'accepted') return { refunds: [] as ChildRow[], content: null as string | null, batch };
      if (jobs.some(job => job.status === 'failed' || job.status === 'succeeded' && !usable(job))) {
        const queued = jobs.filter(job => job.status === 'accepted' && !job.batch_ready);
        for (const child of queued) await tx`update wb_next.drama_script_jobs set status = 'failed', billing_state = case when quote is null then 'none' else 'refunded' end, failure_code = 'SCRIPT_BATCH_PAUSED', finished_at = clock_timestamp() where id = ${child.id} and batch_ready = 0 and submission_state is null`;
        await tx`update wb_next.drama_script_batches set status = 'needs_attention', finished_at = clock_timestamp() where id = ${batch.id}`;
        return { refunds: queued, content: null, batch };
      }
      const completed = [...batch.reused, ...jobs.filter(usable).map(job => ({ number: job.episode_number, versionId: job.output_version_id!, scriptId: job.script_id!, content: job.content!, roles: job.parsed_json!.roles }))].sort((left, right) => left.number - right.number);
      if (completed.length === batch.episode_count) return { refunds: [] as ChildRow[], content: completed.map(item => item.content).join('\n\n'), batch };
      const next = jobs.find(job => job.status === 'accepted');
      if (next && !next.batch_ready) {
        const prior = completed.filter(item => item.number < next.episode_number);
        if (prior.length !== next.episode_number - 1) conflict('Missing preceding script episode');
        const snapshot = { ...next.snapshot, previousContent: prior.slice(-3).map(item => item.content).join('\n\n'), roleNames: [...new Set(prior.flatMap(item => item.roles))].slice(0, 20) };
        await tx`update wb_next.drama_script_jobs set batch_ready = 1, snapshot = ${tx.json(snapshot as unknown as postgres.JSONValue)} where id = ${next.id}`;
        await tx`insert into wb_next.drama_script_outbox (id, job_id, workflow_id) values (${randomUUID()}, ${next.id}, ${`drama-script:${next.id}`})`;
      }
      return { refunds: [] as ChildRow[], content: null, batch };
    },
    async forJob(input: ScriptJobLocator) { const [job] = await tx<{ batch_id: string | null; project_id: string }[]>`select batch_id, project_id from wb_next.drama_script_jobs where id = ${input.jobId} and user_id = ${input.userId}`; return job ?? null; },
    async finish(batchId: string, versionId: string) { await tx`update wb_next.drama_script_batches set status = 'succeeded', output_version_id = ${versionId}, finished_at = clock_timestamp() where id = ${batchId} and status = 'accepted'`; },
  };
}
