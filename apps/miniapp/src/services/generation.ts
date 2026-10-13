import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { ScriptBatch, ScriptBatchQuote, SubmitScriptBatch, MarketingCopyInput, MarketingCopyJob, MarketingCopyQuote, SubmitMarketingCopy } from '@wb/contracts';
import type { MarketingCopyInputValue, SubmitMarketingCopyValue, SubmitScriptBatchValue } from '@wb/contracts';
import { MaterialIds } from '@wb/contracts';
import { NativeMarketingInput, NativeMarketingQuote, SubmitNativeMarketing } from '@wb/contracts';
import type { NativeMarketingInputValue, SubmitNativeMarketingValue } from '@wb/contracts';
import { NativeCaptionReview, ConfirmNativeCaptions, NativeSourceAccess } from '@wb/contracts';
import type { ConfirmNativeCaptionsValue } from '@wb/contracts';
import type { MarketingCategoryValue } from '@wb/contracts';
import { SubmitDramaScriptJob, DramaScriptJobView, ConfirmDramaScript, DramaScriptQuote, ErrorBody, ErrorCode } from '@wb/contracts';
import { ConfirmRoleAppearance, DramaPreparation, SaveDramaPreparation, MaterialAccess } from '@wb/contracts';
import type { ConfirmRoleAppearanceValue, SaveDramaPreparationValue } from '@wb/contracts';
import { PortraitRequest, SubmitPortrait, PortraitQuote, PortraitJobView, PortraitJobList, SelectPortrait } from '@wb/contracts';
import type { SubmitPortraitValue } from '@wb/contracts';
import { CreateStoryboardPlan, UpdateStoryboardPlanShot, StoryboardPlan } from '@wb/contracts';
import type { CreateStoryboardPlanValue, UpdateStoryboardPlanShotValue } from '@wb/contracts';
import { PlanImageRequest, SubmitPlanImage, PlanImageQuote, SelectPlanImage, PlanImage, PlanImageList } from '@wb/contracts';
import type { SubmitPlanImageValue } from '@wb/contracts';
import { PlanVideoRequest, SubmitPlanVideo, PlanVideoQuote, PlanExportList } from '@wb/contracts';
import type { SubmitPlanVideoValue } from '@wb/contracts';
import { DramaProductionPlan, MarketingProductionRequest, MarketingProductionPlan } from '@wb/contracts';
import type { MarketingProductionRequestValue } from '@wb/contracts';
import { CreateDramaExport, CreateDramaProject, CreateDramaRole, CreateDramaScene, CreateDramaStoryboardCandidate, CreateDramaStoryboardShot, DramaExportAccess, DramaExportJobView, DramaImageAccess, DramaImageJobView, DramaProjectList, DramaProjectListQuery, DramaProjectView, DramaProjectWorkflow, DramaRole, DramaScene, DramaScriptList, DramaScriptListQuery, DramaScriptVersion, DramaScriptView, DramaShotVideoAccess, DramaShotVideoJobView, DramaStoryboardCandidate, DramaStoryboardShot, GenerationList, GenerationQuote, GenerationSettings, GenerationView, GuestSession, MaterialView, MediaAccess, RepairDramaScript, SubmitDramaImageJob, SubmitDramaShotVideoJob, SubmitGeneration, WalletEntryList, WalletSummary } from '@wb/contracts';
import type { CreateDramaExportInput, CreateDramaProjectInput, CreateDramaRoleInput, CreateDramaSceneInput, CreateDramaStoryboardCandidateInput, CreateDramaStoryboardShotInput, DramaExportAccessValue, DramaExportJobViewValue, DramaImageAccessValue, DramaImageJobViewValue, DramaProjectViewValue, DramaProjectWorkflowValue, DramaRoleValue, DramaSceneValue, DramaScriptViewValue, DramaShotVideoAccessValue, DramaShotVideoJobViewValue, DramaStoryboardCandidateValue, DramaStoryboardShotValue } from '@wb/contracts';
import { createMiniappApiClient } from './taro-transport';

