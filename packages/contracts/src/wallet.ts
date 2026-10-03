import { z } from 'zod';

/** 余额流水条目(三账本之一,预留-结算四态:hold/settle/refund/grant)。 */
export const WalletEntry = z.object({
  billingKey: z.string(),
  type: z.enum(['hold', 'settle', 'refund', 'grant']),
  amount: z.number().int(),
  remark: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletEntry = z.infer<typeof WalletEntry>;

/** GET /v1/wallet 响应:余额 + 最近流水(前端积分明细页数据源,T1.3)。 */
export const WalletSummary = z.object({
  balance: z.number().int().nonnegative(),
  entries: z.array(WalletEntry),
});
export type WalletSummary = z.infer<typeof WalletSummary>;
