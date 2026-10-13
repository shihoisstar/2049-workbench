import { z } from 'zod';

export const PortraitRequest = z.object({ roleKey: z.string().min(1).max(100), preparationRevision: z.number().int().positive() }).strict();
export const SubmitPortrait = PortraitRequest.extend({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100) }).strict();
export const SelectPortrait = z.object({ preparationRevision: z.number().int().positive() }).strict();
export const PortraitListQuery = z.object({ roleKey: z.string().min(1).max(100), cursor: z.string().uuid().optional() }).strict();
export const PortraitQuote = z.object({ mode: z.enum(['disabled', 'mock', 'atlas']), credits: z.number().int().positive().nullable(), version: z.string().nullable() }).strict();
export const PortraitJobView = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), roleKey: z.string(), roleName: z.string(), description: z.string(),
  requestKey: z.string().uuid(), quoteVersion: z.string(), provider: z.enum(['mock', 'atlas']), status: z.enum(['accepted', 'succeeded', 'failed']),
  submissionStatus: z.enum(['submitting', 'submitted', 'unknown', 'rejected']).nullable(), failureCode: z.string().nullable(),
  reservedCredits: z.number().int().positive(), actualCredits: z.number().int().nonnegative().nullable(), materialId: z.string().uuid().nullable(),
  current: z.boolean(), createdAt: z.string().datetime(), expiresAt: z.string().datetime().nullable() }).strict();
export const PortraitJobList = z.object({ items: z.array(PortraitJobView), nextCursor: z.string().uuid().nullable() }).strict();
export type PortraitRequestValue = z.infer<typeof PortraitRequest>;
export type SubmitPortraitValue = z.infer<typeof SubmitPortrait>;
export type PortraitJobViewValue = z.infer<typeof PortraitJobView>;
export type PortraitJobListValue = z.infer<typeof PortraitJobList>;
export type PortraitQuoteValue = z.infer<typeof PortraitQuote>;