const apiNextBase = process.env.TARO_APP_API_NEXT_BASE ?? '';
const client = createMiniappApiClient(apiNextBase);
const SESSION = 'wb_v2_session';
const CREDENTIAL = 'wb_v2_guest_credential';
const PENDING = 'wb_v2_pending_video';
const PENDING_IMAGE = 'wb_v2_pending_drama_image';
const PENDING_EXPORT = 'wb_v2_pending_drama_export';
const PENDING_SHOT_VIDEO = 'wb_v2_pending_drama_shot_video';
const PENDING_SCRIPT = 'wb_v2_pending_drama_script';
let sessionPromise: Promise<GuestSession> | null = null;
async function randomBytes(length: number) {
  if (process.env.TARO_ENV === 'weapp') return new Uint8Array((await Taro.getRandomValues({ length })).randomValues);
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
export async function newRequestKey() {
  const bytes = await randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
async function session(): Promise<GuestSession> {
  const saved = GuestSession.safeParse(Taro.getStorageSync(SESSION));
  if (saved.success) return saved.data;
  if (!sessionPromise) sessionPromise = (async () => {
    let credential: unknown = Taro.getStorageSync(CREDENTIAL);
    if (typeof credential !== 'string' || !/^[a-f0-9]{64}$/.test(credential)) {
      credential = hex(await randomBytes(32));
      await Taro.setStorage({ key: CREDENTIAL, data: credential });
    }
    const result = GuestSession.parse(await client.request('post', '/v2/auth/guest', { body: { credential: credential as string } }));
    await Taro.setStorage({ key: SESSION, data: result });
    return result;
  })().finally(() => { sessionPromise = null; });
  return sessionPromise;
}
export async function generationUserId() { return (await session()).userId; }
async function authorized<T>(operation: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  const current = await session();
  try { return await operation({ authorization: `Bearer ${current.token}` }); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await Taro.removeStorage({ key: SESSION });
    sessionPromise = null;
    const renewed = await session();
    return operation({ authorization: `Bearer ${renewed.token}` });
  }
}
export type PendingVideoRequest = SubmitGeneration | SubmitNativeMarketingValue;
function nativePendingKey() { const current = GuestSession.safeParse(Taro.getStorageSync(SESSION)); return current.success ? `wb_v2_pending_native_video:${current.data.userId}` : null; }
export function pendingGeneration(): PendingVideoRequest | null {
  const key = nativePendingKey(); const native = key ? SubmitNativeMarketing.safeParse(Taro.getStorageSync(key)) : null;
  if (native?.success) return native.data;
  const pending = SubmitGeneration.safeParse(Taro.getStorageSync(PENDING));
  return pending.success ? pending.data : null;
}
export type MarketingDrafts = Record<MarketingCategoryValue, Pick<SubmitGeneration, 'prompt' | 'materialIds' | 'copyJobId'>>;
export async function loadMarketingDrafts(): Promise<{ userId: string; drafts: MarketingDrafts }> {
  const current = await session();
  const drafts: MarketingDrafts = { commerce: { prompt: '', materialIds: [] }, store_visit: { prompt: '', materialIds: [] } };
  for (const category of ['commerce', 'store_visit'] as const) {
    const raw: unknown = Taro.getStorageSync(`wb_v2_marketing_draft:${current.userId}:${category}`);
    if (!raw || typeof raw !== 'object') continue;
    const saved = raw as Record<string, unknown>; const materials = MaterialIds.safeParse(saved.materialIds);
    if (typeof saved.prompt === 'string' && saved.prompt.length <= 3000 && !saved.prompt.includes('\u0000') && materials.success) drafts[category] = { prompt: saved.prompt, materialIds: materials.data, ...(MarketingCopyJob.shape.id.safeParse(saved.copyJobId).success ? { copyJobId: saved.copyJobId as string } : {}) };
  }
  return { userId: current.userId, drafts };
}
export function saveMarketingDraft(userId: string, category: MarketingCategoryValue, draft: MarketingDrafts[MarketingCategoryValue]) {
  const current = GuestSession.safeParse(Taro.getStorageSync(SESSION));
  if (!current.success || current.data.userId !== userId) throw new Error('Marketing draft account changed');
  Taro.setStorageSync(`wb_v2_marketing_draft:${userId}:${category}`, draft);
}
export async function quoteNativeMarketing(input: NativeMarketingInputValue) {
  return NativeMarketingQuote.parse(await authorized(headers => client.request('post', '/v2/marketing/video/quote', { body: NativeMarketingInput.parse(input), headers })));
}
async function captionKey(jobId: string, kind: 'draft' | 'pending') { return `wb_native_captions_${kind}:${(await session()).userId}:${jobId}`; }
export async function pendingNativeCaptions(jobId: string) { const parsed = ConfirmNativeCaptions.safeParse(Taro.getStorageSync(await captionKey(jobId, 'pending'))); return parsed.success ? parsed.data : null; }
export async function loadNativeCaptionDraft(jobId: string) { const parsed = ConfirmNativeCaptions.omit({ requestKey: true }).safeParse(Taro.getStorageSync(await captionKey(jobId, 'draft'))); return parsed.success ? parsed.data : null; }
export async function saveNativeCaptionDraft(jobId: string, draft: Omit<ConfirmNativeCaptionsValue, 'requestKey'>) { Taro.setStorageSync(await captionKey(jobId, 'draft'), ConfirmNativeCaptions.omit({ requestKey: true }).parse(draft)); }
export async function nativeCaptionReview(jobId: string) {
  const result = NativeCaptionReview.nullable().parse(await authorized(headers => client.request('get', '/v2/marketing/video/{id}/review', { headers, path: { id: jobId } })));
  const pending = await pendingNativeCaptions(jobId); if (pending && result?.confirmationRequestKey === pending.requestKey) Taro.removeStorageSync(await captionKey(jobId, 'pending')); return result;
}
export async function nativeSourceAccess(jobId: string) { return NativeSourceAccess.parse(await authorized(headers => client.request('get', '/v2/marketing/video/{id}/source', { headers, path: { id: jobId } }))); }
export async function confirmNativeCaptions(jobId: string, input: Omit<ConfirmNativeCaptionsValue, 'requestKey'>) {
  const key = await captionKey(jobId, 'pending'); const prior = ConfirmNativeCaptions.safeParse(Taro.getStorageSync(key));
  const body = prior.success ? prior.data : ConfirmNativeCaptions.parse({ ...input, requestKey: await newRequestKey() }); Taro.setStorageSync(key, body);
  const clear = () => { if (ConfirmNativeCaptions.safeParse(Taro.getStorageSync(key)).data?.requestKey === body.requestKey) Taro.removeStorageSync(key); };
  try {
    const result = NativeCaptionReview.parse(await authorized(headers => client.request('post', '/v2/marketing/video/{id}/review', { headers, path: { id: jobId }, body })));
    if (result.confirmationRequestKey !== body.requestKey) throw new Error('Caption confirmation receipt mismatch'); clear(); Taro.removeStorageSync(await captionKey(jobId, 'draft')); return result;
  } catch (error) { if (error instanceof ApiError && [400, 403, 404, 409, 410].includes(error.status)) clear(); throw error; }
}
export async function resumeNativeMedia(jobId: string) { await authorized(headers => client.request('post', '/v2/marketing/video/{id}/resume', { headers, path: { id: jobId }, body: {} })); }
export async function submitGeneration(input: PendingVideoRequest): Promise<GenerationView> {
  await session(); const key = input.durationSec === 10 ? nativePendingKey()! : PENDING;
  const prior = input.durationSec === 10 ? SubmitNativeMarketing.safeParse(Taro.getStorageSync(key)) : null;
  const body = input.durationSec === 10 ? prior?.success ? prior.data : SubmitNativeMarketing.parse(input) : SubmitGeneration.parse(input);
  if (body.durationSec === 10) Taro.setStorageSync(key, body); else await Taro.setStorage({ key, data: body });
  const clear = async () => { if (body.durationSec !== 10 || SubmitNativeMarketing.safeParse(Taro.getStorageSync(key)).data?.requestKey === body.requestKey) await Taro.removeStorage({ key }); };
  try {
    const job = GenerationView.parse(await authorized(headers => body.durationSec === 10 ? client.request('post', '/v2/marketing/video', { body, headers }) : client.request('post', '/v2/generation', { body, headers })));
    if (body.durationSec === 10 && job.requestKey !== body.requestKey) throw new Error('Unexpected generation receipt');
    await Taro.setStorage({ key: 'wb_v2_last_job', data: job.id });
    await clear();
    return job;
  } catch (error) {
    const known = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    if (error instanceof ApiError && ([400, 402, 403, 409].includes(error.status) || error.status === 503 && known?.success && known.data.code === ErrorCode.GENERATION_UNAVAILABLE)) await clear();
    throw error;
  }
}
export async function readGeneration(id: string) {
  return GenerationView.parse(await authorized(headers => client.request('get', '/v2/generation/{id}', { path: { id }, headers })));
}
export async function mediaAccess(id: string) {
  return MediaAccess.parse(await authorized(headers => client.request('get', '/v2/generation/{id}/media', { path: { id }, headers })));
}
export async function generationWallet() {
  return WalletSummary.parse(await authorized(headers => client.request('get', '/v2/wallet', { headers })));
}

export async function listWalletEntries(cursor?: string) {
  return WalletEntryList.parse(await authorized(headers => client.request('get', '/v2/wallet/entries', { headers, query: cursor ? { cursor } : {} })));
}

export async function deactivateAccount() {
  await authorized(headers => client.request('post', '/v2/auth/deactivate', { headers }));
  await Taro.removeStorage({ key: SESSION });
}

export async function organizeStoryboard(projectId: string, request: CreateStoryboardPlanValue) {
  return StoryboardPlan.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/storyboard-plan', { path: { id: projectId }, headers, body: CreateStoryboardPlan.parse(request) })));
}
export async function latestStoryboardPlan(projectId: string) {
  return StoryboardPlan.nullable().parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/storyboard-plan', { path: { id: projectId }, headers })));
}
export async function readStoryboardPlan(planId: string) {
  return StoryboardPlan.parse(await authorized(headers => client.request('get', '/v2/drama/storyboard-plans/{id}', { path: { id: planId }, headers })));
}
export async function dramaProductionPlan(planId: string) {
  return DramaProductionPlan.parse(await authorized(headers => client.request('get', '/v2/drama/storyboard-plans/{id}/production-plan', { path: { id: planId }, headers })));
}
export async function marketingProductionPlan(input: MarketingProductionRequestValue) {
  return MarketingProductionPlan.parse(await authorized(headers => client.request('post', '/v2/marketing/production-plan', { headers, body: MarketingProductionRequest.parse(input) })));
}
export async function saveStoryboardShot(planId: string, request: UpdateStoryboardPlanShotValue) {
  return StoryboardPlan.parse(await authorized(headers => client.request('post', '/v2/drama/storyboard-plans/{id}', { path: { id: planId }, headers, body: UpdateStoryboardPlanShot.parse(request) })));
}
const planImagePendingKey = (planId: string, shotKey: string) => `wb_plan_image_pending:${planId}:${shotKey}`;
export function pendingPlanImage(planId: string, shotKey: string) {
  const body = SubmitPlanImage.safeParse(Taro.getStorageSync(planImagePendingKey(planId, shotKey))); return body.success ? body.data : null;
}
function clearPlanImage(planId: string, body: SubmitPlanImageValue) {
  if (pendingPlanImage(planId, body.shotKey)?.requestKey === body.requestKey) Taro.removeStorageSync(planImagePendingKey(planId, body.shotKey));
}
export async function quotePlanImage(planId: string, shotKey: string, planRevision: number) {
  return PlanImageQuote.parse(await authorized(headers => client.request('post', '/v2/drama/storyboard-plans/{id}/image-quote', { path: { id: planId }, headers, body: PlanImageRequest.parse({ shotKey, planRevision }) })));
}
export async function submitPlanImage(planId: string, request: SubmitPlanImageValue | Omit<SubmitPlanImageValue, 'requestKey'>) {
  const body = pendingPlanImage(planId, request.shotKey) ?? SubmitPlanImage.parse({ ...request, requestKey: 'requestKey' in request ? request.requestKey : await newRequestKey() });
  Taro.setStorageSync(planImagePendingKey(planId, body.shotKey), body);
  try {
    const result = PlanImage.parse(await authorized(headers => client.request('post', '/v2/drama/storyboard-plans/{id}/images', { path: { id: planId }, headers, body })));
    clearPlanImage(planId, body); return result;
  } catch (error) {
    const detail = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    const definite: number[] = [ErrorCode.VALIDATION, ErrorCode.INSUFFICIENT_CREDITS, ErrorCode.QUOTE_CHANGED, ErrorCode.TASK_ILLEGAL_TRANSITION, ErrorCode.GENERATION_UNAVAILABLE, ErrorCode.NOT_FOUND, ErrorCode.ACCOUNT_DEACTIVATED];
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status) && detail?.success && definite.includes(detail.data.code)) clearPlanImage(planId, body);
    throw error;
  }
}
export async function listPlanImages(planId: string, shotKey: string, cursor?: string) {
  const result = PlanImageList.parse(await authorized(headers => client.request('get', '/v2/drama/storyboard-plans/{id}/images', { path: { id: planId }, headers, query: { shotKey, ...(cursor ? { cursor } : {}) } })));
  const pending = pendingPlanImage(planId, shotKey); if (pending && result.items.some(item => item.requestKey === pending.requestKey)) clearPlanImage(planId, pending); return result;
}
export async function selectPlanImage(candidateId: string, planRevision: number) {
  return PlanImage.parse(await authorized(headers => client.request('post', '/v2/drama/storyboard-images/{id}/select', { path: { id: candidateId }, headers, body: SelectPlanImage.parse({ planRevision }) })));
}
async function planVideoKey(candidateId: string) { return `wb_plan_video_pending:${(await session()).userId}:${candidateId}`; }
export async function pendingPlanVideo(candidateId: string) { const value = SubmitPlanVideo.safeParse(Taro.getStorageSync(await planVideoKey(candidateId))); return value.success ? value.data : null; }
export async function quotePlanVideo(candidateId: string, planRevision: number) {
  return PlanVideoQuote.parse(await authorized(headers => client.request('post', '/v2/drama/candidates/{id}/plan-video-quote', { path: { id: candidateId }, headers, body: PlanVideoRequest.parse({ planRevision }) })));
}
export async function latestPlanVideo(candidateId: string) {
  const job = DramaShotVideoJobView.nullable().parse(await authorized(headers => client.request('get', '/v2/drama/candidates/{id}/plan-video-jobs', { path: { id: candidateId }, headers })));
  const pending = await pendingPlanVideo(candidateId); if (job && pending && pending.requestKey === job.requestKey) clearTextPending(await planVideoKey(candidateId), pending.requestKey); return job;
}
export async function submitPlanVideo(candidateId: string, request: SubmitPlanVideoValue | Omit<SubmitPlanVideoValue, 'requestKey'>) {
  const key = await planVideoKey(candidateId); const body = await pendingPlanVideo(candidateId) ?? SubmitPlanVideo.parse({ ...request, requestKey: 'requestKey' in request ? request.requestKey : await newRequestKey() });
  Taro.setStorageSync(key, body);
  try {
    const job = DramaShotVideoJobView.parse(await authorized(headers => client.request('post', '/v2/drama/candidates/{id}/plan-video-jobs', { path: { id: candidateId }, headers, body })));
    clearTextPending(key, body.requestKey); return job;
  } catch (error) {
    const detail = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    const definite: number[] = [ErrorCode.VALIDATION, ErrorCode.INSUFFICIENT_CREDITS, ErrorCode.QUOTE_CHANGED, ErrorCode.TASK_ILLEGAL_TRANSITION, ErrorCode.GENERATION_UNAVAILABLE, ErrorCode.NOT_FOUND, ErrorCode.ACCOUNT_DEACTIVATED];
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status) && detail?.success && definite.includes(detail.data.code)) clearTextPending(key, body.requestKey);
    throw error;
  }
}
export async function listPlanExports(planId: string) {
  const jobs = PlanExportList.parse(await authorized(headers => client.request('get', '/v2/drama/storyboard-plans/{id}/exports', { path: { id: planId }, headers })));
  const userId = (await session()).userId;
  for (const job of jobs) clearTextPending(`wb_plan_export_pending:${userId}:${planId}:${job.episodeNumber}`, job.requestKey); return jobs;
}
export async function createPlanExport(projectId: string, planId: string, planRevision: number, episodeNumber: number) {
  const key = `wb_plan_export_pending:${(await session()).userId}:${planId}:${episodeNumber}`; const saved = CreateDramaExport.safeParse(Taro.getStorageSync(key));
  const body = saved.success ? saved.data : CreateDramaExport.parse({ planId, planRevision, episodeNumber, requestKey: await newRequestKey() }); Taro.setStorageSync(key, body);
  try {
    const job = DramaExportJobView.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/exports', { path: { id: projectId }, headers, body })));
    clearTextPending(key, body.requestKey); return job;
  } catch (error) {
    const detail = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    const definite: number[] = [ErrorCode.VALIDATION, ErrorCode.QUOTE_CHANGED, ErrorCode.TASK_ILLEGAL_TRANSITION, ErrorCode.GENERATION_UNAVAILABLE, ErrorCode.NOT_FOUND, ErrorCode.ACCOUNT_DEACTIVATED];
    if (error instanceof ApiError && [400, 403, 404, 409, 503].includes(error.status) && detail?.success && definite.includes(detail.data.code)) clearTextPending(key, body.requestKey);
    throw error;
  }
}

