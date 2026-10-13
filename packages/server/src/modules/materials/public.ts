import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../errors';
import type { GenerationLocator } from '../generation/public';

export interface MaterialRecord {
  id: string;
  userId: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  status: 'active' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface MaterialLocator { userId: string; materialId: string }

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** 有序去重 + UUID 校验 + 上限三张;生成受理与素材入库共用同一份规则。 */
export function normalizeMaterialIds(materialIds: string[]): string[] {
  const deduped: string[] = [];
  for (const id of materialIds) {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid material id');
    }
    if (!deduped.includes(id)) deduped.push(id);
  }
  if (deduped.length > 3) {
    throw new DomainError(400, ErrorCode.VALIDATION, 'At most 3 materials per generation');
  }
  return deduped;
}

export interface InsertMaterialInput {
  userId: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  contentType: MaterialRecord['contentType'];
  width: number;
  height: number;
  expiresAt: string;
}

/** Called only by the transaction composition layer. No billing or identity imports. */
export interface MaterialStore {
  insert(input: InsertMaterialInput): Promise<MaterialRecord>;
  get(input: MaterialLocator): Promise<MaterialRecord>;
  /** Ordered dedupe + ownership + active + unexpired; used at job acceptance time. */
  assertUsable(userId: string, materialIds: string[]): Promise<void>;
  /** Materials linked to a job, ordered by submission position; used by the worker to sign provider-fetch URLs. */
  listForJob(locator: GenerationLocator): Promise<MaterialRecord[]>;
  /** Mark expired rows; returns affected count. */
  sweepExpired(): Promise<number>;
}
