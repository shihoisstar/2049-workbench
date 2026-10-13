import { z } from 'zod';
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => ![...value].some(character => character.charCodeAt(0) < 32));
export const PortraitReviewQuery = z.object({ cursor: z.string().uuid().optional() }).strict();
export const PortraitReviewList = z.object({ items: z.array(z.object({ jobId: z.string().uuid(), projectId: z.string().uuid(), roleName: z.string(), model: z.string(),
  provider: z.enum(['mock', 'atlas']), submissionStatus: z.enum(['submitting', 'unknown']), reservedCredits: z.number().int().positive(), submittedAt: z.string().datetime() }).strict()), nextCursor: z.string().uuid().nullable() }).strict();
const common = () => ({ requestKey: z.string().uuid(), reason: text(8, 1000), evidenceReference: text(1, 500) });
export const ReviewPortraitRequest = z.discriminatedUnion('action', [
  z.object({ ...common(), action: z.literal('receipt'), provider: z.enum(['mock', 'atlas']), model: text(1, 200), providerTaskId: text(1, 500), confirmedTaskOwnership: z.literal(true) }).strict(),
  z.object({ ...common(), action: z.literal('reject'), confirmedNotAccepted: z.literal(true) }).strict(),
]);
export const PortraitReviewResult = z.object({ job: z.object({ id: z.string().uuid(), status: z.enum(['accepted', 'succeeded', 'failed']),
  submissionStatus: z.enum(['submitting', 'unknown', 'submitted', 'rejected']), reservedCredits: z.number().int().positive(), actualCredits: z.number().int().nonnegative().nullable() }).strict(),
  review: z.object({ action: z.enum(['receipt', 'reject']), requestKey: z.string().uuid(), reason: z.string(), evidenceReference: z.string(), authSource: z.literal('ops-token'), reviewedAt: z.string().datetime() }).strict() }).strict();
export type PortraitReviewListValue = z.infer<typeof PortraitReviewList>;
export type ReviewPortraitRequestValue = z.infer<typeof ReviewPortraitRequest>;
export type PortraitReviewResultValue = z.infer<typeof PortraitReviewResult>;
