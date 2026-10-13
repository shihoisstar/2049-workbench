import { condition, continueAsNew, defineQuery, defineSignal, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type { RealScriptActivities, ScriptActivities, ScriptInput } from './workflow-types';
import type { PortraitActivities, VideoInput, NativeMediaActivities } from './workflow-types';
import type {
  CandidateImageActivities, CandidateImageInput, ExportActivities, ExportInput, MediaActivities, ShotVideoActivities,
  ShotVideoInput, VideoActivities, VideoWorkflowInput,
} from './workflow-types';

export const resumeVideoGeneration = defineSignal('resumeVideoGeneration');
export const resumeRolePortrait = defineSignal('resumeRolePortrait');
export async function rolePortraitWorkflow(input: VideoInput): Promise<void> {
  const activity = proxyActivities<PortraitActivities>({ startToCloseTimeout: '10 minutes', retry: { maximumAttempts: 3 } });
  let resume = false; setHandler(resumeRolePortrait, () => { resume = true; });
  for (let checks = 0; checks < 120; checks++) {
    resume = false;
    let result: 'terminal' | 'pending' | 'review_required' = 'review_required';
    try { result = await activity.advancePortrait(input); } catch { /* Unknown submission must remain held for review. */ }
    if (result === 'terminal') return;
    await condition(() => resume, result === 'pending' ? '10 seconds' : '5 minutes');
  }
  return continueAsNew<typeof rolePortraitWorkflow>(input);
}
export const resumeDramaScript = defineSignal('resumeDramaScript');
export async function dramaScriptWorkflow(input: ScriptInput): Promise<void> {
  if (input.provider === 'atlas') {
    const activity = proxyActivities<RealScriptActivities>({ startToCloseTimeout: '2 minutes', retry: { maximumAttempts: 3 } });
    let resume = false;
    setHandler(resumeDramaScript, () => { resume = true; });
    for (let checks = 0; checks < 24; checks++) {
      resume = false;
      try { if (await activity.generateRealScript(input) === 'terminal') return; }
      catch { /* Keep uncertain submission pending; never route it to the mock failure handler. */ }
      await condition(() => resume, '5 minutes');
    }
    // Bound history while keeping the same job and its non-reclaimable submission.
    return continueAsNew<typeof dramaScriptWorkflow>(input);
  }
  // Existing mock histories retain their original activity names and timeout.
  const activity = proxyActivities<ScriptActivities>({ startToCloseTimeout: '30 seconds', retry: { maximumAttempts: 3 } });
  try { await activity.generateMockScript(input); }
  catch { await activity.failScriptJob(input); }
}
export const videoGenerationStatus = defineQuery<{ jobId: string; stage: string }>('videoGenerationStatus');
export const resumeMarketingCopy = defineSignal('resumeMarketingCopy');
export async function marketingCopyWorkflow(input: { userId: string; jobId: string }): Promise<void> {
  const activity = proxyActivities<import('./workflow-types').CopyActivities>({ startToCloseTimeout: '2 minutes', retry: { maximumAttempts: 3 } });
  let resume = false; setHandler(resumeMarketingCopy, () => { resume = true; });
  for (let checks = 0; checks < 24; checks++) {
    resume = false;
    try { if (await activity.generateMarketingCopy(input) === 'terminal') return; } catch { /* Known receipts and uncertain submissions remain recoverable. */ }
    await condition(() => resume, '5 minutes');
  }
  return continueAsNew<typeof marketingCopyWorkflow>(input);
}

/** Durable control flow only. Database/provider IO is confined to activities. */
export const resumeCandidateImage = defineSignal('resumeCandidateImage');
export const candidateImageStatus = defineQuery<{ jobId: string; stage: string }>('candidateImageStatus');

export const resumeShotVideo = defineSignal('resumeShotVideo');
export const shotVideoStatus = defineQuery<{ jobId: string; stage: string }>('shotVideoStatus');

export const resumeDramaExport = defineSignal('resumeDramaExport');

export async function shotVideoWorkflow(input: ShotVideoInput): Promise<void> {
  const activities = proxyActivities<ShotVideoActivities>({
    startToCloseTimeout: '45 seconds', retry: { maximumAttempts: 3, initialInterval: '2 seconds', maximumInterval: '10 seconds' },
  });
  let stage = 'submitting';
  let resume = false;
  setHandler(resumeShotVideo, () => { resume = true; });
  setHandler(shotVideoStatus, () => ({ jobId: input.jobId, stage }));
  for (;;) {
    const submission = await activities.submitShotVideo(input);
    if ('status' in submission && submission.status === 'terminal') { stage = 'finished'; return; }
    if (submission.status === 'unknown' || submission.status === 'rejected') {
      stage = 'review_required';
      await condition(() => resume);
      resume = false;
      continue;
    }
    break;
  }
  for (;;) {
    stage = 'publishing';
    try {
      const result = await activities.publishShotVideo(input);
      if (result.status === 'published' || result.status === 'terminal') { stage = 'finished'; return; }
    } catch {
      await activities.failShotVideo(input);
      stage = 'finished';
      return;
    }
    stage = 'awaiting_receipt';
    await condition(() => resume);
    resume = false;
  }
}

export async function dramaExportWorkflow(input: ExportInput): Promise<void> {
  setHandler(resumeDramaExport, () => undefined);
  const media = proxyActivities<ExportActivities>({ taskQueue: input.mediaTaskQueue, startToCloseTimeout: '7 minutes',
    retry: { maximumAttempts: 3, initialInterval: '5 seconds' } });
  await media.composeDramaExport(input);
}

export async function candidateImageWorkflow(input: CandidateImageInput): Promise<void> {
  const activities = proxyActivities<CandidateImageActivities>({
    startToCloseTimeout: '45 seconds', retry: { maximumAttempts: 3, initialInterval: '2 seconds', maximumInterval: '10 seconds' },
  });
  let stage = 'submitting';
  let resume = false;
  setHandler(resumeCandidateImage, () => { resume = true; });
  setHandler(candidateImageStatus, () => ({ jobId: input.jobId, stage }));
  for (;;) {
    const submission = await activities.submitCandidateImage(input);
    if ('status' in submission && submission.status === 'terminal') { stage = 'finished'; return; }
    if (submission.status === 'unknown' || submission.status === 'rejected') {
      stage = 'review_required';
      await condition(() => resume);
      resume = false;
      continue;
    }
    break;
  }
  for (;;) {
    stage = 'publishing';
    try {
      const result = await activities.publishCandidateImage(input);
      if (result.status === 'published' || result.status === 'terminal') { stage = 'finished'; return; }
    } catch {
      await activities.failCandidateImage(input);
      stage = 'finished';
      return;
    }
    stage = 'awaiting_receipt';
    await condition(() => resume);
    resume = false;
  }
}

export async function videoGenerationWorkflow(input: VideoWorkflowInput): Promise<void> {
  if (input.nativeMarketing) return nativeMarketingWorkflow(input);
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

async function nativeMarketingWorkflow(input: VideoWorkflowInput): Promise<void> {
  const activity = proxyActivities<VideoActivities>({ startToCloseTimeout: '45 seconds', retry: { maximumAttempts: 3 } });
  const media = proxyActivities<NativeMediaActivities>({ taskQueue: input.mediaTaskQueue, startToCloseTimeout: '7 minutes', retry: { maximumAttempts: 3, initialInterval: '5 seconds' } });
  let resume = false; let stage = 'submitting'; let sourceUrl: string | undefined;
  setHandler(resumeVideoGeneration, () => { resume = true; }); setHandler(videoGenerationStatus, () => ({ jobId: input.jobId, stage }));
  for (let checks = 0; checks < 120; checks++) {
    resume = false;
    try {
      if (!input.mediaTaskQueue) { stage = 'awaiting_media'; await condition(() => resume, '5 minutes'); continue; }
      stage = 'processing_media'; const outcome = await media.processNativeMarketing({ jobId: input.jobId, userId: input.userId, ...(sourceUrl ? { sourceUrl } : {}) });
      if (outcome.status === 'terminal' || outcome.status === 'published') return;
      if (outcome.status === 'source_required') {
        const submission = await activity.submitVideo(input);
        if (submission.status === 'terminal' || submission.status === 'rejected') return;
        if (submission.status !== 'submitted') { stage = 'awaiting_receipt'; await condition(() => resume, '5 minutes'); continue; }
        stage = 'polling'; const result = await activity.pollVideo(input);
        if (result.status === 'terminal' || result.status === 'failed') return;
        if (result.status === 'ready_for_media') sourceUrl = result.sourceUrl;
        else if (result.status === 'awaiting_receipt') { stage = 'awaiting_receipt'; await condition(() => resume, '5 minutes'); }
        else await condition(() => resume, '5 seconds');
      } else { stage = 'review_subtitles'; await condition(() => resume, '5 minutes'); }
    } catch { stage = 'review_required'; await condition(() => resume, '5 minutes'); }
  }
  return continueAsNew<typeof videoGenerationWorkflow>(input);
}
