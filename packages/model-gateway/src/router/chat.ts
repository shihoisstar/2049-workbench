import type { AdapterContext, ChannelView } from './types';

export interface ChatRequest {
  modelName: string;
  /** system 设定(可选) */
  system?: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatAdapter {
  chat(ctx: AdapterContext, channel: ChannelView, req: ChatRequest): Promise<{ text: string; raw: unknown }>;
}

export function buildChatMessages(req: ChatRequest): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.user });
  return messages;
}

/** OpenAI 兼容 chat 适配器(Atlas 聚合等;POST {baseUrl}/chat/completions,非流式)。 */
export const openAiCompatibleChatAdapter: ChatAdapter = {
  async chat(ctx, channel, req: ChatRequest) {
    const base = channel.baseUrl ?? 'https://api.atlascloud.ai';
    const path = String(channel.config.completionPath ?? '/v1/chat/completions');
    const body = {
      // chat 渠道的模型在 config.chatModel(文本模型);勿与 config.model(视频)混用
      model: String(channel.config.chatModel ?? req.modelName),
      messages: buildChatMessages(req),
      // 推理型模型(reasoning_content)会消耗 completion 配额,默认给足避免空 content
      max_tokens: req.maxTokens ?? 2000,
      stream: false,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? ctx.timeoutMs);
    ctx.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await ctx.fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ctx.secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status >= 500) throw Object.assign(new Error(`chat 5xx: ${res.status}`), { status: res.status });
      if (res.status === 429) throw Object.assign(new Error('chat rate limited'), { status: 429 });
      if (res.status >= 400) throw Object.assign(new Error(`chat 4xx: ${res.status}`), { status: res.status });
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      if (!text) throw Object.assign(new Error('chat 空响应'), { status: 502 });
      return { text, raw: json };
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', () => controller.abort());
    }
  },
};
