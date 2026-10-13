import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, PlanImage } from '@wb/contracts';
import type { StoryboardPlanValue, SubmitPlanImageValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
import { PLAN_IMAGE_MODEL } from '../plan-image';
import type { planImageSource } from '../plan-image';
interface Row { id: string; plan_id: string; shot_id: string; episode_number: number; scene_number: number; shot_number: number; plan_revision: number; source_key: string; quote_version: string; prompt: string;
  role_version_ids: string[]; selected_at: Date | null; created_at: Date; expires_at: Date | null; job_id: string; request_key: string; status: 'accepted' | 'succeeded' | 'failed'; reserved_credits: string; actual_credits: string | null; failure_code: string | null }
function view(row: Row) { return { sourceKey: row.source_key, quoteVersion: row.quote_version, value: PlanImage.parse({ candidateId: row.id, planId: row.plan_id, shotId: row.shot_id,
  shotKey: `${row.episode_number}:${row.scene_number}:${row.shot_number}`, planRevision: row.plan_revision, roleVersionIds: row.role_version_ids, content: row.prompt, current: false, selectedAt: row.selected_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(), expiresAt: row.expires_at?.toISOString() ?? null, jobId: row.job_id, requestKey: row.request_key, provider: 'mock', status: row.status,
  reservedCredits: Number(row.reserved_credits), actualCredits: row.actual_credits === null ? null : Number(row.actual_credits), failureCode: row.failure_code }) }; }
const conflict = (): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Storyboard image request conflicts with recorded state'); };
export function createPlanImageStore(tx: postgres.TransactionSql) {
  async function get(input: { userId: string; candidateId: string }) {
    const [row] = await tx<Row[]>`select c.*, sh.plan_id, sh.episode_number, sh.scene_number, sh.shot_number, j.id as job_id, j.request_key, j.status, j.reserved_credits, j.actual_credits, j.failure_code, a.expires_at,
      array(select r.role_version_id from wb_next.drama_plan_candidate_roles r where r.candidate_id = c.id order by r.position) as role_version_ids
      from wb_next.drama_storyboard_candidates c join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id join wb_next.drama_image_jobs j on j.candidate_id = c.id and j.user_id = sh.user_id
      left join wb_next.drama_image_assets a on a.job_id = j.id where c.id = ${input.candidateId} and sh.user_id = ${input.userId} and sh.plan_id is not null and j.model = ${PLAN_IMAGE_MODEL}`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Storyboard image not found'); return view(row);
  }
  return {
    get,
    async selected(input: { userId: string; planId: string }) {
      const rows = await tx<{ id: string }[]>`select c.id from wb_next.drama_storyboard_candidates c join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        where sh.plan_id = ${input.planId} and sh.user_id = ${input.userId} and c.selected_at is not null order by sh.episode_number, sh.scene_number, sh.shot_number`;
      return Promise.all(rows.map(row => get({ userId: input.userId, candidateId: row.id })));
    },
    async findRequest(input: { userId: string; planId: string; request: SubmitPlanImageValue }) {
      const [job] = await tx<{ candidate_id: string | null; model: string }[]>`select candidate_id, model from wb_next.drama_image_jobs where user_id = ${input.userId} and request_key = ${input.request.requestKey} for update`;
      if (!job) return null; if (!job.candidate_id || job.model !== PLAN_IMAGE_MODEL) return conflict();
      const record = await get({ userId: input.userId, candidateId: job.candidate_id });
      if (record.value.planId !== input.planId || record.value.shotKey !== input.request.shotKey || record.quoteVersion !== input.request.quoteVersion || record.value.planRevision !== input.request.planRevision) conflict(); return record;
    },
    async list(input: { userId: string; planId: string; shotKey: string; cursor?: string }) {
      if (input.cursor) { const cursor = await get({ userId: input.userId, candidateId: input.cursor }); if (cursor.value.planId !== input.planId || cursor.value.shotKey !== input.shotKey) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Image cursor not found'); }
      const rows = await tx<{ id: string }[]>`select c.id from wb_next.drama_storyboard_candidates c join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        join wb_next.drama_image_jobs j on j.candidate_id = c.id where sh.user_id = ${input.userId} and sh.plan_id = ${input.planId} and (sh.episode_number::text || ':' || sh.scene_number::text || ':' || sh.shot_number::text) = ${input.shotKey}
        and (${input.cursor ?? null}::uuid is null or (c.created_at, c.id) < (select created_at, id from wb_next.drama_storyboard_candidates where id = ${input.cursor ?? null}::uuid)) order by c.created_at desc, c.id desc limit 21`;
      return { records: await Promise.all(rows.slice(0, 20).map(row => get({ userId: input.userId, candidateId: row.id }))), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async createCandidate(input: { userId: string; plan: StoryboardPlanValue; source: ReturnType<typeof planImageSource> }) {
      const { plan, source } = input;
      const pending = await tx`select j.id from wb_next.drama_image_jobs j join wb_next.drama_storyboard_candidates c on c.id = j.candidate_id join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        where sh.plan_id = ${plan.id} and sh.episode_number = ${source.shot.episodeNumber} and sh.scene_number = ${source.shot.sceneNumber} and sh.shot_number = ${source.shot.shotNumber} and j.status = 'accepted'`;
      if (pending.length) conflict();
      if (source.references.length) {
        const ids = source.references.map(role => role.roleVersionId);
        const roles = await tx<{ id: string; reference_material_id: string; reference_sha256: string }[]>`select v.id, v.reference_material_id, v.reference_sha256 from wb_next.drama_role_versions v join wb_next.drama_roles r on r.id = v.role_id where v.id = any(${ids}) and r.user_id = ${input.userId} and r.project_id = ${plan.projectId}`;
        if (roles.length !== ids.length || source.references.some(ref => !roles.some(role => role.id === ref.roleVersionId && role.reference_material_id === ref.referenceMaterialId && role.reference_sha256 === ref.referenceSha256))) conflict();
      }
      let [shot] = await tx<{ id: string }[]>`select id from wb_next.drama_storyboard_shots where plan_id = ${plan.id} and episode_number = ${source.shot.episodeNumber} and scene_number = ${source.shot.sceneNumber} and shot_number = ${source.shot.shotNumber}`;
      if (!shot) [shot] = await tx<{ id: string }[]>`insert into wb_next.drama_storyboard_shots (id, project_id, user_id, plan_id, episode_number, scene_number, shot_number, prompt)
        values (${randomUUID()}, ${plan.projectId}, ${input.userId}, ${plan.id}, ${source.shot.episodeNumber}, ${source.shot.sceneNumber}, ${source.shot.shotNumber}, ${source.shot.content}) returning id`;
      const [last] = await tx<{ ordinal: number }[]>`select ordinal from wb_next.drama_storyboard_candidates where shot_id = ${shot.id} order by ordinal desc limit 1`;
      const id = randomUUID();
      await tx`insert into wb_next.drama_storyboard_candidates (id, shot_id, script_version_id, ordinal, prompt, source_key, plan_revision, quote_version, scene_snapshot)
        values (${id}, ${shot.id}, ${plan.scriptVersionId}, ${last ? last.ordinal + 1 : 1}, ${source.shot.content}, ${source.sourceKey}, ${plan.revision}, ${source.quoteVersion}, ${tx.json(source.scene)})`;
      for (const [position, role] of source.references.entries()) await tx`insert into wb_next.drama_plan_candidate_roles (candidate_id, role_version_id, position) values (${id}, ${role.roleVersionId}, ${position})`;
      return id;
    },
    async select(input: { userId: string; candidateId: string }) {
      const record = await get(input);
      await tx`select id from wb_next.drama_storyboard_shots where id = ${record.value.shotId} and user_id = ${input.userId} for update`;
      await tx`update wb_next.drama_storyboard_candidates set selected_at = null where shot_id = ${record.value.shotId} and id <> ${input.candidateId}`;
      await tx`update wb_next.drama_storyboard_candidates set selected_at = coalesce(selected_at, clock_timestamp()) where id = ${input.candidateId}`;
      return get(input);
    },
  };
}
