import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openAiCompatibleChatAdapter, ChatResponseError } from './chat';
import { createGatewayRouter } from './router';
import type { AdapterContext, ChannelView } from './types';

const channel: ChannelView = { id: 1, providerName: 'mock', name: 'mock', baseUrl: 'https://mock.invalid', secretRef: 'mock', weight: 1, rpmLimit: null, status: 'active', health: 'ok', config: {} };
function context(reason: string | null, captured: Record<string, unknown>[]): AdapterContext {
  return { secret: 'mock-only', timeoutMs: 1000, fetchImpl: async (_url, options) => {
    captured.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: '完整剧本正文' }, ...(reason ? { finish_reason: reason } : {}) }] }));
  } };
}
test('legacy chat request leaves provider thinking mode unchanged', async () => {
  const bodies: Record<string, unknown>[] = [];
  await openAiCompatibleChatAdapter.chat(context('length', bodies), channel, { modelName: 'mock', user: '输入' });
  assert.equal('thinking' in bodies[0], false);
});
test('script request disables thinking and accepts an explicitly complete response', async () => {
  const bodies: Record<string, unknown>[] = [];
  const result = await openAiCompatibleChatAdapter.chat(context('stop', bodies), channel, { modelName: 'mock', user: '输入', disableThinking: true, requireComplete: true });
  assert.deepEqual(bodies[0].thinking, { type: 'disabled' }); assert.equal(result.text, '完整剧本正文');
});
for (const reason of ['length', null]) {
  test(`script request rejects incomplete or unproven completion (${reason}) without retry permission`, async () => {
    await assert.rejects(openAiCompatibleChatAdapter.chat(context(reason, []), channel, { modelName: 'mock', user: '输入', requireComplete: true }),
      error => error instanceof Error && 'code' in error && error.code === 'CHAT_OUTPUT_INCOMPLETE' && 'retryable' in error && error.retryable === false);
  });
}

test('rejected completed HTTP response preserves token usage and bounded output', async () => {
  const ctx: AdapterContext = { secret: 'mock-only', timeoutMs: 1000, fetchImpl: async () => new Response(JSON.stringify({
    id: 'provider-response-1', usage: { prompt_tokens: 195, completion_tokens: 2000, completion_tokens_details: { reasoning_tokens: 2000 } },
    choices: [{ message: { content: '' }, finish_reason: 'length' }],
  })) };
  await assert.rejects(openAiCompatibleChatAdapter.chat(ctx, channel, { modelName: 'mock', user: '输入', requireComplete: true }), error => {
    assert.ok(error instanceof ChatResponseError);
    assert.equal(error.receipt.responseId, 'provider-response-1');
    assert.deepEqual(error.receipt.usage, { inputTokens: 195, outputTokens: 2000, cachedInputTokens: null, reasoningTokens: 2000 });
    assert.equal(error.retryable, false); return true;
  });
});

test('receipt does not invent zero usage and bounds large provider output', async () => {
  const ctx: AdapterContext = { secret: 'mock-only', timeoutMs: 1000, fetchImpl: async () => new Response(JSON.stringify({
    usage: { prompt_tokens: -1, completion_tokens: '2000', completion_tokens_details: { reasoning_tokens: 1.5 } },
    choices: [{ message: { content: 'x' + '😀'.repeat(32000) }, finish_reason: 'stop' }],
  })) };
  await assert.rejects(openAiCompatibleChatAdapter.chat(ctx, channel, { modelName: 'mock', user: '输入', requireComplete: true }), error => {
    assert.ok(error instanceof ChatResponseError); assert.equal(error.code, 'CHAT_OUTPUT_TOO_LONG');
    assert.ok(error.receipt.text.length <= 64000); assert.equal(error.receipt.textTruncated, true);
    assert.equal(Buffer.from(error.receipt.text, 'utf8').toString('utf8'), error.receipt.text, 'bounded receipt remains valid UTF-8 for PostgreSQL JSONB');
    assert.deepEqual(error.receipt.usage, { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null });
    return true;
  });
});

test('router forwards script controls and returns the usage receipt', async () => {
  const captured: Record<string, unknown>[] = [];
  const router = createGatewayRouter({ channels: [channel], adapters: {}, chatAdapters: { mock: openAiCompatibleChatAdapter },
    secretResolver: { resolve: async () => 'mock-only' }, fetchImpl: context('stop', captured).fetchImpl });
  const result = await router.chat({ modelName: 'mock', user: '输入', disableThinking: true, requireComplete: true });
  assert.deepEqual(captured[0].thinking, { type: 'disabled' }); assert.equal(result.receipt.finishReason, 'stop');
  assert.equal(result.receipt.usage, null);
});

for (const outcome of ['length', 'empty', 'network'] as const) {
  test(`router makes only one upstream POST for a strict script request (${outcome})`, async () => {
    let calls = 0;
    const router = createGatewayRouter({ channels: [channel], adapters: {}, chatAdapters: { mock: openAiCompatibleChatAdapter },
      secretResolver: { resolve: async () => 'mock-only' }, maxAttempts: 3, fetchImpl: async () => {
        calls++;
        if (outcome === 'network') throw new Error('Response lost after acceptance');
        return new Response(JSON.stringify({ choices: [{ message: { content: outcome === 'empty' ? '  ' : '片段' }, finish_reason: outcome === 'length' ? 'length' : 'stop' }] }));
      } });
    await assert.rejects(router.chat({ modelName: 'mock', user: '输入', requireComplete: true }));
    assert.equal(calls, 1);
  });
}

test('router respects nonretryable empty-output errors even for legacy calls', async () => {
  let calls = 0;
  const router = createGatewayRouter({ channels: [channel], adapters: {}, chatAdapters: { mock: openAiCompatibleChatAdapter },
    secretResolver: { resolve: async () => 'mock-only' }, maxAttempts: 3, fetchImpl: async () => {
      calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }));
    } });
  await assert.rejects(router.chat({ modelName: 'mock', user: '输入' }), error => error instanceof ChatResponseError && error.code === 'CHAT_OUTPUT_EMPTY');
  assert.equal(calls, 1);
});
