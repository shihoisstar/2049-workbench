import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMarketingProductionPlan } from './production-plan';
test('both marketing categories keep the original narration and flag long five-second speech for review', () => {
  for (const category of ['commerce', 'store_visit'] as const) {
    const text = '口播：' + '字'.repeat(20) + '\n画面：窗边坐下。'; const output = buildMarketingProductionPlan({ category, text, durationSec: 5 });
    assert.equal(output.voiceover, '字'.repeat(20)); assert.ok(output.issues.includes('voiceover_too_long')); assert.equal(output.canGenerate, false); assert.equal(output.estimatedCostCents, null);
    assert.equal(buildMarketingProductionPlan({ category, text: '口播：一起出门。\n画面：展示猫咪图案。', durationSec: 5 }).issues.length, 0);
  }
});
test('marketing plans do not invent voiceover and bind category, text and supported duration', () => {
  const input = { category: 'commerce' as const, text: '棉布帆布袋', durationSec: 5 as const }; const output = buildMarketingProductionPlan(input);
  assert.equal(output.voiceover, ''); assert.deepEqual(output.issues, ['voiceover_missing', 'picture_missing']); assert.notEqual(output.version, buildMarketingProductionPlan({ ...input, category: 'store_visit' }).version);
  const native = buildMarketingProductionPlan({ ...input, durationSec: 10 });
  assert.equal(native.durationSec, 10); assert.notEqual(native.version, output.version);
  assert.throws(() => buildMarketingProductionPlan({ ...input, durationSec: 15 } as never));
  const speech = { ...input, text: '口播：' + '字'.repeat(20) + '\n画面：展示商品。' };
  assert.ok(buildMarketingProductionPlan(speech).issues.includes('voiceover_too_long'));
  assert.equal(buildMarketingProductionPlan({ ...speech, durationSec: 10 }).issues.includes('voiceover_too_long'), false);
});
