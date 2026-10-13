import { createHash } from 'node:crypto';
import { DramaProductionPlan, ErrorCode } from '@wb/contracts';
import type { ProductionShotValue, StoryboardPlanValue } from '@wb/contracts';
import { spokenLines } from './spoken-lines';
import { DomainError } from '../../errors';
export function speechEstimate(text: string) {
  const units = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return { minimumMs: units ? Math.ceil(units / 4 * 1000) + 500 : 0, maximumMs: units ? Math.ceil(units / 3 * 1000) + 500 : 0 };
}
function proposal(parts: StoryboardPlanValue['shots'], order: number): ProductionShotValue {
  const first = parts[0]; const speech = parts.flatMap(shot => spokenLines(shot.sourceText)); const speechTiming = speechEstimate(speech.map(line => line.text).join(''));
  const actions = parts.filter(shot => !spokenLines(shot.sourceText).length).length;
  const timing = { minimumMs: Math.max(2000, speechTiming.minimumMs, actions * 1500), maximumMs: Math.max(3000, speechTiming.maximumMs, actions * 2500) };
  const content = parts.map(shot => shot.content).join('\n\n'); const roles = [...new Set(parts.flatMap(shot => shot.roleKeys))];
  const issues: ProductionShotValue['issues'] = [];
  if (timing.maximumMs > 10000) issues.push('requires_split'); if (roles.length > 10) issues.push('too_many_roles'); if (content.length > 3000) issues.push('description_too_long');
  return { key: `${first.episodeNumber}:${first.sceneNumber}:${order}`, episodeNumber: first.episodeNumber, sceneNumber: first.sceneNumber, shotNumber: order, heading: first.heading,
    sourceShotKeys: parts.map(shot => shot.key), sourceLines: parts.map(shot => shot.sourceLine), sourceText: parts.map(shot => shot.sourceText).join('\n\n'), content, roleKeys: roles, spokenLines: speech,
    timing, suggestedVideoDurationSec: issues.length ? null : timing.maximumMs <= 5000 ? 5 : 10, issues };
}
export function buildDramaProductionPlan(plan: StoryboardPlanValue, episodeCount: number) {
  if (!Number.isInteger(episodeCount) || episodeCount < 1 || episodeCount > 40 || plan.shots.some(shot => shot.episodeNumber > episodeCount)) throw new DomainError(400, ErrorCode.VALIDATION, 'Production episode count does not match source');
  const groups: ProductionShotValue[] = []; let pending: StoryboardPlanValue['shots'] = [];
  const flush = () => { if (!pending.length) return; const first = pending[0]; const order = groups.filter(shot => shot.episodeNumber === first.episodeNumber && shot.sceneNumber === first.sceneNumber).length + 1; groups.push(proposal(pending, order)); pending = []; };
  for (const shot of plan.shots) {
    const last = pending[0]; const combined = proposal([...pending, shot], 1);
    if (pending.length && (last.episodeNumber !== shot.episodeNumber || last.sceneNumber !== shot.sceneNumber || combined.issues.length)) flush();
    pending.push(shot); if (proposal(pending, 1).issues.length) flush();
  }
  flush();
  const episodes = Array.from({ length: episodeCount }, (_, index) => {
    const number = index + 1; const shots = groups.filter(shot => shot.episodeNumber === number);
    const timing = { minimumMs: shots.reduce((sum, shot) => sum + shot.timing.minimumMs, 0), maximumMs: shots.reduce((sum, shot) => sum + shot.timing.maximumMs, 0) };
    const issues: ('episode_missing' | 'duration_short' | 'duration_long' | 'shot_needs_review')[] = [];
    if (!shots.length) issues.push('episode_missing'); else if (timing.maximumMs < 60000) issues.push('duration_short'); else if (timing.minimumMs > 120000) issues.push('duration_long');
    if (shots.some(shot => shot.issues.length)) issues.push('shot_needs_review');
    return { number, timing, targetMinimumMs: 60000, targetMaximumMs: 120000, shots, issues };
  });
  return DramaProductionPlan.parse({ planId: plan.id, projectId: plan.projectId, scriptVersionId: plan.scriptVersionId, planRevision: plan.revision, current: plan.current,
    version: 'production-v1:' + createHash('sha256').update(JSON.stringify({ plan, episodeCount, planner: 1 })).digest('hex'), timingBasis: 'text_estimate_3_to_4_units_per_second', canGenerate: false, estimatedCostCents: null,
    originalShotCount: plan.shots.length, proposedShotCount: groups.length, episodes });
}
