import { z } from 'zod';

/**
 * 未知受理人工处置契约(运营通道,x-ops-token 鉴权,不对 C 端暴露)。
 * 受理回执=receipt(登记迟到 providerTaskId 后恢复轮询);
 * 拒收=reject(退还预留积分并终止任务)。
 */
export const OpsReviewItem = z.object({
  jobId: z.string().uuid(),
  userId: z.string().uuid(),
  prompt: z.string(),
  resolution: z.enum(['480p', '720p']),
  reservedCredits: z.number().int().positive(),
  providerKey: z.string(),
  createdAt: z.string().datetime(),
});
export type OpsReviewItem = z.infer<typeof OpsReviewItem>;

export const OpsReviewList = z.object({ items: z.array(OpsReviewItem) });
export type OpsReviewList = z.infer<typeof OpsReviewList>;

export const OpsReceiptRequest = z.object({
  providerTaskId: z.string().min(1).max(500),
}).strict();
export type OpsReceiptRequest = z.infer<typeof OpsReceiptRequest>;

export const OpsReviewActionResult = z.object({
  jobId: z.string().uuid(),
  action: z.enum(['receipt', 'reject']),
  status: z.enum(['accepted', 'failed']),
});
export type OpsReviewActionResult = z.infer<typeof OpsReviewActionResult>;
