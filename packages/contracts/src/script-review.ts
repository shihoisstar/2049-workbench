import { z } from 'zod';
import { TextGenerationReceipt } from './text-generation';
import { DramaScriptJobView } from './drama-script-job';

export const ScriptReviewQuery = z.object({ cursor: z.string().uuid().optional() }).strict();
export const ScriptReviewList = z.object({ items: z.array(z.object({ jobId: z.string().uuid(), projectId: z.string().uuid(), title: z.string(),
  model: z.string(), submissionStatus: z.enum(['submitting', 'unknown']), reservedCredits: z.number().int().nonnegative(), submittedAt: z.string().datetime() }).strict()),
  nextCursor: z.string().uuid().nullable() }).strict();
const reason = () => z.string().trim().min(8).max(1000).refine(value => !value.includes('\u0000'));
const evidence = () => z.string().trim().min(1).max(500).refine(value => !value.includes('\u0000'));
export const ReviewScriptRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('receipt'), requestKey: z.string().uuid(), reason: reason(), evidenceReference: evidence(), response: TextGenerationReceipt }).strict(),
  z.object({ action: z.literal('reject'), requestKey: z.string().uuid(), reason: reason(), evidenceReference: evidence(), confirmedNotAccepted: z.literal(true) }).strict(),
]);
export const ScriptReviewResult = z.object({ job: DramaScriptJobView, review: z.object({ action: z.enum(['receipt', 'reject']),
  requestKey: z.string().uuid(), reason: z.string(), evidenceReference: z.string(), authSource: z.literal('ops-token'), reviewedAt: z.string().datetime() }).strict() }).strict();
export type ScriptReviewListValue = z.infer<typeof ScriptReviewList>;
export type ReviewScriptRequestValue = z.infer<typeof ReviewScriptRequest>;
export type ScriptReviewResultValue = z.infer<typeof ScriptReviewResult>;