export async function uploadMaterial(filePath: string): Promise<MaterialView> {
  return authorized(async headers => {
    const response = await Taro.uploadFile({ url: `${apiNextBase}/v2/materials`, filePath, name: 'file', header: headers });
    const payload: unknown = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.statusCode !== 201) throw new ApiError(response.statusCode, payload);
    return MaterialView.parse(payload);
  });
}

export async function quoteGeneration(input: unknown): Promise<GenerationQuote> {
  return GenerationQuote.parse(await client.request('post', '/v2/generation/quote', {
    body: GenerationSettings.parse(input),
  }));
}

export async function listGenerations(cursor?: string) {
  return GenerationList.parse(await authorized(headers => client.request('get', '/v2/generation', { headers, query: cursor ? { cursor } : {} })));
}

export async function quoteDramaScript(projectId: string) {
  return DramaScriptQuote.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/script-quote', { path: { id: projectId }, headers })));
}
export async function getDramaPreparation(projectId: string) {
  return DramaPreparation.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/preparation', { path: { id: projectId }, headers })));
}
const portraitPendingKey = (projectId: string, roleKey: string) => `wb_portrait_pending:${projectId}:${roleKey}`;
export function pendingPortrait(projectId: string, roleKey: string) {
  const parsed = SubmitPortrait.safeParse(Taro.getStorageSync(portraitPendingKey(projectId, roleKey)));
  return parsed.success && parsed.data.roleKey === roleKey ? parsed.data : null;
}
export async function quotePortrait(projectId: string, roleKey: string, preparationRevision: number) {
  return PortraitQuote.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/portrait-quote', { path: { id: projectId }, headers, body: PortraitRequest.parse({ roleKey, preparationRevision }) })));
}
function clearPortrait(projectId: string, request: SubmitPortraitValue) {
  if (pendingPortrait(projectId, request.roleKey)?.requestKey === request.requestKey) Taro.removeStorageSync(portraitPendingKey(projectId, request.roleKey));
}
export async function submitPortrait(projectId: string, request: SubmitPortraitValue | Omit<SubmitPortraitValue, 'requestKey'>) {
  const body = pendingPortrait(projectId, request.roleKey) ?? SubmitPortrait.parse({ ...request, requestKey: 'requestKey' in request ? request.requestKey : await newRequestKey() });
  Taro.setStorageSync(portraitPendingKey(projectId, body.roleKey), body);
  try {
    const job = PortraitJobView.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/portrait-jobs', { path: { id: projectId }, headers, body })));
    clearPortrait(projectId, body); return job;
  } catch (error) {
    const parsed = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    const codes: number[] = [ErrorCode.VALIDATION, ErrorCode.INSUFFICIENT_CREDITS, ErrorCode.QUOTE_CHANGED, ErrorCode.TASK_ILLEGAL_TRANSITION, ErrorCode.GENERATION_UNAVAILABLE, ErrorCode.NOT_FOUND, ErrorCode.ACCOUNT_DEACTIVATED];
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status) && parsed?.success && codes.includes(parsed.data.code)) clearPortrait(projectId, body);
    throw error;
  }
}
export async function listPortraits(projectId: string, roleKey: string, cursor?: string) {
  const page = PortraitJobList.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/portrait-jobs', { path: { id: projectId }, headers, query: { roleKey, ...(cursor ? { cursor } : {}) } })));
  const pending = pendingPortrait(projectId, roleKey);
  if (pending && page.items.some(job => job.requestKey === pending.requestKey)) clearPortrait(projectId, pending);
  return page;
}
export async function selectPortrait(jobId: string, preparationRevision: number) {
  return DramaPreparation.parse(await authorized(headers => client.request('post', '/v2/drama/portrait-jobs/{id}/select', { path: { id: jobId }, headers, body: SelectPortrait.parse({ preparationRevision }) })));
}
export async function materialAccess(materialId: string) {
  return MaterialAccess.parse(await authorized(headers => client.request('get', '/v2/materials/{id}/access', { path: { id: materialId }, headers })));
}
export async function confirmRoleAppearance(projectId: string, confirmation: ConfirmRoleAppearanceValue) {
  const body = ConfirmRoleAppearance.parse(confirmation);
  return DramaPreparation.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/role-appearance', { path: { id: projectId }, headers, body })));
}

