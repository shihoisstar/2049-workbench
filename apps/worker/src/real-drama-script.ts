import { ChatResponseError } from '@wb/model-gateway';
import { scriptProviderBinding, seriesScriptProviderBinding, buildScriptRequest } from '@wb/server';
import { createTextGateway, persistKnownTextResult as persistKnownResult } from './text-gateway';
import type { TextGenerationReceiptValue } from '@wb/contracts';
import type { ScriptJobLocator, Services } from '@wb/server';

export function createRealScriptActivity(services: Pick<Services, 'dramaScripts'> & Partial<Pick<Services, 'scriptBatches'>>, config: { secret: string; model: string; baseUrl: string } | null, fetchImpl?: typeof fetch) {
  const binding = config ? scriptProviderBinding(config) : null;
  const gateway = createTextGateway(config, 'drama-script', fetchImpl);
  return async (input: ScriptJobLocator): Promise<'terminal' | 'review_required'> => {
    const job = await services.dramaScripts.get(input);
    if (job.provider !== 'atlas') throw new Error('Real script activity requires an Atlas job');
    if (job.status !== 'accepted') { await services.scriptBatches?.advance(input); return 'terminal'; }
    const saved = await services.dramaScripts.response(input);
    if (saved) {
      await services.dramaScripts.receive({ ...input, response: saved });
      return 'terminal';
    }
    if (!binding || !gateway) return 'review_required';
    const snapshot = await services.dramaScripts.snapshot(input);
    const currentBinding = snapshot.episodeNumber === undefined ? binding : seriesScriptProviderBinding(config!);
    const request = buildScriptRequest(snapshot, currentBinding);
    const claim = await services.dramaScripts.beginSubmission({ ...input, binding: currentBinding, request });
    if (!claim.claimed) {
      // A concurrently completed response will be finalized on the next backend check.
      const response = await services.dramaScripts.response(input);
      if (response) { await services.dramaScripts.receive({ ...input, response }); return 'terminal'; }
      return (await services.dramaScripts.get(input)).status === 'accepted' ? 'review_required' : 'terminal';
    }
    const token = { ...input, token: claim.token };
    let response: TextGenerationReceiptValue;
    try {
      response = (await gateway.chat(claim.submission.request)).receipt;
    } catch (error) {
      if (error instanceof ChatResponseError) response = error.receipt;
      else {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        if (typeof status === 'number' && [400, 401, 403, 404, 422, 429].includes(status)) {
          await persistKnownResult(() => services.dramaScripts.rejectSubmission(token));
          return 'terminal';
        }
        await persistKnownResult(() => services.dramaScripts.submissionUnknown(token));
        return 'review_required';
      }
    }
    // Persistence errors must not be classified as a provider rejection or trigger a second POST.
    await persistKnownResult(() => services.dramaScripts.recordResponse({ ...token, response }));
    await services.dramaScripts.receive({ ...input, response });
    return 'terminal';
  };
}
