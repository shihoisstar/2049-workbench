import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { GenerationLocator } from '../../generation/public';
import type { MediaAsset, PublishMediaInput } from '../public';
interface Row { id: string; job_id: string; user_id: string; object_key: string; sha256: string; byte_length: number; width: number; height: number; duration_ms: number; expires_at: Date; expired: boolean }
const view = (row: Row): MediaAsset => ({ id: row.id, jobId: row.job_id, userId: row.user_id, objectKey: row.object_key, sha256: row.sha256,
  byteLength: row.byte_length, width: row.width, height: row.height, durationMs: row.duration_ms, expiresAt: row.expires_at.toISOString() });
export function createAssetStore(tx: postgres.TransactionSql) {
  async function find(input: GenerationLocator): Promise<MediaAsset | null> {
    const [row] = await tx<Row[]>`select *, expires_at <= clock_timestamp() as expired from wb_next.media_assets where job_id = ${input.jobId} and user_id = ${input.userId}`;
    if (!row) return null;
    if (row.expired) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Media expired');
    return view(row);
  }
  return {
    find,
    async get(input: GenerationLocator): Promise<MediaAsset> {
      const media = await find(input);
      if (!media) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Media not found');
      return media;
    },
    async insert(input: PublishMediaInput): Promise<MediaAsset> {
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.objectKey !== `jobs/${input.jobId}/${input.sha256}.mp4` ||
        !Number.isInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > 67108864 ||
        !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 16 || input.height < 16 || input.width > 4096 || input.height > 4096 ||
        !Number.isInteger(input.durationMs) || input.durationMs < 500 || input.durationMs > 7000) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid processed media');
      const [row] = await tx<Row[]>`insert into wb_next.media_assets (id, job_id, user_id, object_key, sha256, byte_length, width, height, duration_ms, expires_at)
        values (${randomUUID()}, ${input.jobId}, ${input.userId}, ${input.objectKey}, ${input.sha256}, ${input.byteLength}, ${input.width}, ${input.height}, ${input.durationMs}, clock_timestamp() + interval '7 days') returning *`;
      return view(row);
    },
  };
}
