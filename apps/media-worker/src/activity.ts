import { createHash } from 'node:crypto';
import { composeDramaExport, renderVideo } from '@wb/media';
import type { ObjectStore } from '@wb/media';
import type { DramaExportJobLocator, Services, GenerationLocator } from '@wb/server';

export function createComposeDramaExportActivity(services: Pick<Services, 'dramaExports' | 'dramaExportAssets'>, store: ObjectStore, fontFile: string) {
  return async (input: DramaExportJobLocator) => {
    const job = await services.dramaExports.get(input);
    if (job.status !== 'accepted') return { jobId: job.id, status: 'terminal' as const };
    const version = await services.dramaExports.getVersion(input);
    try {
      const sources = await Promise.all(version.manifest.shots.map(async shot => {
        const bytes = await store.read(shot.objectKey);
        if (createHash('sha256').update(bytes).digest('hex') !== shot.sha256) throw new Error('Export source hash mismatch');
        return { bytes, sha256: shot.sha256, subtitle: 'spokenLines' in shot ? shot.spokenLines.map(line => line.text).join('\n') : `第${shot.sceneNumber}场` };
      }));
      const media = await composeDramaExport(sources, fontFile);
      const objectKey = `drama-export-jobs/${job.id}/${media.sha256}.mp4`;
      await store.put(objectKey, media.bytes, media.sha256);
      const published = await services.dramaExportAssets.publish({ ...input, objectKey, sha256: media.sha256,
        byteLength: media.bytes.length, width: media.width, height: media.height, durationMs: media.durationMs });
      if (published.objectKey !== objectKey) await store.remove(objectKey);
      return { jobId: job.id, status: 'published' as const, assetId: published.id };
    } catch (error) {
      await services.dramaExports.fail({ ...input, failureCode: 'EXPORT_COMPOSITION_FAILED' });
      console.error(JSON.stringify({ event: 'drama_export_composition_failed', jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown export composition error' }));
      return { jobId: job.id, status: 'terminal' as const };
    }
  };
}

export function createPublishVideoActivity(services: Services, store: ObjectStore, fontFile: string) {
  return async (input: GenerationLocator & { sourceUrl: string }) => {
    const job = await services.generation.get(input);
    if (job.status !== 'accepted') return { jobId: job.id, status: 'terminal' as const };
    if (job.durationSec !== 5) throw new Error('Native marketing subtitle publication is not enabled');
    const submission = await services.providerSubmissions.get(input);
    if (submission?.status !== 'submitted') throw new Error('Provider receipt required before media processing');
    const captionText = job.category ? /口播[：:]([^\n]*)/.exec(job.prompt)?.[1]?.trim() : undefined;
    const media = await renderVideo(input.sourceUrl, { ...job, durationSec: 5, captionText }, fontFile);
    const objectKey = `jobs/${job.id}/${media.sha256}.mp4`;
    await store.put(objectKey, media.bytes, media.sha256);
    const published = await services.assets.publish({ userId: input.userId, jobId: job.id, objectKey,
      sha256: media.sha256, byteLength: media.bytes.length, width: media.width, height: media.height, durationMs: media.durationMs });
    if (published.objectKey !== objectKey) await store.remove(objectKey);
    return { jobId: job.id, status: 'published' as const, assetId: published.id };
  };
}
