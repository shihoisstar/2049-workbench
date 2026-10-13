import { createHash } from 'node:crypto';
import { composeDramaExport, readNativeVideo } from '@wb/media';
import type { NativeRecognition, ObjectStore } from '@wb/media';
import type { GenerationLocator, GenerationJob, Services } from '@wb/server';
export function createNativeMarketingActivity(services: Services, store: ObjectStore, fontFile: string, options: {
  transcribe: (source: Buffer, durationMs: number) => Promise<NativeRecognition>;
  mockSource?: (job: GenerationJob) => Promise<Buffer>;
}) {
  return async (input: GenerationLocator & { sourceUrl?: string }) => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { jobId: job.id, status: 'terminal' as const };
    if (job.durationSec !== 10 || !job.nativeQuoteVersion) throw new Error('Native marketing job required');
    let media = await services.nativeMedia.get(input);
    if (!media) {
      const receipt = await services.providerSubmissions.get(input); if (receipt?.status !== 'submitted') return { jobId: job.id, status: 'source_required' as const };
      if (!input.sourceUrl) return { jobId: job.id, status: 'source_required' as const };
      let source: Buffer | string = input.sourceUrl;
      if (job.provider === 'mock') { if (!options.mockSource) throw new Error('Mock source not configured'); source = await options.mockSource(job); }
      const video = await readNativeVideo(source); const objectKey = `native-marketing-source/${job.id}/${video.sha256}.mp4`;
      await store.put(objectKey, video.bytes, video.sha256);
      media = await services.nativeMedia.capture({ ...input, objectKey, sha256: video.sha256, byteLength: video.bytes.length, width: video.width, height: video.height, durationMs: video.durationMs });
    }
    if (Date.parse(media.expiresAt) <= Date.now()) throw new Error('Native source expired');
    if (media.state === 'review') return { jobId: job.id, status: 'review_required' as const };
    try {
      const source = await store.read(media.objectKey); if (createHash('sha256').update(source).digest('hex') !== media.sha256) throw new Error('Native source hash mismatch');
      if (media.state === 'transcribing') {
        const result = await options.transcribe(source, media.durationMs); if (result.sourceSha256 !== media.sha256) throw new Error('Recognition belongs to different source');
        await services.nativeMedia.recognize({ ...input, sourceSha256: media.sha256, transcript: result.transcript, cues: result.cues });
        return { jobId: job.id, status: 'review_required' as const };
      }
      const output = await composeDramaExport([{ bytes: source, sha256: media.sha256, subtitle: '', captions: media.cues }], fontFile); const objectKey = `jobs/${job.id}/${output.sha256}.mp4`;
      await store.put(objectKey, output.bytes, output.sha256);
      const asset = await services.nativeMedia.publish({ ...input, objectKey, sha256: output.sha256, byteLength: output.bytes.length, width: output.width, height: output.height, durationMs: output.durationMs, sourceSha256: media.sha256, revision: media.revision });
      if (asset.objectKey !== objectKey) await store.remove(objectKey);
      return { jobId: job.id, status: 'published' as const, assetId: asset.id };
    } catch (error) {
      await services.nativeMedia.issue({ ...input, issue: media.state === 'transcribing' ? 'transcription_failed' : 'render_failed' }); throw error;
    }
  };
}