function definiteTextRefusal(error: unknown) {
  const body = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
  return error instanceof ApiError && ([400, 402, 403, 404, 409].includes(error.status) || error.status === 503 && body?.success && body.data.code === ErrorCode.GENERATION_UNAVAILABLE);
}
function clearTextPending(key: string, requestKey: string) {
  const value: unknown = Taro.getStorageSync(key);
  if (value && typeof value === 'object' && (value as Record<string, unknown>).requestKey === requestKey) Taro.removeStorageSync(key);
}
export function pendingScriptBatch(projectId: string): SubmitScriptBatchValue | null {
  const parsed = SubmitScriptBatch.safeParse(Taro.getStorageSync(`wb_script_batch_pending:${projectId}`)); return parsed.success ? parsed.data : null;
}
export async function quoteScriptBatch(projectId: string) {
  return ScriptBatchQuote.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/script-batch-quote', { path: { id: projectId }, headers })));
}
export async function latestScriptBatch(projectId: string) {
  const batch = ScriptBatch.nullable().parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/script-batches/latest', { path: { id: projectId }, headers })));
  if (batch) clearTextPending(`wb_script_batch_pending:${projectId}`, batch.requestKey); return batch;
}
export async function submitScriptBatch(projectId: string, request: SubmitScriptBatchValue) {
  const body = SubmitScriptBatch.parse(request); const key = `wb_script_batch_pending:${projectId}`;
  const existing = pendingScriptBatch(projectId); if (!existing || existing.requestKey === body.requestKey) await Taro.setStorage({ key, data: body });
  try { const result = ScriptBatch.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/script-batches', { path: { id: projectId }, body, headers }))); clearTextPending(key, body.requestKey); return result; }
  catch (error) { if (definiteTextRefusal(error)) clearTextPending(key, body.requestKey); throw error; }
}
async function copyPendingKey(category: MarketingCategoryValue) { return `wb_marketing_copy_pending:${(await session()).userId}:${category}`; }
export async function pendingMarketingCopy(category: MarketingCategoryValue): Promise<SubmitMarketingCopyValue | null> {
  const parsed = SubmitMarketingCopy.safeParse(Taro.getStorageSync(await copyPendingKey(category))); return parsed.success ? parsed.data : null;
}
export async function quoteMarketingCopy(input: MarketingCopyInputValue) {
  return MarketingCopyQuote.parse(await authorized(headers => client.request('post', '/v2/marketing/copy/quote', { body: MarketingCopyInput.parse(input), headers })));
}
export async function latestMarketingCopy(category: MarketingCategoryValue) {
  const result = MarketingCopyJob.nullable().parse(await authorized(headers => client.request('get', '/v2/marketing/copy/jobs/latest', { query: { category }, headers })));
  if (result) clearTextPending(await copyPendingKey(category), result.requestKey); return result;
}
export async function getMarketingCopy(jobId: string) {
  return MarketingCopyJob.parse(await authorized(headers => client.request('get', '/v2/marketing/copy/jobs/{id}', { path: { id: jobId }, headers })));
}
export async function submitMarketingCopy(request: SubmitMarketingCopyValue) {
  const body = SubmitMarketingCopy.parse(request); const key = await copyPendingKey(body.category);
  const existing = await pendingMarketingCopy(body.category); if (!existing || existing.requestKey === body.requestKey) await Taro.setStorage({ key, data: body });
  try { const result = MarketingCopyJob.parse(await authorized(headers => client.request('post', '/v2/marketing/copy/jobs', { body, headers }))); clearTextPending(key, body.requestKey); return result; }
  catch (error) { if (definiteTextRefusal(error)) clearTextPending(key, body.requestKey); throw error; }
}
export async function saveDramaPreparation(projectId: string, draft: SaveDramaPreparationValue) {
  const body = SaveDramaPreparation.parse(draft);
  return DramaPreparation.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/preparation', { path: { id: projectId }, headers, body })));
}
export function pendingDramaScript(projectId: string) {
  for (const key of [`${PENDING_SCRIPT}:${projectId}`, PENDING_SCRIPT]) {
    const stored = Taro.getStorageSync(key) as { projectId?: unknown; requestKey?: unknown; quoteVersion?: unknown } | null;
    const replay = SubmitDramaScriptJob.safeParse({ requestKey: stored?.requestKey, quoteVersion: stored?.quoteVersion });
    if (stored?.projectId === projectId && replay.success) return replay.data;
  }
  return null;
}
function clearPendingDramaScript(projectId: string, requestKey: string) {
  for (const key of [`${PENDING_SCRIPT}:${projectId}`, PENDING_SCRIPT]) {
    const stored = Taro.getStorageSync(key) as { projectId?: unknown; requestKey?: unknown } | null;
    if (stored?.projectId === projectId && stored.requestKey === requestKey) Taro.removeStorageSync(key);
  }
}
export async function submitDramaScript(projectId: string, quoteVersion?: string) {
  const body = pendingDramaScript(projectId) ?? SubmitDramaScriptJob.parse({ requestKey: await newRequestKey(), quoteVersion });
  await Taro.setStorage({ key: `${PENDING_SCRIPT}:${projectId}`, data: { projectId, ...body } });
  try {
    const job = DramaScriptJobView.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/script-jobs', { path: { id: projectId }, headers, body })));
    clearPendingDramaScript(projectId, body.requestKey); return job;
  } catch (error) {
    const failure = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
    const definiteCodes: number[] = [ErrorCode.VALIDATION, ErrorCode.INSUFFICIENT_CREDITS, ErrorCode.ACCOUNT_DEACTIVATED, ErrorCode.NOT_FOUND, ErrorCode.TASK_NOT_FOUND, ErrorCode.QUOTE_CHANGED, ErrorCode.TASK_ILLEGAL_TRANSITION, ErrorCode.GENERATION_UNAVAILABLE];
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status) && failure?.success && definiteCodes.includes(failure.data.code)) clearPendingDramaScript(projectId, body.requestKey);
    throw error;
  }
}
export async function latestDramaScriptJob(projectId: string) {
  const job = DramaScriptJobView.nullable().parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/script-jobs', { path: { id: projectId }, headers })));
  if (job) clearPendingDramaScript(projectId, job.requestKey);
  return job;
}
export async function confirmDramaScript(projectId: string, versionId: string) {
  const body = ConfirmDramaScript.parse({ versionId });
  return DramaProjectView.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/script-confirmation', { path: { id: projectId }, headers, body })));
}
export async function createDramaProject(input: CreateDramaProjectInput): Promise<DramaProjectView> {
  const body = CreateDramaProject.parse(input);
  return DramaProjectView.parse(await authorized(headers => client.request('post', '/v2/drama/projects', { body, headers })));
}

