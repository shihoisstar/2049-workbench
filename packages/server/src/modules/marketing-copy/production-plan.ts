import { createHash } from 'node:crypto';
import { MarketingProductionPlan, MarketingProductionRequest } from '@wb/contracts';
import type { MarketingProductionRequestValue } from '@wb/contracts';
export function buildMarketingProductionPlan(input: MarketingProductionRequestValue) {
  const request = MarketingProductionRequest.parse(input);
  const voiceover = /^口播[：:]([^\n]*)/m.exec(request.text)?.[1]?.trim() ?? '';
  const units = (voiceover.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const timing = { minimumMs: units ? Math.ceil(units / 4 * 1000) + 500 : 0, maximumMs: units ? Math.ceil(units / 3 * 1000) + 500 : 0 };
  const issues: ('voiceover_missing' | 'voiceover_too_long' | 'picture_missing')[] = [];
  if (!voiceover) issues.push('voiceover_missing'); else if (timing.maximumMs > request.durationSec * 1000) issues.push('voiceover_too_long');
  if (!/^画面[：:]\s*\S/m.test(request.text)) issues.push('picture_missing');
  return MarketingProductionPlan.parse({ category: request.category, durationSec: request.durationSec, voiceover, timing, issues, version: 'marketing-plan-v1:' + createHash('sha256').update(JSON.stringify(request)).digest('hex'), timingBasis: 'text_estimate_3_to_4_units_per_second', canGenerate: false, estimatedCostCents: null });
}
