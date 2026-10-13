import type { createCandidateImageFailActivity, createCandidateImagePublishingActivity, createCandidateImageSubmissionActivity } from './candidate-image';
import type { createShotVideoFailActivity, createShotVideoPublishingActivity, createShotVideoSubmissionActivity } from './shot-video';
import type { createVideoPollingActivity, createVideoSubmissionActivity } from './video-submission';

export interface VideoActivities {
  submitVideo: ReturnType<typeof createVideoSubmissionActivity>;
  pollVideo: ReturnType<typeof createVideoPollingActivity>;
  failMedia(input: VideoInput): Promise<void>;
}
export type VideoInput = Parameters<VideoActivities['submitVideo']>[0];
export type VideoWorkflowInput = VideoInput & { mediaTaskQueue?: string; nativeMarketing?: true };
export interface NativeMediaActivities { processNativeMarketing(input: VideoInput & { sourceUrl?: string }): Promise<{ jobId: string; status: 'source_required' | 'review_required' | 'published' | 'terminal'; assetId?: string }> }
export interface MediaActivities { publishVideo(input: VideoInput & { sourceUrl: string }): Promise<{ jobId: string; status: 'published' | 'terminal'; assetId?: string }> }
export interface CandidateImageActivities {
  submitCandidateImage: ReturnType<typeof createCandidateImageSubmissionActivity>;
  publishCandidateImage: ReturnType<typeof createCandidateImagePublishingActivity>;
  failCandidateImage: ReturnType<typeof createCandidateImageFailActivity>;
}
export type CandidateImageInput = Parameters<CandidateImageActivities['submitCandidateImage']>[0];
export const VIDEO_WORKFLOW = 'videoGenerationWorkflow';
export const CANDIDATE_IMAGE_WORKFLOW = 'candidateImageWorkflow';
export const PORTRAIT_WORKFLOW = 'rolePortraitWorkflow';
export interface PortraitActivities { advancePortrait(input: VideoInput): Promise<'terminal' | 'pending' | 'review_required'> }
export interface ShotVideoActivities {
  submitShotVideo: ReturnType<typeof createShotVideoSubmissionActivity>;
  publishShotVideo: ReturnType<typeof createShotVideoPublishingActivity>;
  failShotVideo: ReturnType<typeof createShotVideoFailActivity>;
}
export type ShotVideoInput = Parameters<ShotVideoActivities['submitShotVideo']>[0];
export const SHOT_VIDEO_WORKFLOW = 'shotVideoWorkflow';

export interface ExportActivities {
  composeDramaExport(input: ExportInput): Promise<{ jobId: string; status: 'published' | 'terminal'; assetId?: string }>;
}
export interface ExportInput { jobId: string; userId: string; mediaTaskQueue: string }
export const EXPORT_WORKFLOW = 'dramaExportWorkflow';
export interface ScriptInput { userId: string; jobId: string; provider?: 'atlas' }
export interface ScriptActivities { generateMockScript(input: ScriptInput): Promise<void>; failScriptJob(input: ScriptInput): Promise<void> }
export interface RealScriptActivities { generateRealScript(input: ScriptInput): Promise<'terminal' | 'review_required'> }
export const SCRIPT_WORKFLOW = 'dramaScriptWorkflow';
export const MARKETING_COPY_WORKFLOW = 'marketingCopyWorkflow';
export interface CopyActivities { generateMarketingCopy(input: VideoInput): Promise<'terminal' | 'review_required'> }
