import { ChatResponseError } from '@wb/model-gateway';
import { buildMarketingCopyRequest, marketingCopyBinding } from '@wb/server';
import type { CopyLocator, Services } from '@wb/server';
import type { TextGenerationReceiptValue } from '@wb/contracts';
import { createTextGateway, persistKnownTextResult } from './text-gateway';
import type { TextConfig } from './text-gateway';

export function createMarketingCopyActivity(services: Pick<Services, 'marketingCopies'>, config: TextConfig | null, fetchImpl?: typeof fetch) {
  const gateway = createTextGateway(config, 'marketing-copy', fetchImpl); const binding = config ? marketingCopyBinding(config) : null;
  return async (input: CopyLocator): Promise<'terminal' | 'review_required'> => {
    const jobs = services.marketingCopies; const job = await jobs.get(input);
    if (job.status !== 'accepted') return 'terminal';
    const saved = await jobs.response(input);
    if (saved) { await jobs.receive({ ...input, response: saved }); return 'terminal'; }
    if (job.provider === 'mock') {
      const source = await jobs.snapshot(input);
      const text = JSON.stringify({ text: `口播：${source.category === 'commerce' ? '让喜欢陪你出门。' : '把片刻留给自己。'}\n画面：围绕用户提供的${source.category === 'commerce' ? '商品' : '店铺'}资料呈现简洁画面。`, usedFacts: [source.text.slice(0, 40)] });
      await jobs.receive({ ...input, response: { provider: 'mock', model: 'marketing-copy-fixture-v1', responseId: `mock-copy:${job.id}`, finishReason: 'stop', text, textTruncated: false, usage: null } }); return 'terminal';
    }
    if (!gateway || !binding) return 'review_required';
    const claim = await jobs.begin({ ...input, binding, request: buildMarketingCopyRequest(await jobs.snapshot(input), binding) });
    if (!claim) {
      const response = await jobs.response(input);
      if (response) { await jobs.receive({ ...input, response }); return 'terminal'; }
      return (await jobs.get(input)).status === 'accepted' ? 'review_required' : 'terminal';
    }
    const token = { ...input, token: claim.token }; let response: TextGenerationReceiptValue;
    try { response = (await gateway.chat(claim.request)).receipt; }
    catch (error) {
      if (error instanceof ChatResponseError) response = error.receipt;
      else {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        if (typeof status === 'number' && [400, 401, 403, 404, 422, 429].includes(status)) { await persistKnownTextResult(() => jobs.reject(token)); return 'terminal'; }
        await persistKnownTextResult(() => jobs.unknown(token)); return 'review_required';
      }
    }
    await persistKnownTextResult(() => jobs.record({ ...token, response }));
    await jobs.receive({ ...input, response }); return 'terminal';
  };
}
