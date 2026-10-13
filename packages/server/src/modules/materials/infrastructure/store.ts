import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { GenerationLocator } from '../../generation/public';
import { normalizeMaterialIds } from '../public';
import type { InsertMaterialInput, MaterialLocator, MaterialRecord } from '../public';

interface Row {
  id: string; user_id: string; object_key: string; sha256: string;
  byte_length: number; content_type: MaterialRecord['contentType'];
  width: number; height: number; status: MaterialRecord['status'];
  created_at: Date; expires_at: Date;
}

const record = (row: Row): MaterialRecord => ({
  id: row.id, userId: row.user_id, objectKey: row.object_key, sha256: row.sha256,
  byteLength: row.byte_length, contentType: row.content_type,
  width: row.width, height: row.height, status: row.status,
  createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(),
});

export function createMaterialStore(tx: postgres.TransactionSql) {
  return {
    async insertGenerated(input: InsertMaterialInput & { jobId: string }): Promise<MaterialRecord> {
      if (input.contentType !== 'image/png' || input.objectKey !== `materials/${input.userId}/generated/${input.jobId}/${input.sha256}.png`) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid generated reference');
      await tx`insert into wb_next.user_materials (id, user_id, object_key, sha256, byte_length, content_type, width, height, expires_at)
        values (${randomUUID()}, ${input.userId}, ${input.objectKey}, ${input.sha256}, ${input.byteLength}, ${input.contentType}, ${input.width}, ${input.height}, ${input.expiresAt}) on conflict (object_key) do nothing`;
      const [row] = await tx<Row[]>`select * from wb_next.user_materials where object_key = ${input.objectKey} and user_id = ${input.userId}`;
      if (!row || row.sha256 !== input.sha256) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Generated reference conflicts');
      return record(row);
    },
    async insert(input: InsertMaterialInput): Promise<MaterialRecord> {
      const [row] = await tx<Row[]>`
        insert into wb_next.user_materials
          (id, user_id, object_key, sha256, byte_length, content_type, width, height, expires_at)
        values (${randomUUID()}, ${input.userId}, ${input.objectKey}, ${input.sha256}, ${input.byteLength},
          ${input.contentType}, ${input.width}, ${input.height}, ${input.expiresAt})
        on conflict (object_key) do update set
          status = 'active',
          expires_at = excluded.expires_at
        returning *`;
      return record(row);
    },
    async get(input: MaterialLocator): Promise<MaterialRecord> {
      const [row] = await tx<Row[]>`
        select * from wb_next.user_materials where id = ${input.materialId} and user_id = ${input.userId}`;
      if (!row) throw new DomainError(404, ErrorCode.MATERIAL_NOT_FOUND, 'Material not found');
      return record(row);
    },
    async assertUsable(userId: string, materialIds: string[]): Promise<void> {
      const ids = normalizeMaterialIds(materialIds);
      if (ids.length === 0) return;
      const rows = await tx<Row[]>`
        select * from wb_next.user_materials where user_id = ${userId} and id in ${tx(ids)} for update`;
      const byId = new Map(rows.map(row => [row.id, row]));
      for (const id of ids) {
        const row = byId.get(id);
        if (!row) throw new DomainError(404, ErrorCode.MATERIAL_NOT_FOUND, 'Material not found');
        if (row.status !== 'active' || row.expires_at.getTime() <= Date.now()) {
          throw new DomainError(409, ErrorCode.MATERIAL_EXPIRED, 'Material expired');
        }
      }
    },
    async listForJob(input: GenerationLocator): Promise<MaterialRecord[]> {
      const rows = await tx<Row[]>`
        select m.* from wb_next.generation_job_materials link
        join wb_next.user_materials m on m.id = link.material_id
        where link.job_id = ${input.jobId}
        order by link.position`;
      return rows.map(record);
    },
    async sweepExpired(): Promise<number> {
      const rows = await tx<{ id: string }[]>`
        update wb_next.user_materials set status = 'expired'
        where status = 'active' and expires_at <= clock_timestamp() returning id`;
      return rows.length;
    },
  };
}
