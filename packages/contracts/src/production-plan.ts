import { z } from 'zod';
import { MarketingCategory } from './generation';
const estimate = z.object({ minimumMs: z.number().int().nonnegative(), maximumMs: z.number().int().nonnegative() }).strict();
const spoken = z.object({ speaker: z.string(), text: z.string(), voiceOver: z.boolean() }).strict();
export const ProductionShot = z.object({ key: z.string(), episodeNumber: z.number().int().positive(), sceneNumber: z.number().int().positive(), shotNumber: z.number().int().positive(), heading: z.string(),
  sourceShotKeys: z.array(z.string()).min(1), sourceLines: z.array(z.number().int().positive()).min(1), sourceText: z.string(), content: z.string(), roleKeys: z.array(z.string()), spokenLines: z.array(spoken),
  timing: estimate, suggestedVideoDurationSec: z.union([z.literal(5), z.literal(10)]).nullable(), issues: z.array(z.enum(['requires_split', 'too_many_roles', 'description_too_long'])) }).strict();
export const DramaProductionPlan = z.object({ planId: z.string().uuid(), projectId: z.string().uuid(), scriptVersionId: z.string().uuid(), planRevision: z.number().int().positive(), version: z.string(), current: z.boolean(),
  timingBasis: z.literal('text_estimate_3_to_4_units_per_second'), canGenerate: z.literal(false), estimatedCostCents: z.null(), originalShotCount: z.number().int().nonnegative(), proposedShotCount: z.number().int().nonnegative(),
  episodes: z.array(z.object({ number: z.number().int().positive(), timing: estimate, targetMinimumMs: z.literal(60000), targetMaximumMs: z.literal(120000), shots: z.array(ProductionShot),
    issues: z.array(z.enum(['episode_missing', 'duration_short', 'duration_long', 'shot_needs_review'])) }).strict()).min(1).max(40) }).strict();
export const MarketingProductionRequest = z.object({ category: MarketingCategory, text: z.string().trim().min(1).max(3000).refine(value => !value.includes('\u0000')), durationSec: z.union([z.literal(5), z.literal(10)]) }).strict();
export const MarketingProductionPlan = z.object({ category: MarketingCategory, durationSec: z.union([z.literal(5), z.literal(10)]), version: z.string(), timingBasis: z.literal('text_estimate_3_to_4_units_per_second'),
  voiceover: z.string(), timing: estimate, issues: z.array(z.enum(['voiceover_missing', 'voiceover_too_long', 'picture_missing'])), canGenerate: z.literal(false), estimatedCostCents: z.null() }).strict();
export type DramaProductionPlanValue = z.infer<typeof DramaProductionPlan>;
export type ProductionShotValue = z.infer<typeof ProductionShot>;
export type MarketingProductionRequestValue = z.infer<typeof MarketingProductionRequest>;
export type MarketingProductionPlanValue = z.infer<typeof MarketingProductionPlan>;
