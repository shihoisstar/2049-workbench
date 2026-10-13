import { z } from 'zod';
import { MarketingCategory } from './generation';
export const MarketingCopyInput = z.object({ category: MarketingCategory, durationSec: z.union([z.literal(5), z.literal(10)]).optional(), text: z.string().trim().min(2).max(3000).refine(value => !value.includes('\u0000')) }).strict();
export const MarketingCopyQuery = MarketingCopyInput.pick({ category: true }).strict();
export const MarketingCopyReviewList = z.array(z.object({ jobId: z.string().uuid(), category: MarketingCategory, model: z.string(), reservedCredits: z.number().int().positive(), submittedAt: z.string().datetime() }).strict()).max(20);
export const SubmitMarketingCopy = MarketingCopyInput.extend({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100) }).strict();
export const MarketingCopyQuote = z.object({ mode: z.enum(['disabled', 'mock', 'atlas']), credits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), version: z.string().nullable() }).strict();
export const MarketingCopyResult = z.object({ text: z.string().trim().min(1).max(600), usedFacts: z.array(z.string().trim().min(1).max(1000)).max(12) }).strict();
export const MarketingCopyJob = z.object({ id: z.string().uuid(), requestKey: z.string().uuid(), category: MarketingCategory, sourceText: z.string(), quoteVersion: z.string(), provider: z.enum(['mock', 'atlas']),
  durationSec: z.union([z.literal(5), z.literal(10)]).optional(),
  status: z.enum(['accepted', 'succeeded', 'failed']), submissionStatus: z.enum(['submitting', 'unknown', 'received', 'rejected']).nullable(), billingStatus: z.enum(['none', 'held', 'settled', 'refunded']),
  reservedCredits: z.number().int().nonnegative(), actualCredits: z.number().int().nonnegative().nullable(), failureCode: z.string().nullable(), result: MarketingCopyResult.nullable(), createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable() }).strict();
export type MarketingCopyInputValue = z.infer<typeof MarketingCopyInput>;
export type SubmitMarketingCopyValue = z.infer<typeof SubmitMarketingCopy>;
export type MarketingCopyQuoteValue = z.infer<typeof MarketingCopyQuote>;
export type MarketingCopyResultValue = z.infer<typeof MarketingCopyResult>;
export type MarketingCopyJobValue = z.infer<typeof MarketingCopyJob>;
