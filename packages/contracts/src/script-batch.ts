import { z } from 'zod';
import { DramaScriptVersion } from './drama';

export const SubmitScriptBatch = z.object({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100) }).strict();
export const ScriptBatchQuote = z.object({ mode: z.enum(['disabled', 'mock', 'atlas']), version: z.string().nullable(), credits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  creditsPerEpisode: z.number().int().nonnegative().nullable(), episodeCount: z.number().int().min(1).max(40), reusedEpisodes: z.array(z.number().int().positive()).max(40), toGenerate: z.array(z.number().int().positive()).max(40) }).strict();
export const ScriptBatchEpisode = z.object({ number: z.number().int().positive(), status: z.enum(['reused', 'waiting', 'generating', 'review_required', 'succeeded', 'needs_repair', 'failed', 'paused']),
  jobId: z.string().uuid().nullable(), scriptId: z.string().uuid().nullable(), versionId: z.string().uuid().nullable(), failureCode: z.string().nullable() }).strict();
export const ScriptBatch = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), requestKey: z.string().uuid(), quoteVersion: z.string(), status: z.enum(['accepted', 'succeeded', 'needs_attention']), provider: z.enum(['mock', 'atlas']), episodeCount: z.number().int().min(1).max(40),
  reservedCredits: z.number().int().nonnegative(), actualCredits: z.number().int().nonnegative(), heldCredits: z.number().int().nonnegative(), refundedCredits: z.number().int().nonnegative(), episodes: z.array(ScriptBatchEpisode).max(40),
  draftScriptId: z.string().uuid().nullable(), draftVersion: DramaScriptVersion.nullable(), createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable() }).strict();
export type ScriptBatchQuoteValue = z.infer<typeof ScriptBatchQuote>;
export type ScriptBatchValue = z.infer<typeof ScriptBatch>;
export type SubmitScriptBatchValue = z.infer<typeof SubmitScriptBatch>;
