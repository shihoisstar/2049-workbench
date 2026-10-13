import { createHash } from 'node:crypto';
import { ErrorCode } from '@wb/contracts';
import type { StoryboardPlanValue } from '@wb/contracts';
import { DomainError } from '../../errors';
export const PLAN_IMAGE_MODEL = 'mock-plan-image-v1';
export const PLAN_IMAGE_TEST_CREDITS = 7;
export function planImageSource(plan: StoryboardPlanValue, shotKey: string, project: { look: string; aspectRatio: string }) {
  const shot = plan.shots.find(item => item.key === shotKey);
  if (!shot) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Storyboard shot not found');
  const roles = shot.roleKeys.map(key => plan.roles.find(role => role.key === key && role.usage === 'visual'));
  if (roles.some(role => !role?.roleVersionId || !role.referenceMaterialId || !role.referenceSha256)) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Confirmed role reference missing');
  const references = roles.map(role => ({ roleVersionId: role!.roleVersionId!, referenceMaterialId: role!.referenceMaterialId!, referenceSha256: role!.referenceSha256! }));
  const scene = { heading: shot.heading, description: shot.sceneDescription, look: project.look, aspectRatio: project.aspectRatio };
  const sourceKey = createHash('sha256').update(JSON.stringify({ planId: plan.id, scriptVersionId: plan.scriptVersionId, shotKey, content: shot.content, scene, references })).digest('hex');
  const quoteVersion = 'plan-image-v1:' + createHash('sha256').update(JSON.stringify({ sourceKey, revision: plan.revision, model: PLAN_IMAGE_MODEL, credits: PLAN_IMAGE_TEST_CREDITS })).digest('hex');
  return { shot, references, scene, sourceKey, quoteVersion };
}
export function assertPlanImageReady(plan: StoryboardPlanValue, source: ReturnType<typeof planImageSource>, revision: number) {
  if (!plan.current || !source.shot.reviewed || plan.revision !== revision) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, '请先保存并核对这一镜，再生成图片。');
  if (source.references.length > 10) throw new DomainError(400, ErrorCode.VALIDATION, '这一镜最多使用10个出镜角色，请先调整分镜。');
  if (source.shot.content.length > 3000) throw new DomainError(400, ErrorCode.VALIDATION, '请将这一镜的画面描述精简到3000字以内，再生成图片。');
}
