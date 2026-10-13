import { createHash } from 'node:crypto';
import type { StoryboardPlanValue } from '@wb/contracts';
import type { DramaImageAsset } from '../drama-image/public';
import type { PlanVideoSnapshot } from './public';
export const PLAN_VIDEO_MODEL = 'mock-plan-video-v1';
export const PLAN_VIDEO_CREDITS = 7;
export function planVideoSnapshot(plan: StoryboardPlanValue, shotKey: string, sourceKey: string, image: DramaImageAsset, aspectRatio: string, speech: PlanVideoSnapshot['spokenLines']): PlanVideoSnapshot {
  const shot = plan.shots.find(item => item.key === shotKey)!;
  return { planId: plan.id, planRevision: plan.revision, sourceKey, shotKey, episodeNumber: shot.episodeNumber, sceneNumber: shot.sceneNumber, shotNumber: shot.shotNumber,
    scriptVersionId: plan.scriptVersionId, content: shot.content, sourceText: shot.sourceText, roleVersionIds: shot.roleKeys.map(key => plan.roles.find(role => role.key === key)!.roleVersionId!),
    imageAssetId: image.id, imageObjectKey: image.objectKey, imageSha256: image.sha256, aspectRatio, spokenLines: speech, provider: 'mock', quoteVersion: '' };
}
export function planVideoQuoteVersion(snapshot: PlanVideoSnapshot) {
  return 'plan-video-v1:' + createHash('sha256').update(JSON.stringify({ ...snapshot, quoteVersion: '', model: PLAN_VIDEO_MODEL, credits: PLAN_VIDEO_CREDITS })).digest('hex');
}