export async function listDramaProjects(cursor?: string): Promise<DramaProjectList> {
  const query = DramaProjectListQuery.parse(cursor ? { cursor } : {});
  return DramaProjectList.parse(await authorized(headers => client.request('get', '/v2/drama/projects', { headers, query })));
}

export async function getDramaProject(projectId: string): Promise<DramaProjectViewValue> {
  return DramaProjectView.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}', { path: { id: projectId }, headers })));
}

export async function listDramaScripts(cursor?: string): Promise<DramaScriptList> {
  const query = DramaScriptListQuery.parse(cursor ? { cursor } : {});
  return DramaScriptList.parse(await authorized(headers => client.request('get', '/v2/drama/scripts', { headers, query })));
}

export async function getDramaScript(scriptId: string): Promise<DramaScriptViewValue> {
  return DramaScriptView.parse(await authorized(headers => client.request('get', '/v2/drama/scripts/{id}', { path: { id: scriptId }, headers })));
}

export async function repairDramaScript(scriptId: string, content: string): Promise<DramaScriptVersion> {
  const body = RepairDramaScript.parse({ content });
  return DramaScriptVersion.parse(await authorized(headers => client.request('post', '/v2/drama/scripts/{id}/versions', { path: { id: scriptId }, body, headers })));
}

