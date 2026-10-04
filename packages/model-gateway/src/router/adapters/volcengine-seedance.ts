/**
 * 火山引擎 Seedance 视频适配器(主通道,ADR-0002)。
 * 走火山方舟(Ark)异步任务 API:POST 创建任务 → GET 轮询。
 * ⚠️ 未验证:URL 路径/字段名按 Ark 公开文档映射,真实联调(T2.5 前置)以实测为准校准;
 *    适配面已收窄到本文件,校准不影响 router/业务层。
 */
import type { AdapterContext, ChannelView, GatewayRequest, VideoAdapter } from '../types';

export interface SeedanceConfig {
  model: string; // 如 doubao-seedance-2-0-fast(联调校准)
  apiPath: string;
}

export function seedanceConfigFrom(channel: ChannelView): SeedanceConfig {
  return {
    model: String(channel.config.model ?? 'doubao-seedance-2-0-fast'),
    apiPath: String(channel.config.apiPath ?? '/api/v3/contents/generations/tasks'),
  };
}

async function arkFetch(ctx: AdapterContext, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  const onAbort = () => controller.abort();
  ctx.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await ctx.fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${ctx.secret}`, 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
      signal: controller.signal,
    });
    if (res.status >= 500) throw Object.assign(new Error(`ark 5xx: ${res.status}`), { status: res.status });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      throw Object.assign(new Error('ark rate limited'), { status: 429, retryAfterMs: Number.isFinite(retryAfter) ? retryAfter : undefined });
    }
    if (res.status >= 400) {
      const body = (await res.text()).slice(0, 300);
      throw Object.assign(new Error(`ark 4xx: ${res.status} ${body}`), { status: res.status });
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
}

export const volcengineSeedanceAdapter: VideoAdapter = {
  async submit(ctx, channel, req: GatewayRequest) {
    const cfg = seedanceConfigFrom(channel);
    const base = channel.baseUrl ?? 'https://ark.cn-beijing.volces.com';
    // 载荷契约:prompt 必填;可选 durationSec/resolution/watermark(镜像 T2.3 表单字段)
    const p = req.payload as { prompt?: string; durationSec?: number; resolution?: string; aspectRatio?: string; imageUrls?: string[] };
    if (!p.prompt) throw Object.assign(new Error('prompt 必填'), { status: 400 });
    const text = [
      p.prompt,
      `--resolution ${p.resolution ?? '480p'}`,
      `--ratio ${p.aspectRatio ?? '9:16'}`,
      `--duration ${p.durationSec ?? 5}`,
    ]
      .filter(Boolean)
      .join(' ');
    const body = {
      model: cfg.model,
      content: [
        { type: 'text', text },
        ...(p.imageUrls ?? []).map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
    };
    const raw = (await arkFetch(ctx, `${base}${cfg.apiPath}`, { method: 'POST', body: JSON.stringify(body) })) as { id?: string };
    if (!raw.id) throw Object.assign(new Error('ark 未返回任务 id'), { status: 502 });
    return { providerTaskId: raw.id, raw };
  },

  async poll(ctx, channel, providerTaskId) {
    const cfg = seedanceConfigFrom(channel);
    const base = channel.baseUrl ?? 'https://ark.cn-beijing.volces.com';
    const raw = (await arkFetch(ctx, `${base}${cfg.apiPath}/${providerTaskId}`, { method: 'GET' })) as {
      status?: string;
      content?: { video_url?: string };
    };
    const status = raw.status === 'succeeded' ? 'succeeded' : raw.status === 'failed' ? 'failed' : raw.status === 'running' ? 'processing' : 'queued';
    return { status, videoUrl: raw.content?.video_url, raw };
  },
};
