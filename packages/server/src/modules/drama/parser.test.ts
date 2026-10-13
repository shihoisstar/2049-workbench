import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDramaScript } from './parser';

const samples = [
  '## 第1集\n**场景1：咖啡馆 日/内**\n林夏：今天一定要成功。',
  '## 第一集：重生昔白日\n**场景一：高三教室 日/内**\n（铃声响起）\n沈微（OS）：我真的回来了。',
  '## 第2集：雨夜\n**场景1：天桥 夜/外**\n陈默：别再等了。',
  '## 第二集\n**场景一：医院 夜/内**\n护士：病人醒了。',
  '## 第3集\n**场景1:旧书店 日/内**\n阿宁：这本书不能卖。',
  '## 第三集：误会\n**场景一：校园走廊 日/内**\n周然：你听我解释。',
  '## 第4集\n**场景1：码头 夜/外**\n老秦：船马上开。',
  '## 第四集：启程\n**场景一：车站 日/外**\n小满：我会回来的。',
  '## 第5集\n**场景1：公寓 夜/内**\n许诺：灯怎么灭了？',
  '## 第五集：秘密\n**场景一：档案室 夜/内**\n顾言：答案就在这里。',
  '## 第6集\n**场景1：天台 黄昏/外**\n林夏：风很大。\n**场景2：楼梯间 夜/内**\n陈默：回去吧。',
  '## 第六集：交锋\n**场景一：会议室 日/内**\n沈微：我不同意。\n**场景二：地下车库 夜/内**\n程飒：那就证明给我看。',
  '## 第7集\n**场景1：海边 日/外**\n旁白（OS）：潮水退去后，脚印仍在。',
  '## 第七集：旧友\n**场景一：面馆 日/内**\n老板：两碗牛肉面。',
  '## 第8集\n**场景1：办公室 日/内**\n苏棠：合同已经发出。',
  '## 第八集：回信\n**场景一：邮局 日/内**\n阿远：终于等到了。',
  '## 第9集\n**场景1：山路 夜/外**\n小满：前面有灯。',
  '## 第九集：迷途\n**场景一：木屋 夜/内**\n老人：别开那扇门。',
  '## 第10集\n**场景1：体育馆 日/内**\n林夏：最后一球交给我。',
  '## 第二十集：终章\n**场景一：礼堂 日/内**\n沈微：新的故事才刚开始。',
];

test('twenty canonical drama scripts meet the parser acceptance threshold', () => {
  const results = samples.map(parseDramaScript);
  const accepted = results.filter(result => result.status === 'parsed');
  assert.equal(samples.length, 20);
  assert.ok(accepted.length / samples.length >= 0.95, `${accepted.length}/${samples.length} samples parsed`);
  assert.equal(accepted.length, 20);
  assert.deepEqual(results[1].roles, ['沈微']);
  assert.equal(results[10].episodes[0].scenes[1].dialogueCount, 1);
});

test('parser keeps actionable diagnostics for malformed structure', () => {
  const malformed = [
    '林夏：没有标题。',
    '**场景1：咖啡馆 日/内**\n林夏：没有集标题。',
    '## 第1集\n林夏：没有场景。',
    '## 第1集\n**场景1：咖啡馆 日/内**\n林夏：第一句。\n**场景1：门口 日/外**\n陈默：重复场景。',
    '## 第2集\n**场景1：咖啡馆 日/内**\n林夏：第一集。\n## 第1集\n**场景1：门口 日/外**\n陈默：倒序集数。',
  ].map(parseDramaScript);
  for (const result of malformed) assert.equal(result.status, 'needs_repair');
  assert.ok(malformed.every(result => result.diagnostics.length > 0));
});

test('parenthesized directions with colons are not dialogue speakers', () => {
  const parsed = parseDramaScript('## 第1集\n**场景1：便利店 夜/内**\n（纸片上写着：致阿橘。）\n阿橘：给我的？\n(订单上写着收货人：林晚。)\n林晚：(皱眉)谁恶作剧？');
  assert.equal(parsed.status, 'parsed');
  assert.deepEqual(parsed.roles, ['阿橘', '林晚']);
  assert.equal(parsed.episodes[0].scenes[0].dialogueCount, 2);
});

test('multiline stage directions do not create fictional roles or scenes', () => {
  const parsed = parseDramaScript('## 第1集\n**场景1：店内 日/内**\n（订单缓缓打印\n收货人：林晚\n送达：凌晨四点\n）\n林晚：我没有下单。');
  assert.equal(parsed.status, 'parsed'); assert.deepEqual(parsed.roles, ['林晚']);
  assert.equal(parsed.episodes[0].scenes[0].dialogueCount, 1);
});

test('unfinished direction in truncated text requires repair', () => {
  const parsed = parseDramaScript('## 第1集\n**场景1：店内 日/内**\n林晚：谁在门外？\n（他伸手');
  assert.equal(parsed.status, 'needs_repair');
  assert.ok(parsed.diagnostics.some(item => item.line === 4 && item.message.includes('括号')));
});
