import { setTimeout as delay } from 'node:timers/promises';
import { createGatewayRouter, openAiCompatibleChatAdapter } from '@wb/model-gateway';
import { DomainError } from '@wb/server';

export interface TextConfig { secret: string; model: string; baseUrl: string }
export function createTextGateway(config: TextConfig | null, name: string, fetchImpl?: typeof fetch) {
  return config ? createGatewayRouter({ channels: [{ id: 1, name, providerName: 'atlas', weight: 1, rpmLimit: null, status: 'active', health: 'ok', secretRef: 'text-provider', baseUrl: config.baseUrl, config: { chatModel: config.model, completionPath: '/v1/chat/completions' } }], adapters: {}, chatAdapters: { atlas: openAiCompatibleChatAdapter }, secretResolver: { resolve: async () => config.secret }, maxAttempts: 1, fetchImpl }) : null;
}
export async function persistKnownTextResult(operation: () => Promise<unknown>) {
  for (let attempt = 0; ; attempt++) {
    try { await operation(); return; }
    catch (error) { if (attempt === 2 || error instanceof DomainError && error.statusCode < 500) throw error; await delay(1000); }
  }
}
