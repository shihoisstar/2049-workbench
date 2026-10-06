import type { createVideoPollingActivity, createVideoSubmissionActivity } from './video-submission';

export interface VideoActivities {
  submitVideo: ReturnType<typeof createVideoSubmissionActivity>;
  pollVideo: ReturnType<typeof createVideoPollingActivity>;
  failMedia(input: VideoInput): Promise<void>;
}
export type VideoInput = Parameters<VideoActivities['submitVideo']>[0];
export type VideoWorkflowInput = VideoInput & { mediaTaskQueue?: string };
export interface MediaActivities { publishVideo(input: VideoInput & { sourceUrl: string }): Promise<{ jobId: string; status: 'published' | 'terminal'; assetId?: string }> }
export const VIDEO_WORKFLOW = 'videoGenerationWorkflow';
