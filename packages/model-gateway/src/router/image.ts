import type { AdapterContext, ChannelView } from './types';

export interface ImageRequest {
  modelName: string;
  prompt: string;
  /** 参考图(改图模式):传即自动切 edit 模型(config.modelEdit) */
  imageUrls?: string[];
  aspectRatio?: string;
  resolution?: '1k' | '2k' | '4k';
  outputFormat?: 'png' | 'jpeg';
  timeoutMs?: number;
}

/** Atlas 图像生成(异步任务,与 video 同构):POST generateImage → GET prediction/{id}。 */
export async function submitImage(ctx: AdapterContext, channel: ChannelView, req: ImageRequest): Promise<{ providerTaskId: string }> {
  const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
  const hasImages = Boolean(req.imageUrls?.length);
  // 文生图 / 改图模型分离(config.modelImageT2i / config.modelImageEdit)
  const model = String(hasImages ? channel.config.modelImageEdit ?? req.modelName : channel.config.modelImageT2i ?? req.modelName);
  const body: Record<string, unknown> = { model, prompt: req.prompt };
  if (req.aspectRatio) body.aspect_ratio = req.aspectRatio;
  if (req.resolution) body.resolution = req.resolution;
  if (req.outputFormat) { body.output_format = req.outputFormat; body.enable_sync_mode = false; body.enable_base64_output = false; }
  if (hasImages) {
    if (channel.config.imageReferenceField === 'images') body.images = req.imageUrls;
    else {
      body.image_url = req.imageUrls![0];
      body.image_urls = req.imageUrls;
    }
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
  const json = (await res.json()) as { data?: { id?: string }; id?: string }; const id = json.data?.id ?? json.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 500) throw Object.assign(new Error('atlas image 未返回任务 id'), { status: 502 });
  return { providerTaskId: id };
}

export async function pollImage(ctx: AdapterContext, channel: ChannelView, providerTaskId: string): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed'; imageUrls?: string[] }> {
  const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
  const res = await ctx.fetchImpl(`${base}/api/v1/model/prediction/${encodeURIComponent(providerTaskId)}`, {
    headers: { authorization: `Bearer ${ctx.secret}` },
    signal: ctx.signal,
  });
  if (!res.ok) throw Object.assign(new Error(`atlas image poll failed: ${res.status}`), { status: res.status });
  const json = (await res.json()) as { data?: { status?: string; outputs?: unknown }; status?: string; outputs?: unknown };
  const data = json.data ?? json;
  if (data.status === 'completed') {
    const imageUrls = Array.isArray(data.outputs) ? data.outputs.filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 8000) : [];
    if (imageUrls.length === 0) return { status: 'failed' };
    return { status: 'succeeded', imageUrls };
  }
  if (data.status === 'failed') return { status: 'failed' };
  if (data.status === 'processing') return { status: 'processing' };
  if (data.status === 'created' || data.status === 'queued') return { status: 'queued' };
  throw new Error('Unknown image provider status');
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