export async function getDramaProjectWorkflow(projectId: string): Promise<DramaProjectWorkflowValue> {
  return DramaProjectWorkflow.parse(await authorized(headers => client.request('get', '/v2/drama/projects/{id}/workflow', { path: { id: projectId }, headers })));
}

export async function createDramaRole(projectId: string, input: CreateDramaRoleInput): Promise<DramaRoleValue> {
  const body = CreateDramaRole.parse(input);
  return DramaRole.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/roles', { path: { id: projectId }, body, headers })));
}

export async function createDramaScene(projectId: string, input: CreateDramaSceneInput): Promise<DramaSceneValue> {
  const body = CreateDramaScene.parse(input);
  return DramaScene.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/scenes', { path: { id: projectId }, body, headers })));
}

export async function createDramaStoryboardShot(projectId: string, input: CreateDramaStoryboardShotInput): Promise<DramaStoryboardShotValue> {
  const body = CreateDramaStoryboardShot.parse(input);
  return DramaStoryboardShot.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/shots', { path: { id: projectId }, body, headers })));
}

export async function createDramaStoryboardCandidate(shotId: string, input: CreateDramaStoryboardCandidateInput): Promise<DramaStoryboardCandidateValue> {
  const body = CreateDramaStoryboardCandidate.parse(input);
  return DramaStoryboardCandidate.parse(await authorized(headers => client.request('post', '/v2/drama/shots/{id}/candidates', { path: { id: shotId }, body, headers })));
}

