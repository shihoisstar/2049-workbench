import { z } from 'zod';
import { DramaExportJobView } from './drama';
export const PlanExportList = z.array(DramaExportJobView).max(40);
export const PlanVideoRequest = z.object({ planRevision: z.number().int().positive() }).strict();
export const SubmitPlanVideo = PlanVideoRequest.extend({ requestKey: z.string().uuid(), quoteVersion: z.string().min(1).max(100) });
export const PlanVideoQuote = z.object({ mode: z.enum(['disabled', 'mock']), credits: z.number().int().positive().nullable(), version: z.string().nullable() }).strict();
export type PlanVideoRequestValue = z.infer<typeof PlanVideoRequest>;
export type SubmitPlanVideoValue = z.infer<typeof SubmitPlanVideo>;
