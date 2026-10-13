import { z } from 'zod';
import { MarketingCategory } from './generation';
import { MaterialIds } from './materials';

export const NativeMarketingInput = z.object({
  category: MarketingCategory, durationSec: z.literal(10), resolution: z.literal('720p'), aspectRatio: z.literal('9:16'),
  prompt: z.string().trim().min(1).max(3000).refine(value => !value.includes('\u0000')),
  materialIds: MaterialIds.default([]), copyJobId: z.string().uuid().optional(),
}).strict();
export const NativeMarketingQuote = z.object({
  settlementPoint: z.literal('preview'),
  category: MarketingCategory, durationSec: z.literal(10), resolution: z.literal('720p'), aspectRatio: z.literal('9:16'),
  mode: z.enum(['disabled', 'mock', 'atlas']), available: z.boolean(), credits: z.number().int().positive().nullable(), version: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
export const SubmitNativeMarketing = NativeMarketingInput.extend({ requestKey: z.string().uuid(), quoteVersion: z.string().regex(/^[a-f0-9]{64}$/) });
export type NativeMarketingInputValue = z.infer<typeof NativeMarketingInput>;
export type NativeMarketingQuoteValue = z.infer<typeof NativeMarketingQuote>;
export type SubmitNativeMarketingValue = z.infer<typeof SubmitNativeMarketing>;
