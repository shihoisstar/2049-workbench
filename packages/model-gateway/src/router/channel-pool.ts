/**
 * ChannelPool —— 按权重 + 冷却态挑下一个尝试目标。
 * 移植自 2049-agent packages/gateway/src/router/channel-pool.ts(其设计出处:OneAPI common/redis/limit.go 轻量化变体)。
 * 职责边界不变:不做限流/凭证/DB;failover 调度在 router。
 */
import type { ChannelView } from './types';

interface PoolEntry {
  channel: ChannelView;
  cooldownUntilMs: number;
}

export class ChannelPool {
  private entries: PoolEntry[];
  private random: () => number;

  constructor(channels: ChannelView[], options?: { random?: () => number }) {
    this.entries = channels
      .filter((c) => c.status === 'active' && c.health !== 'degraded')
      .map((channel) => ({ channel, cooldownUntilMs: 0 }));
    this.random = options?.random ?? Math.random;
  }

  /** 选中一个可用 channel;无可用返回 null(由 router 翻成 no_channel_available) */
  pick(now: number = Date.now()): ChannelView | null {
    const candidates = this.entries.filter((e) => e.cooldownUntilMs <= now);
    if (candidates.length === 0) return null;

    const total = candidates.reduce((sum, e) => sum + Math.max(1, e.channel.weight), 0);
    let r = this.random() * total;
    for (const entry of candidates) {
      r -= Math.max(1, entry.channel.weight);
      if (r <= 0) return entry.channel;
    }
    return candidates[candidates.length - 1]!.channel;
  }

  /** upstream 5xx / 限流后短期下线;cooldown 约定:5xx→30s,429→retry-after 或 60s */
  cooldown(channelId: number, durationMs: number, now: number = Date.now()): void {
    const entry = this.entries.find((e) => e.channel.id === channelId);
    if (!entry) return;
    const next = now + Math.max(0, durationMs);
    if (next > entry.cooldownUntilMs) entry.cooldownUntilMs = next;
  }

  availableCount(now: number = Date.now()): number {
    return this.entries.filter((e) => e.cooldownUntilMs <= now).length;
  }

  totalCount(): number {
    return this.entries.length;
  }
}
