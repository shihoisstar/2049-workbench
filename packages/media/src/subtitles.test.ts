import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subtitleAss } from './subtitles';
test('timed captions preserve text safely and reject overlapping, reversed and out-of-range cues', () => {
  const ass = subtitleAss([{ startMs: 0, endMs: 1000, text: '出发{\\pos(1,2)}\n你好' }, { startMs: 1000, endMs: 2000, text: '回家。' }], 2000, { width: 704, height: 1248 });
  assert.match(ass, /PlayResX: 704/); assert.match(ass, /PlayResY: 1248/); assert.match(ass, /Style: Default,Arial,33,/);
  assert.match(ass, /0:00:00\.00,0:00:01\.00/); assert.ok(ass.includes('出发（＼pos(1,2)）\\N你好')); assert.equal(ass.includes('{\\pos'), false);
  for (const cues of [[{ startMs: -1, endMs: 100, text: '错' }], [{ startMs: 100, endMs: 100, text: '错' }], [{ startMs: 0, endMs: 2001, text: '错' }], [{ startMs: 0, endMs: 1000, text: '一' }, { startMs: 900, endMs: 1100, text: '二' }]]) assert.throws(() => subtitleAss(cues, 2000, { width: 704, height: 1248 }));
});
