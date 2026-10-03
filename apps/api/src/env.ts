import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

/** 借鉴 2049-agent apps/server/src/env.ts:多路径加载 + 空串回退(空串会击穿 ?? 的坑)。 */
export function loadServerEnv(): void {
  for (const path of ['../../.env', '.env']) {
    const resolved = resolve(process.cwd(), path);
    if (existsSync(resolved)) {
      dotenv.config({ path: resolved, override: false, quiet: true });
    }
  }
}

export function numEnv(key: string, fallback: number, opts?: { min?: number }): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const min = opts?.min ?? 1;
  if (n < min) return fallback;
  return n;
}
