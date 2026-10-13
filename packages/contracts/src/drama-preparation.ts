import { z } from 'zod';

const text = (maximum: number) => z.string().trim().max(maximum).refine(value => !value.includes('\u0000'));
export const PreparationRoleInput = z.object({ key: z.string().min(1).max(100), name: text(100).refine(value => value.length > 0),
  usage: z.enum(['visual', 'voice_only']), description: text(1000), referenceMaterialId: z.string().uuid().nullable().default(null) }).strict();
export const RoleAppearanceSelection = z.object({ roleVersionId: z.string().uuid(), referenceMaterialId: z.string().uuid(),
  referenceSha256: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.string().datetime(), confirmedAt: z.string().datetime(),
  status: z.enum(['confirmed', 'needs_confirmation', 'expired']) }).strict();
export const ConfirmRoleAppearance = z.object({ scriptVersionId: z.string().uuid(), preparationRevision: z.number().int().positive(), roleKey: z.string().min(1).max(100) }).strict();
export type ConfirmRoleAppearanceValue = z.infer<typeof ConfirmRoleAppearance>;
export const PreparationSceneInput = z.object({ key: z.string().min(1).max(100), description: text(500) }).strict();
export const SaveDramaPreparation = z.object({ scriptVersionId: z.string().uuid(), baseRevision: z.number().int().nonnegative(),
  roles: z.array(PreparationRoleInput).max(100), scenes: z.array(PreparationSceneInput).max(1000) }).strict();
export const DramaPreparation = z.object({ projectId: z.string().uuid(), scriptVersionId: z.string().uuid(), scriptVersionOrdinal: z.number().int().positive(),
  revision: z.number().int().nonnegative(), updatedAt: z.string().datetime().nullable(),
  roles: z.array(PreparationRoleInput.extend({ evidence: z.array(z.string()).max(2), selection: RoleAppearanceSelection.nullable().default(null) }).strict()),
  scenes: z.array(PreparationSceneInput.extend({ episodeNumber: z.number().int().positive(), sceneNumber: z.number().int().positive(), heading: z.string() }).strict()),
}).strict();
export type SaveDramaPreparationValue = z.infer<typeof SaveDramaPreparation>;
export type DramaPreparationValue = z.infer<typeof DramaPreparation>;
