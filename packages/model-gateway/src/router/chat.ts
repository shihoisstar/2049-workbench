import type { AdapterContext, ChannelView } from './types';
import type { TextGenerationReceiptValue, TextGenerationUsageValue } from '@wb/contracts';

export interface ChatRequest {
  modelName: string;
  /** system 设定(可选) */
  system?: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  disableThinking?: boolean;
  requireComplete?: boolean;
}

export interface ChatAdapter {
  chat(ctx: AdapterContext, channel: ChannelView, req: ChatRequest): Promise<ChatResult>;
}

export interface ChatResult { text: string; raw: unknown; receipt: TextGenerationReceiptValue }
export class ChatResponseError extends Error {
  readonly status = 502;
  readonly retryable = false;
  constructor(readonly code: 'CHAT_OUTPUT_INCOMPLETE' | 'CHAT_OUTPUT_EMPTY' | 'CHAT_OUTPUT_TOO_LONG', readonly receipt: TextGenerationReceiptValue) {
    super(code); this.name = 'ChatResponseError';
  }
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
function usage(value: unknown): TextGenerationUsageValue | null {
  const item = record(value);
  if (!item) return null;
  return { inputTokens: count(item.prompt_tokens), outputTokens: count(item.completion_tokens),
    cachedInputTokens: count(record(item.prompt_tokens_details)?.cached_tokens), reasoningTokens: count(record(item.completion_tokens_details)?.reasoning_tokens) };
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
      ...(req.disableThinking ? { thinking: { type: 'disabled' } } : {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? ctx.timeoutMs);
    const onAbort = () => controller.abort();
    if (ctx.signal?.aborted) controller.abort();
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
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
      const raw: unknown = await res.json();
      const json = (record(raw) ?? {}) as {
        id?: unknown; usage?: unknown; choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
      };
      const choice = json.choices?.[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const boundedText = text.slice(0, 64000).replace(/[\uD800-\uDBFF]$/, '');
      const receipt: TextGenerationReceiptValue = { provider: channel.providerName, model: body.model,
        responseId: typeof json.id === 'string' ? json.id.slice(0, 200) : null,
        finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason.slice(0, 100) : null,
        text: boundedText, textTruncated: boundedText.length < text.length, usage: usage(json.usage) };
      if (req.requireComplete && receipt.finishReason !== 'stop') throw new ChatResponseError('CHAT_OUTPUT_INCOMPLETE', receipt);
      if (!text.trim()) throw new ChatResponseError('CHAT_OUTPUT_EMPTY', receipt);
      if (req.requireComplete && receipt.textTruncated) throw new ChatResponseError('CHAT_OUTPUT_TOO_LONG', receipt);
      return { text, raw, receipt };
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onAbort);
    }
  },
};
