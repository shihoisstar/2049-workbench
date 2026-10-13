import { z } from 'zod';
import { DramaScriptVersion } from './drama';

export const SubmitDramaScriptJob = z.object({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100).optional() }).strict();
export const DramaScriptQuote = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('disabled'), credits: z.null(), version: z.null(), episodeNumber: z.literal(1) }).strict(),
  z.object({ mode: z.literal('mock'), credits: z.literal(0), version: z.string().min(1).max(100), episodeNumber: z.literal(1) }).strict(),
  z.object({ mode: z.literal('atlas'), credits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), version: z.string().min(1).max(100), episodeNumber: z.literal(1) }).strict(),
]);
export type DramaScriptQuoteValue = z.infer<typeof DramaScriptQuote>;
export const ConfirmDramaScript = z.object({ versionId: z.string().uuid() }).strict();
export const DramaScriptJobView = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), requestKey: z.string().uuid(),
  status: z.enum(['accepted', 'succeeded', 'failed']), provider: z.enum(['mock', 'atlas']),
  submissionStatus: z.enum(['submitting', 'received', 'unknown', 'rejected']).nullable().default(null),
  billingStatus: z.enum(['none', 'held', 'settled', 'refunded']).default('none'),
  reservedCredits: z.number().int().nonnegative().default(0), actualCredits: z.number().int().nonnegative().nullable().default(null),
  quoteVersion: z.string().nullable().default(null),
  failureCode: z.string().nullable(), draftScriptId: z.string().uuid().nullable(), draftVersion: DramaScriptVersion.nullable(),
  createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
}).strict();
export type DramaScriptJobViewValue = z.infer<typeof DramaScriptJobView>;
