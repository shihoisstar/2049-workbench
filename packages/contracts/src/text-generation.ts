import { z } from 'zod';

const tokens = () => z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const string = (maximum: number) => z.string().max(maximum).refine(value => !value.includes('\u0000'));
export const TextGenerationUsage = z.object({
  inputTokens: tokens(), outputTokens: tokens(), cachedInputTokens: tokens(), reasoningTokens: tokens(),
}).strict();
export const TextGenerationReceipt = z.object({
  provider: string(100).refine(value => value.length > 0), model: string(200).refine(value => value.length > 0),
  responseId: string(200).nullable(), finishReason: string(100).nullable(),
  text: string(64000), textTruncated: z.boolean(), usage: TextGenerationUsage.nullable(),
}).strict();
export type TextGenerationReceiptValue = z.infer<typeof TextGenerationReceipt>;
export type TextGenerationUsageValue = z.infer<typeof TextGenerationUsage>;
