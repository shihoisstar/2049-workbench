import { createHash } from 'node:crypto';
import { ErrorCode } from '@wb/contracts';
import { GatewayError } from '@wb/model-gateway';
import type { ChannelView, GatewayRouter } from '@wb/model-gateway';
import type { ObjectStore } from '@wb/media';
import { DomainError, marketingVideoPrompt, nativeMarketingPrompt, NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from '@wb/server';
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
  services: Pick<Services, 'generation' | 'providerSubmissions' | 'materials'>;
  gateway: Pick<GatewayRouter, 'dispatch'>;
  channel: ChannelView;
  objectStore?: ObjectStore;
  nativeBinding?: string;
}

/** One durable activity boundary. A Temporal retry must call this same function. */
export function createVideoSubmissionActivity(options: ActivityOptions) {
  const { services, gateway, channel } = options;
  const providerKey = channelKey(channel);
  return async (input: GenerationLocator): Promise<ProviderSubmission | { status: 'terminal'; jobId: string }> => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { status: 'terminal', jobId: job.id };
    if (job.durationSec === 10) {
      const mock = job.provider === 'mock' && channel.providerName === 'mock';
      const real = job.provider === 'atlas' && channel.providerName === 'atlas' && !!options.nativeBinding && job.nativeBinding === options.nativeBinding && job.model === (job.materialIds.length ? NATIVE_VIDEO_REFERENCE_MODEL : NATIVE_VIDEO_TEXT_MODEL);
      if (!mock && !real) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Native marketing provider binding unavailable');
    }
    const claim = await services.providerSubmissions.begin({ ...input, providerKey });
    if (!claim.claimed) return claim.submission;
    const token = { ...input, token: claim.token };
    let imageUrls: string[] = [];
    try {
      const materials = await services.materials.listForJob(input);
      if (materials.length) {
        const store = options.objectStore;
        if (!store) throw new Error('Object store unavailable for material submission');
        imageUrls = await Promise.all(materials.map(async material => {
          if (job.nativeBinding) {
            if (Date.parse(material.expiresAt) <= Date.now()) throw new DomainError(410, ErrorCode.MATERIAL_EXPIRED, 'Reference expired before submission');
            const bytes = await store.read(material.objectKey);
            if (bytes.length !== material.byteLength || bytes.length > 10 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== material.sha256) throw new Error('Reference bytes do not match the approved material');
            return `data:${material.contentType};base64,${bytes.toString('base64')}`;
          }
          // 供应商拉取窗口 = min(24h, 素材剩余有效期);不足5分钟说明素材已近过期,转人工处置而非让供应商拉到死链。
          const expiresIn = Math.min(86400, Math.floor((Date.parse(material.expiresAt) - Date.now()) / 1000));
          if (expiresIn < 300) throw new DomainError(410, ErrorCode.MATERIAL_EXPIRED, 'Material expired before provider submission');
          return store.access(material.objectKey, expiresIn, material.contentType);
        }));
      }
    } catch (error) {
      // Native inline preparation happens entirely before the paid POST.
      if (job.nativeBinding) return services.providerSubmissions.reject(token);
      // 提交前失败(素材过期/签名不可用):置 unknown 进入人工处置队列,由运营决定补登或退款。
      await services.providerSubmissions.unknown(token);
      throw error;
    }
    try {
      // Pinning bypasses gateway failover. The durable claim also prevents caller retries.
      const result = await gateway.dispatch({ modelName: job.model, modelType: 'video',
        ...(job.nativeBinding ? { timeoutMs: 30000 } : {}),
        taskOperation: 'submit', channelId: channel.id,
        payload: { prompt: job.durationSec === 10 ? nativeMarketingPrompt(job) : marketingVideoPrompt(job), resolution: job.resolution, aspectRatio: job.aspectRatio, durationSec: job.durationSec,
          ...(job.durationSec === 10 ? { generateAudio: true, bitrateMode: 'high' } : {}),
          ...(imageUrls.length ? { imageUrls } : {}) },
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
export function createVideoPollingActivity({ services, gateway, channel, nativeBinding }: ActivityOptions) {
  const providerKey = channelKey(channel);
  return async (input: GenerationLocator) => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { status: 'terminal' as const, jobId: job.id };
    if (job.nativeBinding && job.nativeBinding !== nativeBinding) throw new Error('Native provider configuration changed');
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
