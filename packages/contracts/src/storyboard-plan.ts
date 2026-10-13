import { z } from 'zod';
const text = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !value.includes('\u0000'));
export const CreateStoryboardPlan = z.object({ scriptVersionId: z.string().uuid(), preparationRevision: z.number().int().positive() }).strict();
export const UpdateStoryboardPlanShot = z.object({ baseRevision: z.number().int().positive(), shotKey: text(100), content: text(20000), roleKeys: z.array(text(100)).max(100), reviewed: z.boolean() }).strict();
export const StoryboardPlanShotDraft = UpdateStoryboardPlanShot.extend({ content: z.string().max(20000).refine(value => !value.includes('\u0000')) });
export const StoryboardPlan = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), scriptVersionId: z.string().uuid(), preparationRevision: z.number().int().positive(), revision: z.number().int().positive(), current: z.boolean(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  roles: z.array(z.object({ key: z.string(), name: z.string(), usage: z.enum(['visual', 'voice_only']), description: z.string(), roleVersionId: z.string().uuid().nullable(), referenceMaterialId: z.string().uuid().nullable(), referenceSha256: z.string().nullable() }).strict()),
  shots: z.array(z.object({ key: z.string(), episodeNumber: z.number().int().positive(), sceneNumber: z.number().int().positive(), shotNumber: z.number().int().positive(), heading: z.string(), sceneDescription: z.string(), sourceLine: z.number().int().positive(), sourceText: z.string(), content: text(20000), roleKeys: z.array(z.string()), reviewed: z.boolean() }).strict()).min(1).max(1000),
}).strict();
export type StoryboardPlanValue = z.infer<typeof StoryboardPlan>;
export type CreateStoryboardPlanValue = z.infer<typeof CreateStoryboardPlan>;
export type UpdateStoryboardPlanShotValue = z.infer<typeof UpdateStoryboardPlanShot>;
