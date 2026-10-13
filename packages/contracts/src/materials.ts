import { z } from 'zod';

/** 上传素材的受支持类型与大小上限(与对象存储 key 扩展名一致)。 */
export const MATERIAL_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MATERIAL_MAX_COUNT = 3;
export const MATERIAL_MAX_BYTES = 10 * 1024 * 1024;
export const MATERIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 素材元数据视图。二进制只存私有对象存储;任何消费方先查库校验归属与有效期,
 * 再按策略签发短时签名 URL,禁止返回公共直链。
 */
export const MaterialView = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'expired']),
  contentType: z.enum(MATERIAL_CONTENT_TYPES),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type MaterialView = z.infer<typeof MaterialView>;
export const MaterialAccess = z.object({ materialId: z.string().uuid(), url: z.string().url(), urlExpiresAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict();
export type MaterialAccessValue = z.infer<typeof MaterialAccess>;

/** 生成任务可引用的素材 ID 列表(有序,最多3张)。 */
export const MaterialIds = z.array(z.string().uuid()).max(MATERIAL_MAX_COUNT);
