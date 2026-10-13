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

/** GET /v2/wallet/entries 查询参数;游标为服务端下发的原样回传值。 */
export const WalletEntryListQuery = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict();
export type WalletEntryListQuery = z.infer<typeof WalletEntryListQuery>;

/** GET /v2/wallet/entries 响应:按时间倒序的完整流水页,nextCursor 为空表示没有更多。 */
export const WalletEntryList = z.object({
  entries: z.array(WalletEntry),
  nextCursor: z.string().nullable(),
});
export type WalletEntryList = z.infer<typeof WalletEntryList>;
