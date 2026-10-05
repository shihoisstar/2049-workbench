/**
 * GatewayRouter —— 按 modelName 路由 + failover + 限流。
 * 瘦身移植自 2049-agent packages/gateway/src/router/router.ts:砍 tenant/DB loader(渠道由构造注入)/chat 流式;
 * 保留主流程语义:pick → 限流 → 秘钥 → adapter → (5xx/429 冷却换下一家,4xx 直接抛) → attempts 审计。
 * 视频任务是异步语义:submit 拿 providerTaskId,poll 复用受理 channel(taskOperation 控制)。
 */
import { ChannelPool } from './channel-pool';
import { createMemoryRateLimiter, rateLimiterKey, type SyncRateLimiter } from './rate-limiter';
import type { ChatAdapter } from './chat';
import type { ImageAdapter } from './image';
import {
  GatewayError,
  type ChannelView,
  type GatewayAttempt,
  type GatewayRequest,
  type GatewayResponse,
  type VideoAdapter,
} from './types';

export interface SecretResolver {
  resolve(secretRef: string): Promise<string | null>;
}

export interface EnvSecretResolverOptions {
  /** secretRef → 环境变量名映射(如 "volcengine-primary" → "VOLC_ARK_API_KEY") */
  refToEnv: Record<string, string>;
  env?: Record<string, string | undefined>;
}

/** 环境变量秘钥解析(默认实现);缺失不抛——由 router 统一 cooldown 换下一家 */
export function createEnvSecretResolver(options: EnvSecretResolverOptions): SecretResolver {
  const env = options.env ?? process.env;
  return {
    async resolve(secretRef) {
      const name = options.refToEnv[secretRef];
      return (name && env[name]) || null;
    },
  };
}

