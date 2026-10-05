import { z } from 'zod';

/** AI 文案优化(剧本第 6 步):一句卖点 → 结构化口播稿。V0 免费额度内不计费。 */
export const PolishRequest = z.object({
  text: z.string().min(2).max(1000),
});
export type PolishRequest = z.infer<typeof PolishRequest>;

export const PolishResult = z.object({
  text: z.string().min(1).max(3000),
});
export type PolishResult = z.infer<typeof PolishResult>;
