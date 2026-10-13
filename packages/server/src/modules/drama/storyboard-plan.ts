import { createHash } from 'node:crypto';
import type { DramaPreparationValue, StoryboardPlanValue } from '@wb/contracts';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../errors';
import { parseSpokenLine, scriptSceneBlocks } from './parser';
export function planSourceKey(draft: DramaPreparationValue) {
  return createHash('sha256').update(JSON.stringify({ planner: 1, scriptVersionId: draft.scriptVersionId, revision: draft.revision,
    roles: draft.roles.map(role => ({ key: role.key, name: role.name, usage: role.usage, description: role.description, roleVersionId: role.selection?.roleVersionId ?? null, hash: role.selection?.referenceSha256 ?? null })), scenes: draft.scenes })).digest('hex');
}
export function planSnapshot(draft: DramaPreparationValue) {
  return { scriptVersionId: draft.scriptVersionId, preparationRevision: draft.revision, roles: draft.roles.map(role => ({ key: role.key, name: role.name, usage: role.usage, description: role.description,
    roleVersionId: role.usage === 'visual' ? role.selection!.roleVersionId : null, referenceMaterialId: role.usage === 'visual' ? role.selection!.referenceMaterialId : null, referenceSha256: role.usage === 'visual' ? role.selection!.referenceSha256 : null })) };
}
export function deriveStoryboardShots(content: string, draft: DramaPreparationValue): StoryboardPlanValue['shots'] {
  const source = scriptSceneBlocks(content);
  if (source.unassigned.length) throw new DomainError(400, ErrorCode.VALIDATION, `剧本第${source.unassigned[0].sourceLine}行尚未归入场景。此项目剧本已固定，请返回剧本页，复用创建新项目，将这段内容移到对应场景标题下再确认。`);
  return source.scenes.flatMap(scene => (scene.blocks.length ? scene.blocks : [{ text: scene.heading, sourceLine: scene.sourceLine }]).map((block, index) => {
    const action = /^[（(]/.test(block.text.trim()); const spoken = action ? null : parseSpokenLine(block.text);
    // Speakers are suggestions only; off-screen lines do not automatically put a character on screen.
    const roles = draft.roles.filter(role => role.usage === 'visual' && (spoken ? !spoken.voiceOver && role.name === spoken.name : block.text.includes(role.name)));
    return { key: `${scene.episodeNumber}:${scene.sceneNumber}:${index + 1}`, episodeNumber: scene.episodeNumber, sceneNumber: scene.sceneNumber, shotNumber: index + 1,
      heading: scene.heading, sceneDescription: draft.scenes.find(item => item.key === `${scene.episodeNumber}:${scene.sceneNumber}`)?.description ?? '',
      sourceLine: block.sourceLine, sourceText: block.text, content: block.text.trim(), roleKeys: roles.map(role => role.key), reviewed: false };
  }));
}
