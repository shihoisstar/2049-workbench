/**
 * Atlas Cloud 视频适配器(聚合:Vidu/Kling/Seedance/Wan 等;ADR-0002 免费层/联调通道)。
 * 协议移植自 2049-agent packages/gateway atlas-video(含其真机验证结论:duration 必须为数字):
 *   1. POST {baseUrl}/api/v1/model/generateVideo → {data:{id}}
 *   2. GET  {baseUrl}/api/v1/model/prediction/{id} → {data:{status, outputs?:string[]}}
 *   status:completed | failed | pending | processing
 */
import type { AdapterContext, GatewayRequest, VideoAdapter } from '../types';

async function atlasFetch(ctx: AdapterContext, url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
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
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
}

export const atlasVideoAdapter: VideoAdapter = {
  async submit(ctx, channel, req: GatewayRequest) {
    const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
    const p = req.payload as {
      prompt?: string;
      durationSec?: number;
      resolution?: string;
      aspectRatio?: string;
      imageUrls?: string[];
    };
    if (!p.prompt) throw Object.assign(new Error('prompt 必填'), { status: 400 });
    // 模型选择:有图 → i2v(config.modelI2v);纯文生 → 按分辨率(480P=Mini/720P=Fast,定价矩阵)
    const hasImages = Boolean(p.imageUrls?.length);
    const videoModels = (channel.config.videoModels ?? {}) as Record<string, string>;
    const model = String(
      hasImages
        ? channel.config.modelI2v ?? req.modelName
        : videoModels[p.resolution ?? '480p'] ?? channel.config.model ?? req.modelName,
    );
    const body: Record<string, unknown> = {
      model,
      prompt: p.prompt,
      // 真机验证(2049-agent 2026-06-25):duration 字符串会被上游拒,必须数字
      duration: typeof p.durationSec === 'number' ? p.durationSec : Number(p.durationSec ?? 5),
      aspect_ratio: p.aspectRatio ?? '9:16',
      resolution: p.resolution ?? '480p',
    };
    if (p.imageUrls?.length) {
      body.image_url = p.imageUrls[0];
      body.image_urls = p.imageUrls;
    }
    const { status, body: resBody } = await atlasFetch(ctx, `${base}/api/v1/model/generateVideo`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (status >= 500) throw Object.assign(new Error(`atlas 5xx: ${status}`), { status });
    if (status === 429) throw Object.assign(new Error('atlas rate limited'), { status: 429 });
    if (status >= 400) throw Object.assign(new Error(`atlas 4xx: ${status}`), { status });
    const id = (resBody as { data?: { id?: string } }).data?.id;
    if (!id) throw Object.assign(new Error('atlas 未返回任务 id'), { status: 502 });
    return { providerTaskId: id, raw: resBody };
  },

  async poll(ctx, channel, providerTaskId) {
    const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
    const { status, body: resBody } = await atlasFetch(ctx, `${base}/api/v1/model/prediction/${providerTaskId}`, { method: 'GET' });
    if (status >= 500) throw Object.assign(new Error(`atlas 5xx: ${status}`), { status });
    if (status === 429) throw Object.assign(new Error('atlas rate limited'), { status: 429 });
    if (status >= 400) throw Object.assign(new Error(`atlas 4xx: ${status}`), { status });

    const data = (resBody as { data?: { status?: string; outputs?: string[]; error?: string } }).data ?? {};
    if (data.status === 'completed') {
      const videoUrl = data.outputs?.[0];
      if (!videoUrl) throw Object.assign(new Error('atlas completed 但无 outputs'), { status: 502 });
      return { status: 'succeeded', videoUrl, raw: resBody };
    }
    if (data.status === 'failed') {
      return { status: 'failed', raw: resBody };
    }
    return { status: data.status === 'processing' ? 'processing' : 'queued', raw: resBody };
  },
};
