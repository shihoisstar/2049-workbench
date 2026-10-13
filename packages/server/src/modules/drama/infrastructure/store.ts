import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { dramaEpisodeCoverage, ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import { parseDramaScript } from '../parser';
import type {
  CreateDramaProjectInput, CreateDramaRoleInput, CreateDramaRoleVersionInput, CreateDramaSceneInput, CreateDramaSceneVersionInput,
  CreateDramaStoryboardCandidateInput, CreateDramaStoryboardShotInput, DramaParseResult, DramaProject, DramaProjectWorkflow,
  DramaRole, DramaRoleVersion, DramaScene, DramaSceneVersion, DramaScript, DramaScriptVersion, DramaStoryboardCandidate, DramaStoryboardShot,
} from '../public';

interface ProjectRow {
  id: string; script_id: string | null; active_version_id: string | null; mode: DramaProject['mode']; title: string;
  idea: string | null; look: DramaProject['look']; aspect_ratio: DramaProject['aspectRatio']; episode_count: number;
  genre: DramaProject['genre']; tone: DramaProject['tone']; created_at: Date; confirmed_version_id: string | null;
}
interface ScriptRow { id: string; title: string; created_at: Date }
interface VersionRow {
  id: string; ordinal: number; content: string; source: DramaScriptVersion['source']; parse_status: DramaParseResult['status'];
  parsed_json: DramaParseResult; created_at: Date;
}
interface RoleRow { id: string; project_id: string; name: string; created_at: Date }
interface RoleVersionRow { id: string; ordinal: number; description: string; reference_material_id: string; reference_sha256: string; created_at: Date }
interface SceneRow { id: string; project_id: string; name: string; created_at: Date }
interface SceneVersionRow { id: string; ordinal: number; description: string; created_at: Date }
interface ShotRow { id: string; project_id: string; episode_number: number; scene_number: number; prompt: string; created_at: Date }
interface CandidateRow {
  id: string; script_version_id: string; role_version_id: string; scene_version_id: string; ordinal: number; prompt: string;
  selected_at: Date | null; created_at: Date; image_job_id?: string | null; image_job_status?: 'accepted' | 'succeeded' | 'failed' | null;
  image_job_failure_code?: string | null;
}

const version = (row: VersionRow): DramaScriptVersion => ({
  id: row.id, ordinal: row.ordinal, content: row.content, source: row.source,
  parse: { ...row.parsed_json, status: row.parse_status }, createdAt: row.created_at.toISOString(),
});
const roleVersion = (row: RoleVersionRow): DramaRoleVersion => ({
  id: row.id, ordinal: row.ordinal, description: row.description, referenceMaterialId: row.reference_material_id,
  referenceSha256: row.reference_sha256, createdAt: row.created_at.toISOString(),
});
const sceneVersion = (row: SceneVersionRow): DramaSceneVersion => ({ id: row.id, ordinal: row.ordinal, description: row.description, createdAt: row.created_at.toISOString() });
const candidate = (row: CandidateRow): DramaStoryboardCandidate => ({
  id: row.id, scriptVersionId: row.script_version_id, roleVersionId: row.role_version_id, sceneVersionId: row.scene_version_id,
  ordinal: row.ordinal, prompt: row.prompt, selectedAt: row.selected_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(),
  imageJob: row.image_job_id ? { id: row.image_job_id, status: row.image_job_status!, failureCode: row.image_job_failure_code ?? null } : null,
  videoJob: null,
});

async function project(tx: postgres.TransactionSql, userId: string, projectId: string): Promise<DramaProject> {
  const [row] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${projectId} and user_id = ${userId}`;
  if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
  let activeVersion: DramaScriptVersion | null = null;
  if (row.script_id && row.active_version_id) {
    const [current] = await tx<VersionRow[]>`
      select v.* from wb_next.drama_script_versions v join wb_next.drama_scripts s on s.id = v.script_id
      where v.id = ${row.active_version_id} and v.script_id = ${row.script_id} and s.user_id = ${userId}`;
    if (!current) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script version not found');
    activeVersion = version(current);
  }
  return {
    id: row.id, scriptId: row.script_id, activeVersionId: row.active_version_id, mode: row.mode, title: row.title,
    idea: row.idea, look: row.look, aspectRatio: row.aspect_ratio, episodeCount: row.episode_count,
    genre: row.genre, tone: row.tone, createdAt: row.created_at.toISOString(), activeVersion, confirmedVersionId: row.confirmed_version_id,
  };
}

async function script(tx: postgres.TransactionSql, userId: string, row: ScriptRow): Promise<DramaScript> {
  const [current] = await tx<VersionRow[]>`
    select v.* from wb_next.drama_script_versions v join wb_next.drama_scripts s on s.id = v.script_id
    where v.script_id = ${row.id} and s.user_id = ${userId} order by v.ordinal desc limit 1`;
  if (!current) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script version not found');
  return { id: row.id, title: row.title, latestVersion: version(current), createdAt: row.created_at.toISOString() };
}

export function createDramaStore(tx: postgres.TransactionSql) {
  async function role(userId: string, roleId: string): Promise<DramaRole> {
    const [row] = await tx<RoleRow[]>`select * from wb_next.drama_roles where id = ${roleId} and user_id = ${userId}`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama role not found');
    const [current] = await tx<RoleVersionRow[]>`select * from wb_next.drama_role_versions where role_id = ${roleId} order by ordinal desc limit 1`;
    if (!current) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama role version not found');
    return { id: row.id, projectId: row.project_id, name: row.name, createdAt: row.created_at.toISOString(), latestVersion: roleVersion(current) };
  }
  async function scene(userId: string, sceneId: string): Promise<DramaScene> {
    const [row] = await tx<SceneRow[]>`select * from wb_next.drama_scenes where id = ${sceneId} and user_id = ${userId}`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama scene not found');
    const [current] = await tx<SceneVersionRow[]>`select * from wb_next.drama_scene_versions where scene_id = ${sceneId} order by ordinal desc limit 1`;
    if (!current) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama scene version not found');
    return { id: row.id, projectId: row.project_id, name: row.name, createdAt: row.created_at.toISOString(), latestVersion: sceneVersion(current) };
  }
  async function shot(userId: string, shotId: string): Promise<DramaStoryboardShot> {
    const [row] = await tx<ShotRow[]>`select * from wb_next.drama_storyboard_shots where id = ${shotId} and user_id = ${userId}`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard shot not found');
    const candidates = await tx<CandidateRow[]>`
      select c.*, j.id as image_job_id, j.status as image_job_status, j.failure_code as image_job_failure_code
      from wb_next.drama_storyboard_candidates c left join wb_next.drama_image_jobs j on j.candidate_id = c.id
      where c.shot_id = ${shotId} order by c.ordinal`;
    return { id: row.id, projectId: row.project_id, episodeNumber: row.episode_number, sceneNumber: row.scene_number, prompt: row.prompt, createdAt: row.created_at.toISOString(), candidates: candidates.map(candidate) };
  }
  async function projectWithScript(userId: string, projectId: string): Promise<ProjectRow> {
    const [row] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${projectId} and user_id = ${userId} for update`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
    if (!row.active_version_id) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Storyboard requires a fixed script version');
    return row;
  }

  return {
    async lockProject(input: { userId: string; projectId: string }) {
      const [found] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId} for update`;
      if (!found) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
      return found;
    },
    async createGeneratedDraft(input: { userId: string; title: string; content: string; source: 'mock_generated' | 'ai_generated' }) {
      const scriptId = randomUUID(); const versionId = randomUUID(); const parsed = parseDramaScript(input.content);
      await tx`insert into wb_next.drama_scripts (id, user_id, title) values (${scriptId}, ${input.userId}, ${input.title})`;
      await tx`insert into wb_next.drama_script_versions (id, script_id, ordinal, content, source, parse_status, parsed_json)
        values (${versionId}, ${scriptId}, 1, ${input.content}, ${input.source}, ${parsed.status}, ${tx.json(parsed as unknown as postgres.JSONValue)})`;
      return { versionId, parseStatus: parsed.status, parse: parsed };
    },
    async confirmScript(input: { userId: string; projectId: string; versionId: string; draftScriptId: string | null }) {
      const [found] = await tx<ProjectRow[]>`select * from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId} for update`;
      if (!found) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
      const [draft] = await tx<{ script_id: string; parse_status: string; parsed_json: DramaParseResult }[]>`select v.script_id, v.parse_status, v.parsed_json from wb_next.drama_script_versions v join wb_next.drama_scripts s on s.id = v.script_id where v.id = ${input.versionId} and s.user_id = ${input.userId}`;
      if (!draft) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script version not found');
      if (draft.parse_status !== 'parsed' || (found.confirmed_version_id && found.confirmed_version_id !== input.versionId) || draft.script_id !== (found.script_id ?? input.draftScriptId)) {
        throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script version cannot be confirmed for this project');
      }
      if (!dramaEpisodeCoverage(draft.parsed_json, found.episode_count).complete) {
        throw new DomainError(409, ErrorCode.SCRIPT_EPISODES_INCOMPLETE, 'Script episodes do not match the project episode count');
      }
      await tx`update wb_next.drama_projects set script_id = ${draft.script_id}, active_version_id = ${input.versionId}, confirmed_version_id = ${input.versionId} where id = ${input.projectId} and user_id = ${input.userId}`;
      return project(tx, input.userId, input.projectId);
    },
    async create(input: CreateDramaProjectInput): Promise<DramaProject> {
      const projectId = randomUUID();
      if (input.mode === 'idea') {
        await tx`
          insert into wb_next.drama_projects (id, user_id, mode, title, idea, look, aspect_ratio, episode_count, genre, tone)
          values (${projectId}, ${input.userId}, ${input.mode}, ${input.title}, ${input.content}, ${input.look},
            ${input.aspectRatio}, ${input.episodeCount}, ${input.genre ?? null}, ${input.tone ?? null})`;
        return project(tx, input.userId, projectId);
      }
      const scriptId = randomUUID();
      const versionId = randomUUID();
      const parsed = parseDramaScript(input.content);
      await tx`insert into wb_next.drama_scripts (id, user_id, title) values (${scriptId}, ${input.userId}, ${input.title})`;
      await tx`
        insert into wb_next.drama_script_versions (id, script_id, ordinal, content, source, parse_status, parsed_json)
        values (${versionId}, ${scriptId}, 1, ${input.content}, 'imported', ${parsed.status}, ${tx.json(parsed as unknown as postgres.JSONValue)})`;
      await tx`
        insert into wb_next.drama_projects (id, user_id, script_id, active_version_id, mode, title, look, aspect_ratio, episode_count)
        values (${projectId}, ${input.userId}, ${scriptId}, ${versionId}, ${input.mode}, ${input.title}, ${input.look}, ${input.aspectRatio}, ${input.episodeCount})`;
      return project(tx, input.userId, projectId);
    },
    getProject(input: { userId: string; projectId: string }) { return project(tx, input.userId, input.projectId); },
    async listProjects(input: { userId: string; cursor?: string }): Promise<{ items: DramaProject[]; nextCursor: string | null }> {
      let cursor: Pick<ProjectRow, 'created_at' | 'id'> | undefined;
      if (input.cursor) {
        const [found] = await tx<Pick<ProjectRow, 'created_at' | 'id'>[]>`select id, created_at from wb_next.drama_projects where id = ${input.cursor} and user_id = ${input.userId}`;
        if (!found) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project cursor not found');
        cursor = found;
      }
      const rows = cursor
        ? await tx<ProjectRow[]>`select * from wb_next.drama_projects where user_id = ${input.userId} and (created_at, id) < (${cursor.created_at}, ${cursor.id}) order by created_at desc, id desc limit 21`
        : await tx<ProjectRow[]>`select * from wb_next.drama_projects where user_id = ${input.userId} order by created_at desc, id desc limit 21`;
      const page = rows.slice(0, 20);
      return { items: await Promise.all(page.map(row => project(tx, input.userId, row.id))), nextCursor: rows.length > 20 ? page.at(-1)?.id ?? null : null };
    },
    async listScripts(input: { userId: string; cursor?: string }): Promise<{ items: DramaScript[]; nextCursor: string | null }> {
      let cursor: Pick<ScriptRow, 'created_at' | 'id'> | undefined;
      if (input.cursor) {
        const [found] = await tx<Pick<ScriptRow, 'created_at' | 'id'>[]>`select id, created_at from wb_next.drama_scripts where id = ${input.cursor} and user_id = ${input.userId}`;
        if (!found) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script cursor not found');
        cursor = found;
      }
      const rows = cursor
        ? await tx<ScriptRow[]>`select * from wb_next.drama_scripts where user_id = ${input.userId} and (created_at, id) < (${cursor.created_at}, ${cursor.id}) order by created_at desc, id desc limit 21`
        : await tx<ScriptRow[]>`select * from wb_next.drama_scripts where user_id = ${input.userId} order by created_at desc, id desc limit 21`;
      const page = rows.slice(0, 20);
      return { items: await Promise.all(page.map(row => script(tx, input.userId, row))), nextCursor: rows.length > 20 ? page.at(-1)?.id ?? null : null };
    },
    async getScript(input: { userId: string; scriptId: string }): Promise<DramaScript> {
      const [row] = await tx<ScriptRow[]>`select * from wb_next.drama_scripts where id = ${input.scriptId} and user_id = ${input.userId}`;
      if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script not found');
      return script(tx, input.userId, row);
    },
    async repairScript(input: { userId: string; scriptId: string; content: string }): Promise<DramaScriptVersion> {
      const [owner] = await tx<{ id: string }[]>`select id from wb_next.drama_scripts where id = ${input.scriptId} and user_id = ${input.userId} for update`;
      if (!owner) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama script not found');
      const [last] = await tx<{ ordinal: number }[]>`select ordinal from wb_next.drama_script_versions where script_id = ${input.scriptId} order by ordinal desc limit 1`;
      const parsed = parseDramaScript(input.content);
      const [inserted] = await tx<VersionRow[]>`
        insert into wb_next.drama_script_versions (id, script_id, ordinal, content, source, parse_status, parsed_json)
        values (${randomUUID()}, ${input.scriptId}, ${last.ordinal + 1}, ${input.content}, 'manual_repair', ${parsed.status}, ${tx.json(parsed as unknown as postgres.JSONValue)}) returning *`;
      return version(inserted);
    },
    async getWorkflow(input: { userId: string; projectId: string }): Promise<DramaProjectWorkflow> {
      await project(tx, input.userId, input.projectId);
      const [roles, scenes, shots] = await Promise.all([
        tx<RoleRow[]>`select * from wb_next.drama_roles where project_id = ${input.projectId} and user_id = ${input.userId} order by created_at, id`,
        tx<SceneRow[]>`select * from wb_next.drama_scenes where project_id = ${input.projectId} and user_id = ${input.userId} order by created_at, id`,
        tx<ShotRow[]>`select * from wb_next.drama_storyboard_shots where project_id = ${input.projectId} and user_id = ${input.userId} and plan_id is null order by episode_number, scene_number, shot_number`,
      ]);
      return { roles: await Promise.all(roles.map(row => role(input.userId, row.id))), scenes: await Promise.all(scenes.map(row => scene(input.userId, row.id))), shots: await Promise.all(shots.map(row => shot(input.userId, row.id))) };
    },
    async roleByName(input: { userId: string; projectId: string; name: string }): Promise<DramaRole | null> {
      const [found] = await tx<{ id: string }[]>`select id from wb_next.drama_roles where user_id = ${input.userId} and project_id = ${input.projectId} and name = ${input.name}`;
      return found ? role(input.userId, found.id) : null;
    },
    async createRole(input: CreateDramaRoleInput): Promise<DramaRole> {
      await projectWithScript(input.userId, input.projectId);
      const roleId = randomUUID();
      await tx`insert into wb_next.drama_roles (id, project_id, user_id, name) values (${roleId}, ${input.projectId}, ${input.userId}, ${input.name})`;
      await tx`insert into wb_next.drama_role_versions (id, role_id, ordinal, description, reference_material_id, reference_sha256) values (${randomUUID()}, ${roleId}, 1, ${input.description}, ${input.referenceMaterialId}, ${input.referenceSha256})`;
      return role(input.userId, roleId);
    },
    async reviseRole(input: CreateDramaRoleVersionInput): Promise<DramaRoleVersion> {
      const current = await role(input.userId, input.roleId);
      const [inserted] = await tx<RoleVersionRow[]>`insert into wb_next.drama_role_versions (id, role_id, ordinal, description, reference_material_id, reference_sha256) values (${randomUUID()}, ${input.roleId}, ${current.latestVersion.ordinal + 1}, ${input.description}, ${input.referenceMaterialId}, ${input.referenceSha256}) returning *`;
      return roleVersion(inserted);
    },
    async createScene(input: CreateDramaSceneInput): Promise<DramaScene> {
      await projectWithScript(input.userId, input.projectId);
      const sceneId = randomUUID();
      await tx`insert into wb_next.drama_scenes (id, project_id, user_id, name) values (${sceneId}, ${input.projectId}, ${input.userId}, ${input.name})`;
      await tx`insert into wb_next.drama_scene_versions (id, scene_id, ordinal, description) values (${randomUUID()}, ${sceneId}, 1, ${input.description})`;
      return scene(input.userId, sceneId);
    },
    async reviseScene(input: CreateDramaSceneVersionInput): Promise<DramaSceneVersion> {
      const current = await scene(input.userId, input.sceneId);
      const [inserted] = await tx<SceneVersionRow[]>`insert into wb_next.drama_scene_versions (id, scene_id, ordinal, description) values (${randomUUID()}, ${input.sceneId}, ${current.latestVersion.ordinal + 1}, ${input.description}) returning *`;
      return sceneVersion(inserted);
    },
    async createShot(input: CreateDramaStoryboardShotInput): Promise<DramaStoryboardShot> {
      await projectWithScript(input.userId, input.projectId);
      const shotId = randomUUID();
      try {
        await tx`insert into wb_next.drama_storyboard_shots (id, project_id, user_id, episode_number, scene_number, prompt) values (${shotId}, ${input.projectId}, ${input.userId}, ${input.episodeNumber}, ${input.sceneNumber}, ${input.prompt})`;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Storyboard shot for this episode and scene already exists');
        }
        throw error;
      }
      return shot(input.userId, shotId);
    },
    async candidateReferenceMaterialId(input: CreateDramaStoryboardCandidateInput): Promise<string> {
      const [row] = await tx<{ reference_material_id: string }[]>`
        select rv.reference_material_id from wb_next.drama_storyboard_shots sh
        join wb_next.drama_projects p on p.id = sh.project_id
        join wb_next.drama_role_versions rv on rv.id = ${input.roleVersionId}
        join wb_next.drama_roles r on r.id = rv.role_id and r.project_id = sh.project_id
        join wb_next.drama_scene_versions sv on sv.id = ${input.sceneVersionId}
        join wb_next.drama_scenes s on s.id = sv.scene_id and s.project_id = sh.project_id
        where sh.id = ${input.shotId} and sh.user_id = ${input.userId} and sh.plan_id is null and p.active_version_id is not null`;
      if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard input not found');
      return row.reference_material_id;
    },
    async candidateReferenceMaterialIdForCandidate(input: { userId: string; candidateId: string }): Promise<string> {
      const [row] = await tx<{ reference_material_id: string }[]>`
        select rv.reference_material_id from wb_next.drama_storyboard_candidates c
        join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        join wb_next.drama_role_versions rv on rv.id = c.role_version_id
        join wb_next.drama_roles r on r.id = rv.role_id and r.project_id = sh.project_id
        where c.id = ${input.candidateId} and sh.user_id = ${input.userId}`;
      if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard candidate not found');
      return row.reference_material_id;
    },
    async createCandidate(input: CreateDramaStoryboardCandidateInput): Promise<DramaStoryboardCandidate> {
      const [row] = await tx<{ active_version_id: string }[]>`
        select p.active_version_id from wb_next.drama_storyboard_shots sh join wb_next.drama_projects p on p.id = sh.project_id
        join wb_next.drama_role_versions rv on rv.id = ${input.roleVersionId} join wb_next.drama_roles r on r.id = rv.role_id and r.project_id = sh.project_id
        join wb_next.drama_scene_versions sv on sv.id = ${input.sceneVersionId} join wb_next.drama_scenes s on s.id = sv.scene_id and s.project_id = sh.project_id
        where sh.id = ${input.shotId} and sh.user_id = ${input.userId} and sh.plan_id is null and p.active_version_id is not null for update`;
      if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard input not found');
      const [last] = await tx<{ ordinal: number }[]>`select ordinal from wb_next.drama_storyboard_candidates where shot_id = ${input.shotId} order by ordinal desc limit 1`;
      const [inserted] = await tx<CandidateRow[]>`
        insert into wb_next.drama_storyboard_candidates (id, shot_id, script_version_id, role_version_id, scene_version_id, ordinal, prompt)
        values (${randomUUID()}, ${input.shotId}, ${row.active_version_id}, ${input.roleVersionId}, ${input.sceneVersionId}, ${last ? last.ordinal + 1 : 1}, ${input.prompt}) returning *`;
      return candidate(inserted);
    },
    async selectCandidate(input: { userId: string; candidateId: string }): Promise<DramaStoryboardCandidate> {
      const [locked] = await tx<{ shot_id: string }[]>`
        select c.shot_id from wb_next.drama_storyboard_candidates c join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        where c.id = ${input.candidateId} and sh.user_id = ${input.userId} and sh.plan_id is null for update of sh`;
      if (!locked) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard candidate not found');
      await tx`update wb_next.drama_storyboard_candidates set selected_at = null where shot_id = ${locked.shot_id}`;
      const [selected] = await tx<CandidateRow[]>`update wb_next.drama_storyboard_candidates set selected_at = clock_timestamp() where id = ${input.candidateId} returning *`;
      return candidate(selected);
    },
    async selectedCandidateForShot(input: { userId: string; shotId: string }, lock = false): Promise<DramaStoryboardCandidate> {
      const [shot] = lock
        ? await tx<{ id: string }[]>`select id from wb_next.drama_storyboard_shots where id = ${input.shotId} and user_id = ${input.userId} and plan_id is null for update`
        : await tx<{ id: string }[]>`select id from wb_next.drama_storyboard_shots where id = ${input.shotId} and user_id = ${input.userId} and plan_id is null`;
      if (!shot) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard shot not found');
      const [row] = await tx<CandidateRow[]>`
        select c.*, j.id as image_job_id, j.status as image_job_status, j.failure_code as image_job_failure_code
        from wb_next.drama_storyboard_candidates c left join wb_next.drama_image_jobs j on j.candidate_id = c.id
        where c.shot_id = ${input.shotId} and c.selected_at is not null`;
      if (!row) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Shot has no selected candidate');
      return candidate(row);
    },
    async selectedCandidateForVideo(input: { userId: string; candidateId: string }): Promise<{ shotId: string; candidate: DramaStoryboardCandidate }> {
      const [shot] = await tx<{ shot_id: string; selected_candidate_id: string | null }[]>`
        select sh.id as shot_id, (
          select selected.id from wb_next.drama_storyboard_candidates selected
          where selected.shot_id = sh.id and selected.selected_at is not null
        ) as selected_candidate_id
        from wb_next.drama_storyboard_candidates c join wb_next.drama_storyboard_shots sh on sh.id = c.shot_id
        where c.id = ${input.candidateId} and sh.user_id = ${input.userId} and sh.plan_id is null for update of sh`;
      if (!shot) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard candidate not found');
      if (shot.selected_candidate_id !== input.candidateId) {
        throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Selected storyboard candidate changed');
      }
      const [row] = await tx<CandidateRow[]>`
        select c.*, j.id as image_job_id, j.status as image_job_status, j.failure_code as image_job_failure_code
        from wb_next.drama_storyboard_candidates c left join wb_next.drama_image_jobs j on j.candidate_id = c.id
        where c.id = ${input.candidateId} and c.shot_id = ${shot.shot_id}`;
      if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama storyboard candidate not found');
      return { shotId: shot.shot_id, candidate: candidate(row) };
    },
  };
}
