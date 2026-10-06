import { condition, defineQuery, defineSignal, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type { MediaActivities, VideoActivities, VideoWorkflowInput } from './workflow-types';

export const resumeVideoGeneration = defineSignal('resumeVideoGeneration');
export const videoGenerationStatus = defineQuery<{ jobId: string; stage: string }>('videoGenerationStatus');

/** Durable control flow only. Database/provider IO is confined to activities. */
export async function videoGenerationWorkflow(input: VideoWorkflowInput): Promise<void> {
  const activities = proxyActivities<VideoActivities>({
    startToCloseTimeout: '45 seconds',
    retry: { maximumAttempts: 3, initialInterval: '2 seconds', maximumInterval: '10 seconds' },
  });
  let stage = 'submitting';
  let resume = false;
  setHandler(resumeVideoGeneration, () => { resume = true; });
  setHandler(videoGenerationStatus, () => ({ jobId: input.jobId, stage }));
  async function waitForReview(nextStage: string) {
    stage = nextStage;
    await condition(() => resume);
    resume = false;
  }
  for (;;) {
    try {
      const result = await activities.submitVideo(input);
      if (result.status === 'terminal' || result.status === 'rejected') { stage = 'finished'; return; }
      break;
    } catch { await waitForReview('review_required'); }
  }
  let pendingPolls = 0;
  for (;;) {
    stage = 'polling';
    try {
      const result = await activities.pollVideo(input);
      if (result.status === 'terminal' || result.status === 'failed') { stage = 'finished'; return; }
      if (result.status === 'awaiting_receipt') await waitForReview('awaiting_receipt');
      else if (result.status === 'ready_for_media') {
        if (!input.mediaTaskQueue) await waitForReview('awaiting_media');
        else {
          stage = 'processing_media';
          const media = proxyActivities<MediaActivities>({ taskQueue: input.mediaTaskQueue, startToCloseTimeout: '7 minutes',
            retry: { maximumAttempts: 3, initialInterval: '5 seconds' } });
          try { await media.publishVideo({ jobId: input.jobId, userId: input.userId, sourceUrl: result.sourceUrl }); }
          catch { await activities.failMedia({ jobId: input.jobId, userId: input.userId }); }
          stage = 'finished';
          return;
        }
      }
      else if (++pendingPolls >= 180) {
        await waitForReview('review_required');
        pendingPolls = 0;
      } else await sleep('5 seconds');
    } catch { await waitForReview('review_required'); }
  }
}