export async function selectDramaStoryboardCandidate(candidateId: string): Promise<DramaStoryboardCandidateValue> {
  return DramaStoryboardCandidate.parse(await authorized(headers => client.request('post', '/v2/drama/candidates/{id}/select', { path: { id: candidateId }, headers })));
}

function pendingImageJob(): { candidateId: string; requestKey: string } | null {
  const raw: unknown = Taro.getStorageSync(PENDING_IMAGE);
  if (typeof raw !== 'object' || raw === null) return null;
  const { candidateId, requestKey } = raw as Record<string, unknown>;
  if (typeof candidateId !== 'string') return null;
  if (!SubmitDramaImageJob.safeParse({ requestKey }).success) return null;
  return { candidateId, requestKey: requestKey as string };
}

export async function submitDramaImageJob(candidateId: string): Promise<DramaImageJobViewValue> {
  const replay = pendingImageJob();
  const requestKey = replay && replay.candidateId === candidateId ? replay.requestKey : await newRequestKey();
  const body = SubmitDramaImageJob.parse({ requestKey });
  await Taro.setStorage({ key: PENDING_IMAGE, data: { candidateId, requestKey } });
  try {
    const job = DramaImageJobView.parse(await authorized(headers => client.request('post', '/v2/drama/candidates/{id}/image-jobs', { path: { id: candidateId }, body, headers })));
    await Taro.removeStorage({ key: PENDING_IMAGE });
    return job;
  } catch (error) {
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status)) await Taro.removeStorage({ key: PENDING_IMAGE });
    throw error;
  }
}

