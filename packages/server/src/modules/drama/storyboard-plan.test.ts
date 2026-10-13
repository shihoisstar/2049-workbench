import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StoryboardPlanShotDraft, UpdateStoryboardPlanShot } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';
import { deriveStoryboardShots } from './storyboard-plan';
import { parseDramaScript, scriptSceneBlocks } from './parser';
test('storyboard detects source text outside scenes instead of silently dropping it', () => {
  const content = '## 第1集\n（黑屏字幕：三小时前）\n**场景1：雨夜 外**\n猫：出发。';
  assert.equal(parseDramaScript(content).status, 'parsed'); assert.equal(scriptSceneBlocks(content).unassigned[0].sourceLine, 2);
  assert.throws(() => deriveStoryboardShots(content, { roles: [], scenes: [] } as unknown as DramaPreparationValue), /第2行/);
});
test('local storyboard edits may be empty but submitted shots must have content', () => {
  const draft = { baseRevision: 1, shotKey: '1:1:1', content: '', roleKeys: [], reviewed: false };
  assert.equal(StoryboardPlanShotDraft.safeParse(draft).success, true); assert.equal(UpdateStoryboardPlanShot.safeParse(draft).success, false);
});
