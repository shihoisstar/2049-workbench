import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ContentSafetyService, loadBannedWords, matchBannedWords } from './content-safety';

test('词库加载:种子词就位,外部文件追加', () => {
  const seed = loadBannedWords({});
  assert.ok(seed.includes('赌博'));
  const merged = loadBannedWords({ BANNED_WORDS_FILE: undefined });
  assert.ok(merged.length >= 10);
});

test('词库匹配:命中返回词表,大小写不敏感', () => {
  const hits = matchBannedWords('这是赌博和博彩内容', ['赌博', '博彩']);
  assert.deepEqual(hits.sort(), ['博彩', '赌博']);
  assert.deepEqual(matchBannedWords('正常文案', ['赌博']), []);
});

test('服务:命中阻断 + 干净文本通过 + 未配置微信时降级词库', async () => {
  const service = new ContentSafetyService(loadBannedWords({}), null);
  const blocked = await service.checkText('帮我写个博彩广告');
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.hits, ['博彩']);
  assert.equal(blocked.provider, 'lexicon');

  const ok = await service.checkText('一句话生成营销短视频');
  assert.equal(ok.blocked, false);
  assert.equal(ok.hits.length, 0);
});

test('服务:注入微信 provider 时优先级在词库之后', async () => {
  const service = new ContentSafetyService(['赌博'], {
    async check(text) {
      return { blocked: text.includes('违规微信词'), hits: ['违规微信词'], provider: 'wechat' };
    },
  });
  const viaWeChat = await service.checkText('包含违规微信词的文本');
  assert.equal(viaWeChat.blocked, true);
  assert.equal(viaWeChat.provider, 'wechat');
  const viaLexicon = await service.checkText('赌博文本');
  assert.equal(viaLexicon.provider, 'lexicon', '词库命中短路,不走微信');
});
