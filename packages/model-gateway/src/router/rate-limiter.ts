/**
 * RateLimiter —— 内存 sliding window(RPM)。
 * 移植自 2049-agent packages/gateway/src/router/rate-limiter.ts(设计出处:OneAPI 按"过去 60s 内 N 次"硬阈值)。
 * 单进程内存计数,多实例部署时换 Redis-backed(签名不变)。
 */

export interface SyncRateLimiter {
  consume(
    key: string,
    cost: number,
    options: { limit: number; windowMs: number },
    now?: number,
  ): { ok: true } | { ok: false; retryAfterMs: number };
  reset(): void;
}

export function createMemoryRateLimiter(): SyncRateLimiter {
  const buckets = new Map<string, Array<{ ts: number; cost: number }>>();

  function gc(key: string, now: number, windowMs: number): Array<{ ts: number; cost: number }> {
    let list = buckets.get(key);
    if (!list) {
      // 新桶必须写回 Map,否则首次 push 落在游离数组上,窗口计数永远为空
      list = [];
      buckets.set(key, list);
      return list;
    }
    const cutoff = now - windowMs;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid]!.ts <= cutoff) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) list.splice(0, lo);
    return list;
  }

  return {
    consume(key, cost, options, now = Date.now()) {
      const list = gc(key, now, options.windowMs);
      const sum = list.reduce((s, e) => s + e.cost, 0);
      if (sum + cost > options.limit) {
        const oldest = list[0]?.ts ?? now;
        return { ok: false, retryAfterMs: Math.max(1, oldest + options.windowMs - now) };
      }
      list.push({ ts: now, cost });
      return { ok: true };
    },
    reset() {
      buckets.clear();
    },
  };
}

export function rateLimiterKey(channelId: number, scope: string): string {
  return `ch:${channelId}:${scope}`;
}
