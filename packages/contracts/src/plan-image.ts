import { z } from 'zod';
export const PlanImageRequest = z.object({ shotKey: z.string().min(1).max(100), planRevision: z.number().int().positive() }).strict();
export const SubmitPlanImage = PlanImageRequest.extend({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100) });
export const PlanImageQuote = z.object({ mode: z.enum(['disabled', 'mock']), credits: z.number().int().positive().nullable(), version: z.string().nullable() }).strict();
export const PlanImageQuery = z.object({ shotKey: z.string().min(1).max(100), cursor: z.string().uuid().optional() }).strict();
export const SelectPlanImage = z.object({ planRevision: z.number().int().positive() }).strict();
export const PlanImage = z.object({ candidateId: z.string().uuid(), planId: z.string().uuid(), shotId: z.string().uuid(), shotKey: z.string(), planRevision: z.number().int().positive(),
  roleVersionIds: z.array(z.string().uuid()), content: z.string(), current: z.boolean(), selectedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), expiresAt: z.string().datetime().nullable(),
  jobId: z.string().uuid(), requestKey: z.string().uuid(), provider: z.literal('mock'), status: z.enum(['accepted', 'succeeded', 'failed']), reservedCredits: z.number().int().positive(), actualCredits: z.number().int().nonnegative().nullable(), failureCode: z.string().nullable(),
}).strict();
export const PlanImageList = z.object({ items: z.array(PlanImage), nextCursor: z.string().uuid().nullable() }).strict();
export type PlanImageRequestValue = z.infer<typeof PlanImageRequest>;
export type SubmitPlanImageValue = z.infer<typeof SubmitPlanImage>;
export type PlanImageQuoteValue = z.infer<typeof PlanImageQuote>;
export type PlanImageValue = z.infer<typeof PlanImage>;
export type PlanImageListValue = z.infer<typeof PlanImageList>;
