import { renderVideo } from '@wb/media';
import type { ObjectStore } from '@wb/media';
import type { Services, GenerationLocator } from '@wb/server';

export function createPublishVideoActivity(services: Services, store: ObjectStore, fontFile: string) {
  return async (input: GenerationLocator & { sourceUrl: string }) => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { jobId: job.id, status: 'terminal' as const };
    const submission = await services.providerSubmissions.get(input);
    if (submission?.status !== 'submitted') throw new Error('Provider receipt required before media processing');
    const media = await renderVideo(input.sourceUrl, job, fontFile);
    const objectKey = `jobs/${job.id}/${media.sha256}.mp4`;
    await store.put(objectKey, media.bytes, media.sha256);
    const published = await services.assets.publish({ userId: input.userId, jobId: job.id, objectKey,
      sha256: media.sha256, byteLength: media.bytes.length, width: media.width, height: media.height, durationMs: media.durationMs });
    if (published.objectKey !== objectKey) await store.remove(objectKey);
    return { jobId: job.id, status: 'published' as const, assetId: published.id };
  };
}
