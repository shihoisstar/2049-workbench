import { z } from 'zod';
import { VIDEO_PRICING } from './pricing';

export const GenerationSettings = z.object({
  resolution: z.enum(['480p', '720p']),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
  durationSec: z.literal(5),
}).strict();

// A change to price/model/settings invalidates previously displayed quotes.
export function generationQuoteVersion(settings: z.infer<typeof GenerationSettings>): string {
  const tier = VIDEO_PRICING[settings.resolution];
  return `video-v1:${settings.resolution}:${settings.aspectRatio}:5:${tier.model}:${tier.credits}`;
}

export const GenerationQuote = GenerationSettings.extend({
  version: z.string(),
  credits: z.number().int().positive(),
  available: z.boolean(),
});
export type GenerationQuote = z.infer<typeof GenerationQuote>;

export const SubmitGeneration = GenerationSettings.extend({
  requestKey: z.string().uuid(),
  quoteVersion: z.string().min(1).max(200),
  prompt: z.string().min(1).max(3000).refine(value => value.trim().length > 0 && !value.includes('\u0000')),
}).strict();
export type SubmitGeneration = z.infer<typeof SubmitGeneration>;

// Do not publish internal user IDs, supplier cost, or unvalidated output references.
export const GenerationView = GenerationSettings.extend({
  id: z.string().uuid(),
  requestKey: z.string(),
  prompt: z.string(),
  status: z.enum(['accepted', 'succeeded', 'failed']),
  reservedCredits: z.number().int().nonnegative(),
  actualCredits: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
}).strip();
export type GenerationView = z.infer<typeof GenerationView>;

export const MediaAccess = z.object({
  assetId: z.string().uuid(), jobId: z.string().uuid(), url: z.string().url(),
  urlExpiresAt: z.string().datetime(), expiresAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().int().positive(),
});
export type MediaAccess = z.infer<typeof MediaAccess>;
