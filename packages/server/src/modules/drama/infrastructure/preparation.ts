import type postgres from 'postgres';
import { DramaPreparation, ErrorCode, SaveDramaPreparation } from '@wb/contracts';
import type { DramaPreparationValue, SaveDramaPreparationValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
import { derivePreparation } from '../preparation';

type Draft = Omit<SaveDramaPreparationValue, 'baseRevision'>;
interface PreparationRow { active_version_id: string | null; confirmed_version_id: string | null; content: string | null; ordinal: number | null;
  preparation: Draft | null; preparation_revision: number; preparation_updated_at: Date | null }
const conflict = (): never => { throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Confirm the script or refresh the preparation revision'); };
export function createPreparationStore(tx: postgres.TransactionSql) {
  async function load(input: { userId: string; projectId: string }, lock = false) {
    if (lock) await tx`select id from wb_next.drama_projects where id = ${input.projectId} and user_id = ${input.userId} for update`;
    const [row] = await tx<PreparationRow[]>`select p.active_version_id, p.confirmed_version_id, p.preparation, p.preparation_revision, p.preparation_updated_at, v.content, v.ordinal
      from wb_next.drama_projects p left join wb_next.drama_script_versions v on v.id = p.confirmed_version_id
      where p.id = ${input.projectId} and p.user_id = ${input.userId}`;
    if (!row) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
    if (!row.content || !row.confirmed_version_id || row.confirmed_version_id !== row.active_version_id) conflict();
    return row;
  }
  function view(projectId: string, row: PreparationRow): DramaPreparationValue {
    const derived = derivePreparation(row.content!);
    const saved = row.preparation;
    return DramaPreparation.parse({ projectId, scriptVersionId: row.confirmed_version_id, scriptVersionOrdinal: row.ordinal,
      revision: row.preparation_revision, updatedAt: row.preparation_updated_at?.toISOString() ?? null,
      roles: saved ? saved.roles.map(role => ({ ...role, evidence: derived.roles.find(item => item.key === role.key)?.evidence ?? [] })) : derived.roles,
      scenes: derived.scenes.map(scene => ({ ...scene, description: saved?.scenes.find(item => item.key === scene.key)?.description ?? '' })),
    });
  }
  return {
    async get(input: { userId: string; projectId: string }, lock = false) { return view(input.projectId, await load(input, lock)); },
    async selections(input: { userId: string; projectId: string }) {
      return tx<{ role_key: string; script_version_id: string; role_version_id: string; fingerprint: string; confirmed_at: Date; reference_material_id: string; reference_sha256: string }[]>`
        select s.*, v.reference_material_id, v.reference_sha256 from wb_next.drama_role_selections s
        join wb_next.drama_projects p on p.id = s.project_id join wb_next.drama_role_versions v on v.id = s.role_version_id
        join wb_next.drama_roles r on r.id = v.role_id and r.project_id = p.id and r.user_id = p.user_id
        where p.id = ${input.projectId} and p.user_id = ${input.userId}`;
    },
    async selectAppearance(input: { userId: string; projectId: string; roleKey: string; scriptVersionId: string; roleVersionId: string; fingerprint: string }) {
      const [role] = await tx`select v.id from wb_next.drama_role_versions v join wb_next.drama_roles r on r.id = v.role_id
        where v.id = ${input.roleVersionId} and r.project_id = ${input.projectId} and r.user_id = ${input.userId}`;
      if (!role) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Role version not found');
      await tx`insert into wb_next.drama_role_selections (project_id, role_key, script_version_id, role_version_id, fingerprint)
        values (${input.projectId}, ${input.roleKey}, ${input.scriptVersionId}, ${input.roleVersionId}, ${input.fingerprint})
        on conflict (project_id, role_key) do update set script_version_id = excluded.script_version_id, role_version_id = excluded.role_version_id, fingerprint = excluded.fingerprint, confirmed_at = clock_timestamp()`;
    },
    async save(input: { userId: string; projectId: string; draft: SaveDramaPreparationValue }) {
      const parsed = SaveDramaPreparation.safeParse(input.draft);
      if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid preparation draft');
      const row = await load(input, true); const data = parsed.data;
      if (data.scriptVersionId !== row.confirmed_version_id) conflict();
      const derived = derivePreparation(row.content!);
      const invalid = () => { throw new DomainError(400, ErrorCode.VALIDATION, 'Preparation must retain script speakers and scenes'); };
      if (new Set(data.roles.map(role => role.key)).size !== data.roles.length || new Set(data.roles.map(role => role.name)).size !== data.roles.length ||
        derived.roles.some(role => !data.roles.some(item => item.key === role.key && item.name === role.name))) invalid();
      for (const role of data.roles) {
        if (role.usage === 'voice_only' && role.referenceMaterialId) invalid();
        const original = derived.roles.find(item => item.key === role.key);
        if (original ? original.name !== role.name : !/^extra-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(role.key)) invalid();
      }
      if (data.scenes.length !== derived.scenes.length || new Set(data.scenes.map(scene => scene.key)).size !== data.scenes.length || derived.scenes.some(scene => !data.scenes.some(item => item.key === scene.key))) invalid();
      const draft: Draft = { scriptVersionId: data.scriptVersionId, roles: data.roles, scenes: data.scenes };
      if (row.preparation && JSON.stringify(SaveDramaPreparation.parse({ ...row.preparation, baseRevision: 0 })) === JSON.stringify({ ...data, baseRevision: 0 })) return view(input.projectId, row);
      if (row.preparation_revision !== data.baseRevision) conflict();
      await tx`update wb_next.drama_projects set preparation = ${tx.json(draft as unknown as postgres.JSONValue)}, preparation_revision = preparation_revision + 1, preparation_updated_at = clock_timestamp() where id = ${input.projectId}`;
      return view(input.projectId, await load(input));
    },
  };
}
