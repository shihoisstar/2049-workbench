import { createHash } from 'node:crypto';
import { GatewayError } from '@wb/model-gateway';
import type { ChannelView, GatewayRouter } from '@wb/model-gateway';
import type { GenerationLocator, ProviderSubmission, Services } from '@wb/server';

function definitelyRejected(error: unknown): boolean {
  if (error instanceof GatewayError && ['secret_missing', 'adapter_unavailable', 'invalid_request', 'no_channel_available', 'rate_limited'].includes(error.code)) return true;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return typeof status === 'number' && [400, 401, 403, 404, 422, 429].includes(status);
}

function channelKey(channel: ChannelView): string {
  return `${channel.providerName}:${channel.id}:` + createHash('sha256').update(JSON.stringify({
    baseUrl: channel.baseUrl, config: channel.config,
  })).digest('hex');
}

interface ActivityOptions {
  services: Pick<Services, 'generation' | 'providerSubmissions'>;
  gateway: Pick<GatewayRouter, 'dispatch'>;
  channel: ChannelView;
}

/** One durable activity boundary. A Temporal retry must call this same function. */
export function createVideoSubmissionActivity(options: ActivityOptions) {
  const { services, gateway, channel } = options;
  const providerKey = channelKey(channel);
  return async (input: GenerationLocator): Promise<ProviderSubmission | { status: 'terminal'; jobId: string }> => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { status: 'terminal', jobId: job.id };
    const claim = await services.providerSubmissions.begin({ ...input, providerKey });
    if (!claim.claimed) return claim.submission;
    const token = { ...input, token: claim.token };
    try {
      // Pinning bypasses gateway failover. The durable claim also prevents caller retries.
      const result = await gateway.dispatch({ modelName: job.model, modelType: 'video',
        taskOperation: 'submit', channelId: channel.id,
        payload: { prompt: job.prompt, resolution: job.resolution, aspectRatio: job.aspectRatio, durationSec: job.durationSec },
      });
      if (!result.ok || result.channelId !== channel.id || typeof result.providerTaskId !== 'string' || !result.providerTaskId.trim()) {
        return services.providerSubmissions.unknown(token);
      }
      return await services.providerSubmissions.accepted({ ...token, providerTaskId: result.providerTaskId });
    } catch (error) {
      // Timeout/connection failure/5xx/invalid receipt may follow an accepted paid request.
      // Neither the exception nor vendor body is persisted or logged here.
      if (definitelyRejected(error)) return services.providerSubmissions.reject(token);
      return services.providerSubmissions.unknown(token);
    }
  };
}

/** Read-only provider polling is retryable; never repeats the paid submission. */
export function createVideoPollingActivity({ services, gateway, channel }: ActivityOptions) {
  const providerKey = channelKey(channel);
  return async (input: GenerationLocator) => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { status: 'terminal' as const, jobId: job.id };
    const submission = await services.providerSubmissions.get(input);
    if (!submission || submission.status !== 'submitted') return { status: 'awaiting_receipt' as const, jobId: job.id };
    if (submission.providerKey !== providerKey) throw new Error('Provider configuration changed; retain the original channel configuration');
    const result = await gateway.dispatch({ modelName: job.model, modelType: 'video', taskOperation: 'poll',
      channelId: channel.id, payload: { providerTaskId: submission.providerTaskId },
    });
    const body = result.body as { status?: unknown; videoUrl?: unknown } | null;
    if (!result.ok || result.channelId !== channel.id || !body || typeof body !== 'object') throw new Error('Invalid provider polling response');
    if (body.status === 'failed') {
      await services.generation.fail({ ...input, failureCode: 'PROVIDER_FAILED' });
      return { status: 'failed' as const, jobId: job.id };
    }
    if (body.status === 'queued' || body.status === 'processing') return { status: 'pending' as const, jobId: job.id };
    if (body.status !== 'succeeded' || typeof body.videoUrl !== 'string') throw new Error('Invalid provider polling response');
    let source: URL;
    try { source = new URL(body.videoUrl); } catch { throw new Error('Invalid provider media reference'); }
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Invalid provider media reference');
    // Still private: no download, asset publication, or settlement until media validation.
    return { status: 'ready_for_media' as const, jobId: job.id, sourceUrl: source.href };
  };
}
