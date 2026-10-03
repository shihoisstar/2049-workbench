/**
 * Gateway router 类型 —— 瘦身移植自 2049-agent packages/gateway/src/router/types.ts。
 * 砍掉:tenant 隔离 / Prisma 视图依赖 / chat 流式(Phase 2 才回补);保留:错误码语义 / attempts 审计结构。
 */

export type ModelType = 'video';

export type TaskOperation = 'submit' | 'poll' | 'estimate';

export interface GatewayRequest {
  modelName: string;
  modelType: ModelType;
  /** adapter 透传载荷(zod 校验在调用方),不做二次解释 */
  payload: Record<string, unknown>;
  taskOperation?: TaskOperation;
  /** poll 用:复用受理任务的同 channel */
  channelId?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GatewayUsage {
  /** 可信估算(受理前),非上游结算账单 */
  estimatedCostUsd?: number;
  quantity?: number;
}

export interface GatewayResponse {
  ok: boolean;
  status: number;
  body: unknown;
  channelId?: number;
  channelName?: string;
  providerName?: string;
  usage?: GatewayUsage;
  /** 全量尝试记录(含限流/失败),供审计落库 */
  attempts: GatewayAttempt[];
  /** submit 成功时返回,业务侧保存用于 poll */
  providerTaskId?: string;
}

export interface GatewayAttempt {
  channelId: number;
  channelName: string;
  ok: boolean;
  status?: number;
  errorCode?: GatewayErrorCode;
  errorMessage?: string;
  durationMs: number;
}

export type GatewayErrorCode =
  | 'no_provider'
  | 'no_channel_available'
  | 'rate_limited'
  | 'secret_missing'
  | 'upstream_failed'
  | 'upstream_timeout'
  | 'adapter_unavailable'
  | 'invalid_request';

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly retryAfterMs?: number;
  readonly attempts?: GatewayAttempt[];

  constructor(
    code: GatewayErrorCode,
    message: string,
    options?: { retryAfterMs?: number; attempts?: GatewayAttempt[]; cause?: unknown },
  ) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    if (options?.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
    if (options?.attempts !== undefined) this.attempts = options.attempts;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** Channel 轻量视图(plain object,测试无需 mock DB;与参考实现同构) */
export interface ChannelView {
  id: number;
  providerName: string;
  name: string;
  baseUrl: string | null;
  secretRef: string;
  weight: number;
  rpmLimit: number | null;
  status: 'active' | 'disabled' | 'degraded';
  health: 'ok' | 'degraded';
  config: Record<string, unknown>;
}

/** 视频生成 adapter —— 异步任务语义(submit 受理 / poll 轮询)。火山与 Atlas 各实现一份。 */
export interface VideoAdapter {
  submit(ctx: AdapterContext, channel: ChannelView, req: GatewayRequest): Promise<{ providerTaskId: string; raw: unknown }>;
  poll(
    ctx: AdapterContext,
    channel: ChannelView,
    providerTaskId: string,
    req: GatewayRequest,
  ): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed'; videoUrl?: string; raw: unknown }>;
}

export interface AdapterContext {
  secret: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}
