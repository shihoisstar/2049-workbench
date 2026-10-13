import { createHash } from 'node:crypto';
import type { DramaPreparationValue } from '@wb/contracts';
import type { PortraitBinding, PortraitSnapshot } from './public';

export const PORTRAIT_MODEL = 'google/nano-banana-2/text-to-image';
export function portraitBinding(provider: 'mock' | 'atlas', baseUrl = 'https://api.atlascloud.ai'): PortraitBinding {
  const model = provider === 'mock' ? 'mock-role-portrait-v1' : PORTRAIT_MODEL;
  return { provider, model, providerKey: 'portrait:' + createHash('sha256').update(JSON.stringify({ provider, baseUrl, model, aspectRatio: '3:4', resolution: '1k', outputFormat: 'png', promptRevision: 1 })).digest('hex') };
}
export function portraitContentKey(projectId: string, scriptVersionId: string, look: string, role: DramaPreparationValue['roles'][number]) {
  return createHash('sha256').update(JSON.stringify({ projectId, scriptVersionId, look, key: role.key, name: role.name, description: role.description, usage: role.usage })).digest('hex');
}
export function portraitSnapshot(projectId: string, draft: DramaPreparationValue, look: string, role: DramaPreparationValue['roles'][number], binding: PortraitBinding, credits: number): PortraitSnapshot {
  const contentKey = portraitContentKey(projectId, draft.scriptVersionId, look, role);
  const quoteVersion = 'portrait-v1:' + createHash('sha256').update(JSON.stringify({ contentKey, revision: draft.revision, binding, credits })).digest('hex');
  return { scriptVersionId: draft.scriptVersionId, preparationRevision: draft.revision, roleName: role.name, description: role.description, look, contentKey, binding, quoteVersion,
    aspectRatio: '3:4', resolution: '1k', outputFormat: 'png',
    prompt: `角色参考图，单一主体，干净中性背景，完整展示主体外观，清晰面部与服装或毛发细节，不要文字、标志、拼贴或分镜。保持所述物种，不把动物改成人。画风：${look}。角色名：${role.name}。外观要求：${role.description || '根据角色名设计适合故事的形象，由用户确认。'}` };
}