export interface GatewayRouterDeps {
  /** 主/备渠道列表(业务层不感知顺序语义,权重决定) */
  channels: ChannelView[];
  adapters: Record<string, VideoAdapter>;
  /** chat 适配器注册表(可选;未配置渠道无 chat 能力) */
  chatAdapters?: Record<string, ChatAdapter>;
  /** 图像适配器注册表(可选) */
  imageAdapters?: Record<string, ImageAdapter>;
  secretResolver: SecretResolver;
  rateLimiter?: SyncRateLimiter;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  defaultTimeoutMs?: number;
  now?: () => number;
  random?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_5XX_COOLDOWN_MS = 30_000;
const DEFAULT_429_COOLDOWN_MS = 60_000;
const DEFAULT_SECRET_COOLDOWN_MS = 60_000;

export interface GatewayRouter {
  dispatch(req: GatewayRequest): Promise<GatewayResponse>;
  /** 文本模型入口(chat):独立于视频任务,同渠道池/限流/冷却语义 */
  chat(req: { modelName: string; system?: string; user: string; maxTokens?: number }): Promise<{ text: string }>;
  /** 图像生成入口(内部 submit+轮询至完成或超时;V1 AI 绘画/改图) */
  generateImage(req: { modelName?: string; prompt: string; imageUrls?: string[]; aspectRatio?: string }): Promise<{ imageUrl: string }>;
}

export function createGatewayRouter(deps: GatewayRouterDeps): GatewayRouter {
  const now = deps.now ?? Date.now;
  const pool = new ChannelPool(deps.channels, { random: deps.random });
  const limiter = deps.rateLimiter ?? createMemoryRateLimiter();
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function chat(req: { modelName: string; system?: string; user: string; maxTokens?: number }): Promise<{ text: string }> {
    const attempts: GatewayAttempt[] = [];
    for (let i = 0; i < maxAttempts; i++) {
      const channel = pool.pick(now());
      if (!channel) break;
      const adapter = deps.chatAdapters?.[channel.providerName];
      if (!adapter) {
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, errorCode: 'adapter_unavailable', errorMessage: 'no chat adapter', durationMs: 0 });
        continue;
      }
      const secret = await deps.secretResolver.resolve(channel.secretRef);
      if (!secret) {
        pool.cooldown(channel.id, DEFAULT_SECRET_COOLDOWN_MS, now());
        continue;
      }
      const started = now();
      try {
        const ctx = { secret, fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: defaultTimeoutMs };
        const { text } = await adapter.chat(ctx, channel, req);
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: true, durationMs: now() - started });
        return { text };
      } catch (e) {
        const err = e as { status?: number; message?: string };
        // chat 失败仅 429 冷却(保护上游);其余失败不冷却——避免波及同渠道的视频任务
        if (err.status === 429) pool.cooldown(channel.id, cooldownFor(channel, 429), now());
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, status: err.status, errorCode: 'upstream_failed', errorMessage: err.message, durationMs: 0 });
      }
    }
    throw new GatewayError(attempts.length ? 'upstream_failed' : 'no_channel_available', 'chat 所有渠道尝试失败', { attempts });
  }

  function cooldownFor(channel: ChannelView, status?: number, retryAfterMs?: number): number {
    if (status === 429) return retryAfterMs ?? DEFAULT_429_COOLDOWN_MS;
    if (status && status >= 500) return DEFAULT_5XX_COOLDOWN_MS;
    return DEFAULT_5XX_COOLDOWN_MS;
  }

  async function dispatch(req: GatewayRequest): Promise<GatewayResponse> {
    const attempts: GatewayAttempt[] = [];
    const op = req.taskOperation ?? 'submit';

    // poll 复用受理 channel(任务恢复语义,与参考实现一致)
    if (req.channelId !== undefined) {
      const pinned = deps.channels.find((c) => c.id === req.channelId);
      if (!pinned) throw new GatewayError('no_channel_available', `channel ${req.channelId} 不存在`, { attempts });
      return runOn(pinned, req, op, attempts);
    }

    for (let i = 0; i < maxAttempts; i++) {
      const channel = pool.pick(now());
      if (!channel) break;

      if (channel.rpmLimit !== null) {
        const verdict = limiter.consume(rateLimiterKey(channel.id, op), 1, {
          limit: channel.rpmLimit,
          windowMs: 60_000,
        }, now());
        if (!verdict.ok) {
          attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, errorCode: 'rate_limited', errorMessage: `RPM>${channel.rpmLimit}`, durationMs: 0 });
          pool.cooldown(channel.id, verdict.retryAfterMs, now());
          continue;
        }
      }

      const adapter = deps.adapters[channel.providerName];
      if (!adapter) {
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, errorCode: 'adapter_unavailable', errorMessage: `no adapter for ${channel.providerName}`, durationMs: 0 });
        pool.cooldown(channel.id, DEFAULT_5XX_COOLDOWN_MS, now());
        continue;
      }

      try {
        return await runOn(channel, req, op, attempts);
      } catch (e) {
        const err = e as { code?: string; status?: number; message?: string; retryAfterMs?: number };
        const status = typeof err.status === 'number' ? err.status : undefined;
        const cooldownMs = cooldownFor(channel, status, err.retryAfterMs);
        pool.cooldown(channel.id, cooldownMs, now());
        if (status && status >= 400 && status < 500 && status !== 429) {
          // 客户端错误,failover 无意义,直接抛
          throw new GatewayError('upstream_failed', err.message ?? 'upstream 4xx', { attempts, cause: e });
        }
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, status, errorCode: 'upstream_failed', errorMessage: err.message, durationMs: 0 });
      }
    }
    throw new GatewayError(attempts.length ? 'upstream_failed' : 'no_channel_available', '所有渠道尝试失败', { attempts });
  }

  async function runOn(channel: ChannelView, req: GatewayRequest, op: 'submit' | 'poll' | 'estimate', attempts: GatewayAttempt[]): Promise<GatewayResponse> {
    const started = now();
    const adapter = deps.adapters[channel.providerName];
    if (!adapter) throw new GatewayError('adapter_unavailable', `no adapter for ${channel.providerName}`, { attempts });

    const secret = await deps.secretResolver.resolve(channel.secretRef);
    if (!secret) {
      attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, errorCode: 'secret_missing', errorMessage: `secret ${channel.secretRef} 未配置`, durationMs: now() - started });
      pool.cooldown(channel.id, DEFAULT_SECRET_COOLDOWN_MS, now());
      throw new GatewayError('secret_missing', `渠道 ${channel.name} 凭证未配置`, { attempts });
    }

    const ctx = { secret, fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: req.timeoutMs ?? defaultTimeoutMs, signal: req.signal };

    if (op === 'submit') {
      const { providerTaskId, raw } = await adapter.submit(ctx, channel, req);
      attempts.push({ channelId: channel.id, channelName: channel.name, ok: true, durationMs: now() - started });
      return { ok: true, status: 200, body: raw, channelId: channel.id, channelName: channel.name, providerName: channel.providerName, attempts, providerTaskId };
    }
    const result = await adapter.poll(ctx, channel, String(req.payload.providerTaskId ?? ''), req);
    attempts.push({ channelId: channel.id, channelName: channel.name, ok: true, durationMs: now() - started });
    return { ok: true, status: 200, body: result, channelId: channel.id, channelName: channel.name, providerName: channel.providerName, attempts };
  }

  async function generateImage(req: { modelName?: string; prompt: string; imageUrls?: string[]; aspectRatio?: string }): Promise<{ imageUrl: string }> {
    const imageAdapters = deps.imageAdapters ?? {};
    const attempts: GatewayAttempt[] = [];
    const maxWaitMs = 90_000;
    const startedAt = now();
    for (let i = 0; i < maxAttempts; i++) {
      const channel = pool.pick(now());
      if (!channel) break;
      const adapter = imageAdapters[channel.providerName];
      if (!adapter) {
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, errorCode: 'adapter_unavailable', errorMessage: 'no image adapter', durationMs: 0 });
        continue;
      }
      const secret = await deps.secretResolver.resolve(channel.secretRef);
      if (!secret) {
        pool.cooldown(channel.id, DEFAULT_SECRET_COOLDOWN_MS, now());
        continue;
      }
      const started = now();
      const ctx = { secret, fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: defaultTimeoutMs };
      try {
        const { providerTaskId } = await adapter.submitImage(ctx, channel, { modelName: req.modelName ?? 'image', prompt: req.prompt, imageUrls: req.imageUrls, aspectRatio: req.aspectRatio });
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: true, durationMs: now() - started });
        // 轮询至完成(渠道限 429 仍冷却)
        for (;;) {
          if (now() - startedAt > maxWaitMs) throw new GatewayError('upstream_timeout', '图像生成超时', { attempts });
          const r = await adapter.pollImage(ctx, channel, providerTaskId);
          if (r.status === 'succeeded' && r.imageUrls?.[0]) return { imageUrl: r.imageUrls[0] };
          if (r.status === 'failed') throw new GatewayError('upstream_failed', '图像生成失败', { attempts });
          await new Promise((res) => setTimeout(res, 2000));
        }
      } catch (e) {
        const err = e as { status?: number; message?: string };
        if (err.status === 429) pool.cooldown(channel.id, DEFAULT_429_COOLDOWN_MS, now());
        if (err instanceof GatewayError) throw e;
        attempts.push({ channelId: channel.id, channelName: channel.name, ok: false, status: err.status, errorCode: 'upstream_failed', errorMessage: err.message, durationMs: 0 });
      }
    }
    throw new GatewayError(attempts.length ? 'upstream_failed' : 'no_channel_available', '图像生成所有渠道尝试失败', { attempts });
  }

  return { dispatch, chat, generateImage };
}
