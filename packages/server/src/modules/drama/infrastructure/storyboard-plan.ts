import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode, StoryboardPlan } from '@wb/contracts';
import type { StoryboardPlanValue, UpdateStoryboardPlanShotValue } from '@wb/contracts';
import { DomainError } from '../../../errors';
type Snapshot = Pick<StoryboardPlanValue, 'scriptVersionId' | 'preparationRevision' | 'roles'>;
interface Row { id: string; project_id: string; source_key: string; snapshot: Snapshot; shots: StoryboardPlanValue['shots']; revision: number; created_at: Date; updated_at: Date }
function view(row: Row) { return { sourceKey: row.source_key, value: StoryboardPlan.parse({ id: row.id, projectId: row.project_id, ...row.snapshot, shots: row.shots, revision: row.revision, current: false, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }) }; }
export function createStoryboardPlanStore(tx: postgres.TransactionSql) {
  async function get(input: { userId: string; planId: string }, lock = false) {
    const rows = lock ? await tx<Row[]>`select * from wb_next.drama_storyboard_plans where id = ${input.planId} and user_id = ${input.userId} for update`
      : await tx<Row[]>`select * from wb_next.drama_storyboard_plans where id = ${input.planId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Storyboard plan not found'); return view(rows[0]);
  }
  return {
    get,
    async latest(input: { userId: string; projectId: string }) {
      const [row] = await tx<Row[]>`select * from wb_next.drama_storyboard_plans where user_id = ${input.userId} and project_id = ${input.projectId} order by created_at desc, id desc limit 1`; return row ? view(row) : null;
    },
    async create(input: { userId: string; projectId: string; sourceKey: string; snapshot: Snapshot; shots: StoryboardPlanValue['shots'] }) {
      const [old] = await tx<Row[]>`select * from wb_next.drama_storyboard_plans where project_id = ${input.projectId} and user_id = ${input.userId} and source_key = ${input.sourceKey}`;
      if (old) return view(old);
      const [row] = await tx<Row[]>`insert into wb_next.drama_storyboard_plans (id, project_id, user_id, source_key, snapshot, shots)
        values (${randomUUID()}, ${input.projectId}, ${input.userId}, ${input.sourceKey}, ${tx.json(input.snapshot as unknown as postgres.JSONValue)}, ${tx.json(input.shots as unknown as postgres.JSONValue)}) returning *`; return view(row);
    },
    async update(input: { userId: string; planId: string; request: UpdateStoryboardPlanShotValue }) {
      const existing = await get(input, true); const request = input.request;
      const shot = existing.value.shots.find(item => item.key === request.shotKey);
      if (!shot) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Storyboard shot not found');
      const keys = new Set(request.roleKeys);
      if (keys.size !== request.roleKeys.length || request.roleKeys.some(key => !existing.value.roles.some(role => role.key === key && role.usage === 'visual'))) throw new DomainError(400, ErrorCode.VALIDATION, 'Unknown visual role');
      if (shot.content === request.content && shot.reviewed === request.reviewed && JSON.stringify(shot.roleKeys) === JSON.stringify(request.roleKeys)) return existing;
      if (request.baseRevision !== existing.value.revision) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Storyboard plan changed; reload before saving');
      const shots = existing.value.shots.map(item => item.key === request.shotKey ? { ...item, content: request.content, roleKeys: request.roleKeys, reviewed: request.reviewed } : item);
      const [row] = await tx<Row[]>`update wb_next.drama_storyboard_plans set shots = ${tx.json(shots as unknown as postgres.JSONValue)}, revision = revision + 1, updated_at = clock_timestamp() where id = ${input.planId} and user_id = ${input.userId} returning *`; return view(row);
    },
  };
}