export async function readDramaImageJob(jobId: string): Promise<DramaImageJobViewValue> {
  return DramaImageJobView.parse(await authorized(headers => client.request('get', '/v2/drama/image-jobs/{id}', { path: { id: jobId }, headers })));
}

export async function dramaImageMedia(jobId: string): Promise<DramaImageAccessValue> {
  return DramaImageAccess.parse(await authorized(headers => client.request('get', '/v2/drama/image-jobs/{id}/media', { path: { id: jobId }, headers })));
}

function pendingDramaShotVideo(): { candidateId: string; requestKey: string } | null {
  const raw: unknown = Taro.getStorageSync(PENDING_SHOT_VIDEO);
  if (typeof raw !== 'object' || raw === null) return null;
  const { candidateId, requestKey } = raw as Record<string, unknown>;
  if (typeof candidateId !== 'string' || !SubmitDramaShotVideoJob.safeParse({ requestKey }).success) return null;
  return { candidateId, requestKey: requestKey as string };
}

export async function submitDramaShotVideo(candidateId: string): Promise<DramaShotVideoJobViewValue> {
  const replay = pendingDramaShotVideo();
  const requestKey = replay && replay.candidateId === candidateId ? replay.requestKey : await newRequestKey();
  const body = SubmitDramaShotVideoJob.parse({ requestKey });
  await Taro.setStorage({ key: PENDING_SHOT_VIDEO, data: { candidateId, requestKey } });
  try {
    const job = DramaShotVideoJobView.parse(await authorized(headers => client.request('post', '/v2/drama/candidates/{id}/video-jobs', { path: { id: candidateId }, body, headers })));
    await Taro.removeStorage({ key: PENDING_SHOT_VIDEO });
    return job;
  } catch (error) {
    if (error instanceof ApiError && [400, 402, 403, 404, 409, 503].includes(error.status)) await Taro.removeStorage({ key: PENDING_SHOT_VIDEO });
    throw error;
  }
}

export async function readDramaShotVideo(jobId: string): Promise<DramaShotVideoJobViewValue> {
  return DramaShotVideoJobView.parse(await authorized(headers => client.request('get', '/v2/drama/video-jobs/{id}', { path: { id: jobId }, headers })));
}

export async function dramaShotVideoMedia(jobId: string): Promise<DramaShotVideoAccessValue> {
  return DramaShotVideoAccess.parse(await authorized(headers => client.request('get', '/v2/drama/video-jobs/{id}/media', { path: { id: jobId }, headers })));
}

function pendingDramaExport(): { projectId: string; episodeNumber: number; requestKey: string } | null {
  const raw: unknown = Taro.getStorageSync(PENDING_EXPORT);
  if (typeof raw !== 'object' || raw === null) return null;
  const { projectId, episodeNumber, requestKey } = raw as Record<string, unknown>;
  if (typeof projectId !== 'string' || !CreateDramaExport.safeParse({ episodeNumber, requestKey }).success) return null;
  return { projectId, episodeNumber: episodeNumber as number, requestKey: requestKey as string };
}

export async function createDramaExport(projectId: string, episodeNumber: number): Promise<DramaExportJobViewValue> {
  const replay = pendingDramaExport();
  const requestKey = replay && replay.projectId === projectId && replay.episodeNumber === episodeNumber ? replay.requestKey : await newRequestKey();
  const body: CreateDramaExportInput = CreateDramaExport.parse({ episodeNumber, requestKey });
  await Taro.setStorage({ key: PENDING_EXPORT, data: { projectId, ...body } });
  try {
    const job = DramaExportJobView.parse(await authorized(headers => client.request('post', '/v2/drama/projects/{id}/exports', { path: { id: projectId }, body, headers })));
    await Taro.removeStorage({ key: PENDING_EXPORT });
    return job;
  } catch (error) {
    if (error instanceof ApiError && [400, 404, 409, 503].includes(error.status)) await Taro.removeStorage({ key: PENDING_EXPORT });
    throw error;
  }
}

export async function readDramaExport(jobId: string): Promise<DramaExportJobViewValue> {
  return DramaExportJobView.parse(await authorized(headers => client.request('get', '/v2/drama/exports/{id}', { path: { id: jobId }, headers })));
}

export async function dramaExportMedia(jobId: string): Promise<DramaExportAccessValue> {
  return DramaExportAccess.parse(await authorized(headers => client.request('get', '/v2/drama/exports/{id}/media', { path: { id: jobId }, headers })));
}
