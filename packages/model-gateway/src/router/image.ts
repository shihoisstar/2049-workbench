import type { AdapterContext, ChannelView } from './types';

export interface ImageRequest {
  modelName: string;
  prompt: string;
  /** 参考图(改图模式):传即自动切 edit 模型(config.modelEdit) */
  imageUrls?: string[];
  aspectRatio?: string;
  timeoutMs?: number;
}

/** Atlas 图像生成(异步任务,与 video 同构):POST generateImage → GET prediction/{id}。 */
export async function submitImage(ctx: AdapterContext, channel: ChannelView, req: ImageRequest): Promise<{ providerTaskId: string }> {
  const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
  const hasImages = Boolean(req.imageUrls?.length);
  // 文生图 / 改图模型分离(config.modelImageT2i / config.modelImageEdit)
  const model = String(hasImages ? channel.config.modelImageEdit ?? req.modelName : channel.config.modelImageT2i ?? req.modelName);
  const body: Record<string, unknown> = { model, prompt: req.prompt };
  if (hasImages) {
    body.image_url = req.imageUrls![0];
    body.image_urls = req.imageUrls;
  }
  const res = await ctx.fetchImpl(`${base}/api/v1/model/generateImage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ctx.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });
  if (res.status >= 500) throw Object.assign(new Error(`atlas image 5xx: ${res.status}`), { status: res.status });
  if (res.status === 429) throw Object.assign(new Error('atlas image rate limited'), { status: 429 });
  if (res.status >= 400) {
    const t = (await res.text()).slice(0, 200);
    throw Object.assign(new Error(`atlas image 4xx: ${res.status} ${t}`), { status: res.status });
  }
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) throw Object.assign(new Error('atlas image 未返回任务 id'), { status: 502 });
  return { providerTaskId: json.data.id };
}

export async function pollImage(ctx: AdapterContext, channel: ChannelView, providerTaskId: string): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed'; imageUrls?: string[] }> {
  const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
  const res = await ctx.fetchImpl(`${base}/api/v1/model/prediction/${providerTaskId}`, {
    headers: { authorization: `Bearer ${ctx.secret}` },
    signal: ctx.signal,
  });
  if (res.status >= 500) throw Object.assign(new Error(`atlas image poll 5xx: ${res.status}`), { status: res.status });
  const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; outputs?: string[] } };
  const data = json.data ?? {};
  if (data.status === 'completed') {
    const imageUrls = (data.outputs ?? []).filter(Boolean);
    if (imageUrls.length === 0) throw Object.assign(new Error('atlas image completed 但无 outputs'), { status: 502 });
    return { status: 'succeeded', imageUrls };
  }
  if (data.status === 'failed') return { status: 'failed' };
  return { status: data.status === 'processing' ? 'processing' : 'queued' };
}

export interface ImageAdapter {
  submitImage(ctx: AdapterContext, channel: ChannelView, req: ImageRequest): Promise<{ providerTaskId: string }>;
  pollImage(ctx: AdapterContext, channel: ChannelView, providerTaskId: string): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed'; imageUrls?: string[] }>;
}

/** Atlas 图像适配器(聚合 OpenAI gpt-image / Seedream / MAI 等 158 个模型)。 */
export const atlasImageAdapter: ImageAdapter = {
  submitImage: submitImage,
  pollImage: pollImage,
};
