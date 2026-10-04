/**
 * 内容安全 v0(T2.4 / INF-06 / MKV-03):生成链路守门员。
 * 分层:词库阻断(本地,确定性,V0 主力)→ 微信 msgSecCheck(需认证小程序,阻塞墙;未配置时降级词库-only)。
 * 语义:命中 → CONTENT_BLOCKED(5001)+ hits 供前端高亮;不阻断不落地审核记录(随 INF-09)。
 */
import { readFileSync } from 'node:fs';

import { SEED_BANNED_WORDS } from './content/banned-words.seed';

export interface SafetyVerdict {
  blocked: boolean;
  hits: string[];
  /** 检查来源:lexicon=词库;wechat=微信 msgSecCheck(未上线前不会出现) */
  provider: 'lexicon' | 'wechat';
}

export interface TextSafetyProvider {
  check(text: string): Promise<SafetyVerdict>;
}

/** 读词库:内置种子 + 可选外部文件(BANNED_WORDS_FILE,JSON 字符串数组)。 */
export function loadBannedWords(env: { BANNED_WORDS_FILE?: string } = process.env): string[] {
  const words = new Set(SEED_BANNED_WORDS.map((w) => w.trim()).filter(Boolean));
  if (env.BANNED_WORDS_FILE) {
    const extra = JSON.parse(readFileSync(env.BANNED_WORDS_FILE, 'utf8')) as string[];
    for (const w of extra) {
      const t = w.trim();
      if (t) words.add(t);
    }
  }
  return [...words];
}

/** 词库匹配:忽略大小写;V0 线性扫描(词库小;运营级词库换 AC 自动机,V1 记录)。 */
export function matchBannedWords(text: string, words: string[]): string[] {
  const lowered = text.toLowerCase();
  return words.filter((w) => lowered.includes(w.toLowerCase()));
}

/** 微信 msgSecCheck 适配器 —— 未配置凭证时显式不可用(调用方降级,不假绿)。 */
export function createWeChatTextProvider(env: { WX_ACCESS_TOKEN?: string } = process.env): TextSafetyProvider | null {
  if (!env.WX_ACCESS_TOKEN) return null;
  // TODO(T2.5 前置/认证后):POST https://api.weixin.qq.com/wxa/msg_sec_check?access_token=...
  // 返回 { errcode: 87014 } 即命中。接口形状先立,真实调用随凭证解锁。
  return {
    async check() {
      throw new Error('msgSecCheck 适配器未实现(等认证小程序凭证)');
    },
  };
}

export class ContentSafetyService {
  constructor(
    private readonly words: string[],
    private readonly weChatProvider: TextSafetyProvider | null = createWeChatTextProvider(),
  ) {}

  async checkText(text: string): Promise<SafetyVerdict> {
    const hits = matchBannedWords(text, this.words);
    if (hits.length > 0) {
      return { blocked: true, hits, provider: 'lexicon' };
    }
    if (this.weChatProvider) {
      const v = await this.weChatProvider.check(text);
      return { ...v, provider: 'wechat' };
    }
    return { blocked: false, hits: [], provider: 'lexicon' };
  }
}
