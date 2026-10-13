import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { atlasImageAdapter } from '@wb/model-gateway';
import type { ChannelView } from '@wb/model-gateway';
import { readPortraitImage } from '@wb/media';
import type { ObjectStore } from '@wb/media';
import { DomainError, portraitBinding } from '@wb/server';
import type { DramaImageJobLocator, Services } from '@wb/server';
import { MOCK_PNG } from './candidate-image';

export interface PortraitProviderConfig { mode: 'mock' | 'atlas'; baseUrl: string; secret: string }
export function createPortraitActivity(options: { services: Pick<Services, 'dramaImages' | 'dramaImageSubmissions' | 'dramaImageAssets'>;
  config: PortraitProviderConfig | null; objectStore?: ObjectStore; fetchImpl?: typeof fetch; readImage?: typeof readPortraitImage }) {
  const { services, config, objectStore } = options;
  const binding = config ? portraitBinding(config.mode, config.baseUrl) : null;
  const channel: ChannelView | null = config && binding ? { id: 1, name: 'role-portrait', providerName: binding.provider, baseUrl: config.baseUrl,
    secretRef: 'portrait', status: 'active', health: 'ok', weight: 1, rpmLimit: null, config: { modelImageT2i: binding.model } } : null;
  return async (input: DramaImageJobLocator): Promise<'terminal' | 'pending' | 'review_required'> => {
    const job = await services.dramaImages.get(input);
    if (job.target !== 'portrait' || !job.portrait) throw new Error('Portrait target required');
    if (job.status !== 'accepted') return 'terminal';
    if (!config || !binding || !channel || !objectStore || binding.providerKey !== job.portrait.binding.providerKey) return 'review_required';
    const claim = await services.dramaImageSubmissions.begin({ ...input, providerKey: binding.providerKey });
    let submission = claim.submission;
    if (claim.claimed) {
      const token = { ...input, token: claim.token };
      let id: string;
      try {
        id = config.mode === 'mock' ? `mock-portrait:${job.id}` : (await atlasImageAdapter.submitImage({ secret: config.secret, fetchImpl: options.fetchImpl ?? fetch,
          timeoutMs: 30000, signal: AbortSignal.timeout(30000) }, channel, { modelName: binding.model, prompt: job.portrait.prompt,
          aspectRatio: job.portrait.aspectRatio, resolution: job.portrait.resolution, outputFormat: job.portrait.outputFormat })).providerTaskId;
      } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        if (typeof status === 'number' && [400, 401, 403, 404, 422, 429].includes(status)) {
          await services.dramaImageSubmissions.reject(token); return 'terminal';
        }
        await services.dramaImageSubmissions.unknown(token); return 'review_required';
      }
      // Only retry persistence of the known provider ID, never the billable POST.
      for (let attempt = 0; ; attempt++) {
        try { submission = await services.dramaImageSubmissions.accepted({ ...token, providerTaskId: id }); break; }
        catch (error) { if (attempt === 2 || error instanceof DomainError && error.statusCode < 500) throw error; await delay(1000); }
      }
    }
    if (submission.status !== 'submitted' || !submission.providerTaskId) return 'review_required';
    let source: string | null = null;
    if (config.mode === 'atlas') {
      let output;
      try { output = await atlasImageAdapter.pollImage({ secret: config.secret, fetchImpl: options.fetchImpl ?? fetch, timeoutMs: 30000, signal: AbortSignal.timeout(30000) }, channel, submission.providerTaskId); }
      catch { return 'pending'; }
      if (output.status === 'failed') { await services.dramaImages.fail({ ...input, failureCode: 'PORTRAIT_PROVIDER_FAILED' }); return 'terminal'; }
      if (output.status !== 'succeeded') return 'pending';
      source = output.imageUrls![0];
    }
    // Publication retries are safe: the provider has already returned a final output.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const image = source ? await (options.readImage ?? readPortraitImage)(source) : { bytes: MOCK_PNG, sha256: createHash('sha256').update(MOCK_PNG).digest('hex'), width: 16, height: 16 };
        if (source && (image.width < 256 || image.height < 256 || Math.abs(image.width / image.height - 3 / 4) > 0.03)) throw new Error('Portrait aspect ratio mismatch');
        const objectKey = `drama-image-jobs/${job.id}/${image.sha256}.png`;
        await objectStore.put(objectKey, image.bytes, image.sha256, 'image/png');
        await objectStore.put(`materials/${input.userId}/generated/${job.id}/${image.sha256}.png`, image.bytes, image.sha256, 'image/png');
        await services.dramaImageAssets.publish({ ...input, objectKey, sha256: image.sha256, byteLength: image.bytes.length, width: image.width, height: image.height });
        return 'terminal';
      } catch (error) {
        if ((await services.dramaImages.get(input)).status !== 'accepted') return 'terminal';
        if (attempt === 2) { await services.dramaImages.fail({ ...input, failureCode: 'PORTRAIT_PUBLISH_FAILED' }); return 'terminal'; }
        if (error instanceof DomainError && error.statusCode < 500) throw error;
        await delay(1000);
      }
    }
    return 'review_required';
  };
}
