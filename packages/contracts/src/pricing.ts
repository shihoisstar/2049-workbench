import { z } from 'zod';

/**
 * 定价唯一事实源(V1,方案 A 拍板 2026-10-05):
 * 1 积分 = ¥0.01;模型调用售价 = 成本 × 2;汇率 6.8(方法论借 2049-agent billing.md)。
 * 成本锚点:Atlas 实测折后价(Fast $0.027/s;Mini 480P/5s 折后 $0.0567,参考仓库实测矩阵)。
 * 免费层承诺:注册送 80 积分 ≈ Mini 480P 一条(成本约 ¥0.42/人)。
 */

/** 各分辨率积分价(生成模型随分辨率:480P=Mini,720P/1080P=Fast;上线后按 Atlas 账单校准)。 */
export const VIDEO_PRICING = {
  '480p': { credits: 77, model: 'mini' },
  '720p': { credits: 368, model: 'fast' },
  '1080p': { credits: 700, model: 'fast' },
} as const;

export type VideoResolution = keyof typeof VIDEO_PRICING;

/** 注册赠送积分(= Mini 480P 一条 + 余量)。 */
export const SIGNUP_GRANT_CREDITS = 80;

/** 充值档位(¥ → 积分,含赠送;对应 credit_packages 种子)。 */
export const STORE_PACKAGES = [
  { id: 'pkg-9', label: '入门档', priceCents: 990, credits: 990, bonus: 0 },
  { id: 'pkg-49', label: '标准档', priceCents: 4900, credits: 5000, bonus: 500 },
  { id: 'pkg-98', label: '超值档', priceCents: 9800, credits: 10000, bonus: 1500 },
] as const;

/** 生成任务估算(按分辨率;前端估算条与后端冻结共用此表)。 */
export function estimateCreditsFor(resolution: string): number {
  const tier = VIDEO_PRICING[resolution as VideoResolution];
  return tier ? tier.credits : VIDEO_PRICING['480p'].credits;
}

/** 充值档位 schema(后端 seed 与前端展示共用)。 */
export const StorePackageDef = z.object({
  id: z.string(),
  label: z.string(),
  priceCents: z.number().int().positive(),
  credits: z.number().int().positive(),
  bonus: z.number().int().nonnegative(),
});
