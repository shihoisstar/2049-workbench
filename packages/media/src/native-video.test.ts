import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeCaptionDraft } from './native-video';
test('native subtitle draft preserves actual recognized homophones instead of silently substituting planned dialogue', () => {
  const words = [{ text: '孤独', start: 0.4, end: 0.8 }, { text: '孤独，', start: 0.8, end: 1.2 }, { text: '开吃啦。', start: 1.7, end: 2.3 }];
  assert.deepEqual(nativeCaptionDraft({ text: '孤独孤独，开吃啦。', segments: [{ words }] }, 10000), [{ startMs: 400, endMs: 1200, text: '孤独孤独，' }, { startMs: 1700, endMs: 2300, text: '开吃啦。' }]);
  for (const changed of [[{ text: '字', start: 0, end: 11 }], [{ text: '字', start: 0, end: 0 }], [{ text: '字', start: 1, end: 2 }, { text: '字', start: 1.5, end: 3 }]]) assert.throws(() => nativeCaptionDraft({ text: '字', segments: [{ words: changed }] }, 10000));
  assert.throws(() => nativeCaptionDraft({ text: '另一个文本', segments: [{ words }] }, 10000));
});
