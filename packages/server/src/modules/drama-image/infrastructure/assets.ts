import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { DramaImageAsset, DramaImageJobLocator, PublishDramaImageInput } from '../public';

interface Row {
  id: string; job_id: string; user_id: string; object_key: string; sha256: string;
  byte_length: number; width: number; height: number; expires_at: Date; expired: boolean; reference_material_id: string | null;
}
const view = (row: Row): DramaImageAsset => ({
  id: row.id, jobId: row.job_id, userId: row.user_id, objectKey: row.object_key, sha256: row.sha256,
  byteLength: row.byte_length, width: row.width, height: row.height, expiresAt: row.expires_at.toISOString(), referenceMaterialId: row.reference_material_id,
});

export function createDramaImageAssetStore(tx: postgres.TransactionSql) {
  async function find(input: DramaImageJobLocator, allowExpired = false): Promise<DramaImageAsset | null> {
    const [row] = await tx<Row[]>`select *, expires_at <= clock_timestamp() as expired from wb_next.drama_image_assets
      where job_id = ${input.jobId} and user_id = ${input.userId}`;
    if (!row) return null;
    if (row.expired && !allowExpired) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Drama image expired');
    return view(row);
  }
  return {
    find,
    metadata: (input: DramaImageJobLocator) => find(input, true),
    async bindReference(input: DramaImageJobLocator & { materialId: string }) {
      await tx`update wb_next.drama_image_assets set reference_material_id = ${input.materialId} where job_id = ${input.jobId} and user_id = ${input.userId} and reference_material_id is null`;
      return this.get(input);
    },
    async get(input: DramaImageJobLocator): Promise<DramaImageAsset> {
      const asset = await find(input);
      if (!asset) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama image not found');
      return asset;
    },
    async insert(input: PublishDramaImageInput): Promise<DramaImageAsset> {
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.objectKey !== `drama-image-jobs/${input.jobId}/${input.sha256}.png` ||
        !Number.isInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > 10485760 ||
        !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 16 || input.height < 16 || input.width > 8192 || input.height > 8192) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid processed drama image');
      }
      const [row] = await tx<Row[]>`insert into wb_next.drama_image_assets
        (id, job_id, user_id, object_key, sha256, byte_length, width, height, expires_at)
        values (${randomUUID()}, ${input.jobId}, ${input.userId}, ${input.objectKey}, ${input.sha256}, ${input.byteLength},
          ${input.width}, ${input.height}, clock_timestamp() + interval '7 days') returning *, false as expired`;
      return view(row);
    },
  };
}
