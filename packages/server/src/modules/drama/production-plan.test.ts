import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { StoryboardPlanValue } from '@wb/contracts';
import { buildDramaProductionPlan } from './production-plan';
const plan = (texts: string[], scenes: number[] = texts.map(() => 1)): StoryboardPlanValue => ({ id: randomUUID(), projectId: randomUUID(), scriptVersionId: randomUUID(), preparationRevision: 1, revision: 1, current: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), roles: [],
  shots: texts.map((text, index) => ({ key: `1:${scenes[index]}:${index + 1}`, episodeNumber: 1, sceneNumber: scenes[index], shotNumber: index + 1, heading: '云海', sceneDescription: '', sourceLine: index + 1, sourceText: text, content: text, roleKeys: index === 0 ? ['cat'] : [], reviewed: false })) });
test('production merges short same-scene paragraphs without discarding source, roles or off-screen speech', () => {
  const input = plan(['（阿橘看云。）', '阿橘：（挥爪）出发。', '阿白（画外音）：跟上。', '（云散开。）']); const before = JSON.stringify(input);
  const output = buildDramaProductionPlan(input, 5); assert.equal(output.originalShotCount, 4); assert.equal(output.proposedShotCount, 1); assert.equal(JSON.stringify(input), before);
  const shot = output.episodes[0].shots[0]; assert.deepEqual(shot.sourceShotKeys, input.shots.map(item => item.key)); assert.deepEqual(shot.sourceLines, [1,2,3,4]); assert.equal(shot.sourceText, input.shots.map(item => item.sourceText).join('\n\n')); assert.deepEqual(shot.roleKeys, ['cat']);
  assert.deepEqual(shot.spokenLines, [{ speaker: '阿橘', text: '出发。', voiceOver: false }, { speaker: '阿白', text: '跟上。', voiceOver: true }]); assert.equal(shot.suggestedVideoDurationSec, 5);
  assert.equal(output.episodes.length, 5); assert.ok(output.episodes[1].issues.includes('episode_missing')); assert.ok(output.episodes[0].issues.includes('duration_short')); assert.equal(output.canGenerate, false); assert.equal(output.estimatedCostCents, null);
});
test('production does not merge across scenes and marks long dialogue without trimming it', () => {
  const long = '阿橘：' + '长'.repeat(80); const input = plan(['阿橘：出发。', '阿橘：回家。', long], [1,2,2]); const output = buildDramaProductionPlan(input, 1);
  assert.equal(output.proposedShotCount, 3); const shot = output.episodes[0].shots[2]; assert.equal(shot.sourceText, long); assert.equal(shot.spokenLines[0].text.length, 80); assert.ok(shot.issues.includes('requires_split')); assert.equal(shot.suggestedVideoDurationSec, null);
  assert.ok(output.episodes[0].issues.includes('shot_needs_review')); assert.throws(() => buildDramaProductionPlan(input, 0));
  input.shots[0].episodeNumber = 2; assert.throws(() => buildDramaProductionPlan(input, 1));
});
test('production version changes with source revision, and multiline action instructions are not voiced', () => {
  const input = plan(['（阿橘看云。\n注意：保持安静。\n）', '旁白：终于到家了。']); const first = buildDramaProductionPlan(input, 1);
  assert.deepEqual(first.episodes[0].shots[0].spokenLines, [{ speaker: '旁白', text: '终于到家了。', voiceOver: false }]);
  const second = buildDramaProductionPlan({ ...input, revision: 2 }, 1); assert.notEqual(first.version, second.version);
  assert.equal(first.version, buildDramaProductionPlan(input, 1).version);
});
