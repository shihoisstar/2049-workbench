import { NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from '../modules/generation/native-offer';
import type { NativeMarketingOffer } from '../modules/generation/native-offer';
import postgres from 'postgres';
import { createDramaScriptStore } from '../modules/drama-script/infrastructure/store';
import { createScriptBatchStore } from '../modules/drama-script/infrastructure/batches';
import { createMarketingCopyStore } from '../modules/marketing-copy/infrastructure/store';
import type { MarketingCopyService, CopyOutbox, CopyReviewService } from '../modules/marketing-copy/public';
import type { ScriptBatchQuoteValue, ScriptBatchValue, SubmitScriptBatchValue } from '@wb/contracts';
import { createScriptReviewStore } from '../modules/drama-script/infrastructure/review';
import type { DramaScriptOutbox, DramaScriptService } from '../modules/drama-script/public';
import { ConfirmDramaScript, RepairDramaScript, ErrorCode, TextGenerationReceipt } from '@wb/contracts';
import type { ScriptAdmission, ScriptJobLocator } from '../modules/drama-script/public';
import { DomainError } from '../errors';
import { createHash, randomUUID } from 'node:crypto';
import { ConfirmRoleAppearance, DramaPreparation } from '@wb/contracts';
import { PortraitJobView, PortraitRequest, SubmitPortrait, SaveDramaPreparation } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';
import { DRAMA_IMAGE_PRICING, DRAMA_SHOT_VIDEO_PRICING, SIGNUP_GRANT_CREDITS, VIDEO_PRICING, estimateCreditsFor } from '@wb/contracts';
import type { GuestSession } from '@wb/contracts';
import { NativeMarketingInput, SubmitNativeMarketing } from '@wb/contracts';
import type { NativeMarketingInputValue, NativeMarketingQuoteValue, SubmitNativeMarketingValue } from '@wb/contracts';
import { normalizeMaterialIds } from '../modules/materials/public';
import type { ReviewScriptRequestValue, ScriptReviewListValue, ScriptReviewResultValue } from '@wb/contracts';
import { createBillingStore } from '../modules/billing/infrastructure/store';
import type { BillingStore } from '../modules/billing/public';
import { createIdentityStore } from '../modules/identity/infrastructure/store';
import type { IdentityStore } from '../modules/identity/public';
import { createGenerationStore } from '../modules/generation/infrastructure/store';
import type { GenerationOutbox, GenerationService } from '../modules/generation/public';
import type { ProviderSubmissions } from '../modules/generation/public';
import { createSubmissionStore } from '../modules/generation/infrastructure/submissions';
import { createNativeMediaStore } from '../modules/generation/native-media';
import type { NativeMediaRecord, NativeMediaSource } from '../modules/generation/native-media';
import type { NativeCaptionCueValue, ConfirmNativeCaptionsValue } from '@wb/contracts';
import type { GenerationLocator } from '../modules/generation/public';
import type { PublishMediaInput, MediaAsset } from '../modules/assets/public';
import { createAssetStore } from '../modules/assets/infrastructure/store';
import type { AssetService } from '../modules/assets/public';
import { createMaterialStore } from '../modules/materials/infrastructure/store';
import type { InsertMaterialInput, MaterialLocator, MaterialRecord } from '../modules/materials/public';
import { createDramaStore } from '../modules/drama/infrastructure/store';
import { createPreparationStore } from '../modules/drama/infrastructure/preparation';
import { createStoryboardPlanStore } from '../modules/drama/infrastructure/storyboard-plan';
import { planSourceKey, planSnapshot, deriveStoryboardShots } from '../modules/drama/storyboard-plan';
import { createPlanImageStore } from '../modules/drama/infrastructure/plan-images';
import { planImageSource, assertPlanImageReady, PLAN_IMAGE_MODEL, PLAN_IMAGE_TEST_CREDITS } from '../modules/drama/plan-image';
import { PlanImageRequest, SubmitPlanImage } from '@wb/contracts';
import type { PlanImageRequestValue, SubmitPlanImageValue, PlanImageQuoteValue, PlanImageValue, PlanImageListValue } from '@wb/contracts';
import { CreateStoryboardPlan, UpdateStoryboardPlanShot, StoryboardPlan } from '@wb/contracts';
import type { CreateStoryboardPlanValue, UpdateStoryboardPlanShotValue, StoryboardPlanValue } from '@wb/contracts';
import type { DramaService } from '../modules/drama/public';
import { createDramaImageStore } from '../modules/drama-image/infrastructure/store';
import { createDramaImageSubmissionStore } from '../modules/drama-image/infrastructure/submissions';
import { createPortraitReviewStore } from '../modules/drama-image/infrastructure/review';
import type { PortraitReviewListValue, ReviewPortraitRequestValue, PortraitReviewResultValue } from '@wb/contracts';
import { createDramaImageAssetStore } from '../modules/drama-image/infrastructure/assets';
import type { DramaImageAssets, DramaImageOutbox, DramaImageService, DramaImageSubmissions } from '../modules/drama-image/public';
import type { DramaImageJob, RolePortraitService, PortraitOffer } from '../modules/drama-image/public';
import { portraitContentKey, portraitSnapshot } from '../modules/drama-image/portrait';
import { createDramaShotVideoStore } from '../modules/drama-shot-video/infrastructure/store';
import { createDramaShotVideoSubmissionStore } from '../modules/drama-shot-video/infrastructure/submissions';
import { createDramaShotVideoAssetStore } from '../modules/drama-shot-video/infrastructure/assets';
import { PLAN_VIDEO_CREDITS, PLAN_VIDEO_MODEL, planVideoSnapshot, planVideoQuoteVersion } from '../modules/drama-shot-video/plan';
import { spokenLines } from '../modules/drama/spoken-lines';
import { buildDramaProductionPlan } from '../modules/drama/production-plan';
import type { DramaProductionPlanValue } from '@wb/contracts';
import type {
  DramaShotVideoAssets, DramaShotVideoOutbox, DramaShotVideoService, DramaShotVideoSubmissions,
} from '../modules/drama-shot-video/public';
import { createDramaExportStore } from '../modules/drama-export/infrastructure/store';
import { createDramaExportAssetStore } from '../modules/drama-export/infrastructure/assets';
import type { DramaExportAssets, DramaExportOutbox, DramaExportService, DramaExportPlanManifest, CreateDramaExportJobInput } from '../modules/drama-export/public';

export interface Services {
  identity: Pick<IdentityStore, 'authenticate' | 'deactivate'> & {
    bootstrapGuest(credential: string): Promise<GuestSession>;
  };
  billing: BillingStore;
  generation: GenerationService;
  nativeMedia: {
    get(input: GenerationLocator): Promise<NativeMediaRecord | null>;
    capture(input: NativeMediaSource): Promise<NativeMediaRecord>;
    recognize(input: GenerationLocator & { sourceSha256: string; transcript: string; cues: NativeCaptionCueValue[] }): Promise<NativeMediaRecord>;
    issue(input: GenerationLocator & { issue: 'transcription_failed' | 'render_failed' }): Promise<void>;
    confirm(input: GenerationLocator & { request: ConfirmNativeCaptionsValue }): Promise<NativeMediaRecord>;
    resume(input: GenerationLocator): Promise<void>;
    publish(input: PublishMediaInput & { sourceSha256: string; revision: number }): Promise<MediaAsset>;
  };
  nativeMarketing: {
    quote(input: { userId: string; request: NativeMarketingInputValue; mockAvailable: boolean; offer?: NativeMarketingOffer }): Promise<NativeMarketingQuoteValue>;
    create(input: { userId: string; request: SubmitNativeMarketingValue; mockAvailable: boolean; offer?: NativeMarketingOffer }): Promise<import('../modules/generation/public').GenerationJob>;
  };
  generationOutbox: GenerationOutbox;
  providerSubmissions: ProviderSubmissions;
  assets: AssetService;
  materials: {
    register(input: InsertMaterialInput): Promise<MaterialRecord>;
    get(input: MaterialLocator): Promise<MaterialRecord>;
    listForJob(locator: { userId: string; jobId: string }): Promise<MaterialRecord[]>;
    sweepExpired(): Promise<number>;
  };
  drama: DramaService;
  dramaScripts: DramaScriptService;
  dramaScriptOutbox: DramaScriptOutbox;
  marketingCopies: MarketingCopyService;
  marketingCopyOutbox: CopyOutbox;
  opsCopyReview: CopyReviewService;
  scriptBatches: {
    quote(input: { userId: string; projectId: string; admission: ScriptAdmission }): Promise<ScriptBatchQuoteValue>;
    create(input: { userId: string; projectId: string; request: SubmitScriptBatchValue; admission: ScriptAdmission }): Promise<ScriptBatchValue>;
    latest(input: { userId: string; projectId: string }): Promise<ScriptBatchValue | null>;
    get(input: { userId: string; batchId: string }): Promise<ScriptBatchValue>;
    advance(input: ScriptJobLocator): Promise<void>;
  };
  dramaImages: DramaImageService;
  rolePortraits: RolePortraitService;
  dramaImageSubmissions: DramaImageSubmissions;
  dramaImageAssets: DramaImageAssets;
  dramaImageOutbox: DramaImageOutbox;
  dramaShotVideos: DramaShotVideoService;
  dramaShotVideoSubmissions: DramaShotVideoSubmissions;
  dramaShotVideoAssets: DramaShotVideoAssets;
  dramaShotVideoOutbox: DramaShotVideoOutbox;
  dramaExports: DramaExportService;
  dramaExportAssets: DramaExportAssets;
  dramaExportOutbox: DramaExportOutbox;
  opsReview: {
    list(): Promise<{ jobId: string; userId: string; prompt: string; resolution: string; reservedCredits: number; providerKey: string; createdAt: string }[]>;
    receipt(input: { jobId: string; providerTaskId: string }): Promise<{ jobId: string; action: 'receipt'; status: 'accepted' }>;
    reject(input: { jobId: string }): Promise<{ jobId: string; action: 'reject'; status: 'failed' }>;
  };
  opsScriptReview: {
    list(input?: { cursor?: string }): Promise<ScriptReviewListValue>;
    resolve(input: { jobId: string; request: ReviewScriptRequestValue }): Promise<ScriptReviewResultValue>;
  };
  opsPortraitReview: {
    list(input?: { cursor?: string }): Promise<PortraitReviewListValue>;
    resolve(input: { jobId: string; request: ReviewPortraitRequestValue }): Promise<PortraitReviewResultValue>;
  };
  storyboardPlans: {
    production(input: { userId: string; planId: string }): Promise<DramaProductionPlanValue>;
    create(input: { userId: string; projectId: string; request: CreateStoryboardPlanValue }): Promise<StoryboardPlanValue>;
    latest(input: { userId: string; projectId: string }): Promise<StoryboardPlanValue | null>;
    get(input: { userId: string; planId: string }): Promise<StoryboardPlanValue>;
    update(input: { userId: string; planId: string; request: UpdateStoryboardPlanShotValue }): Promise<StoryboardPlanValue>;
  };
  planImages: {
    quote(input: { userId: string; planId: string; request: PlanImageRequestValue; mockAvailable: boolean }): Promise<PlanImageQuoteValue>;
    create(input: { userId: string; planId: string; request: SubmitPlanImageValue; mockAvailable: boolean }): Promise<PlanImageValue>;
    list(input: { userId: string; planId: string; shotKey: string; cursor?: string }): Promise<PlanImageListValue>;
    select(input: { userId: string; candidateId: string; planRevision: number }): Promise<PlanImageValue>;
  };
  probe(): Promise<void>;
  close(): Promise<void>;
}

async function advanceScriptBatch(tx: postgres.TransactionSql, input: { userId: string; projectId: string; batchId: string }) {
  const drama = createDramaStore(tx); const project = await drama.lockProject(input); const batches = createScriptBatchStore(tx);
  const outcome = await batches.advance(input);
  for (const child of outcome.refunds) if (child.quote) await createBillingStore(tx).refund({ userId: child.user_id, billingKey: `drama-script:${child.id}` });
  if (outcome.content !== null) {
    RepairDramaScript.parse({ content: outcome.content });
    const draft = await drama.createGeneratedDraft({ userId: input.userId, title: project.title, content: outcome.content, source: outcome.batch.binding ? 'ai_generated' : 'mock_generated' });
    if (draft.parseStatus !== 'parsed') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Batch assembly requires parsed episodes');
    await batches.finish(input.batchId, draft.versionId);
  }
}
async function advanceBatchForJob(tx: postgres.TransactionSql, input: ScriptJobLocator) {
  const linked = await createScriptBatchStore(tx).forJob(input);
  if (linked?.batch_id) await advanceScriptBatch(tx, { userId: input.userId, projectId: linked.project_id, batchId: linked.batch_id });
}
async function completeScript(tx: postgres.TransactionSql, input: ScriptJobLocator & { content: string }, receiptValidated = false) {
  RepairDramaScript.parse({ content: input.content });
  const jobs = createDramaScriptStore(tx); const drama = createDramaStore(tx);
  const initial = await jobs.get(input);
  const project = await drama.lockProject({ userId: input.userId, projectId: initial.projectId });
  const existing = await jobs.lock(input);
  if (existing.batch_id && !existing.batch_ready) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script episode is not activated');
  if (existing.binding && !receiptValidated) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Real script requires a recorded response');
  if (existing.status === 'succeeded') {
    const result = await jobs.get(input);
    if (result.draftVersion?.content !== input.content) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script completion conflicts');
    await advanceBatchForJob(tx, input); return result;
  }
  if (existing.status !== 'accepted' || project.active_version_id) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script job cannot complete');
  const draft = await drama.createGeneratedDraft({ userId: input.userId, title: existing.snapshot.title, content: input.content, source: existing.binding ? 'ai_generated' : 'mock_generated' });
  const valid = draft.parseStatus === 'parsed' && (!existing.batch_id || draft.parse.episodes.length === 1 && draft.parse.episodes[0].number === existing.episode_number && input.content.length <= existing.snapshot.maximumCharacters!);
  const billingState = !existing.quote ? 'none' : valid ? 'settled' : 'refunded';
  if (existing.quote) {
    const billing = createBillingStore(tx); const billingKey = `drama-script:${existing.id}`;
    if (billingState === 'settled') await billing.settle({ userId: input.userId, billingKey, actual: existing.quote.credits });
    else await billing.refund({ userId: input.userId, billingKey });
  }
  const result = await jobs.publish(input, draft.versionId, billingState); await advanceBatchForJob(tx, input); return result;
}

async function failScript(tx: postgres.TransactionSql, input: ScriptJobLocator & { failureCode: string }) {
  const jobs = createDramaScriptStore(tx); const existing = await jobs.lock(input);
  if (existing.billing_state === 'held') await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-script:${existing.id}` });
  // An illegal/unknown transition rolls back the refund in this same transaction.
  const result = await jobs.fail(input); await advanceBatchForJob(tx, input); return result;
}

function appearanceDescription(role: DramaPreparationValue['roles'][number]) { return role.description.trim() || `以选定参考图中的${role.name}为准。`; }
function appearanceFingerprint(scriptVersionId: string, role: DramaPreparationValue['roles'][number]) {
  return createHash('sha256').update(JSON.stringify({ scriptVersionId, key: role.key, name: role.name, usage: role.usage,
    description: appearanceDescription(role), referenceMaterialId: role.referenceMaterialId })).digest('hex');
}
async function preparationView(tx: postgres.TransactionSql, input: { userId: string; projectId: string }) {
  const store = createPreparationStore(tx); const draft = await store.get(input);
  const selections = await store.selections(input); const materials = createMaterialStore(tx);
  for (const role of draft.roles) {
    const selected = selections.find(item => item.role_key === role.key);
    if (!selected) continue;
    const material = await materials.get({ userId: input.userId, materialId: selected.reference_material_id });
    role.selection = { roleVersionId: selected.role_version_id, referenceMaterialId: material.id, referenceSha256: selected.reference_sha256,
      expiresAt: material.expiresAt, confirmedAt: selected.confirmed_at.toISOString(),
      status: material.status !== 'active' || Date.parse(material.expiresAt) <= Date.now() ? 'expired'
        : selected.script_version_id === draft.scriptVersionId && selected.fingerprint === appearanceFingerprint(draft.scriptVersionId, role) ? 'confirmed' : 'needs_confirmation' };
  }
  return DramaPreparation.parse(draft);
}
async function portraitView(tx: postgres.TransactionSql, userId: string, job: DramaImageJob) {
  if (job.target !== 'portrait' || !job.portrait || !job.projectId || !job.roleKey) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Portrait job not found');
  const input = { userId, projectId: job.projectId };
  const draft = await createPreparationStore(tx).get(input); const project = await createDramaStore(tx).getProject(input);
  const role = draft.roles.find(item => item.key === job.roleKey);
  const asset = await createDramaImageAssetStore(tx).metadata({ userId, jobId: job.id });
  const submission = await createDramaImageSubmissionStore(tx).get({ userId, jobId: job.id });
  return PortraitJobView.parse({ id: job.id, projectId: job.projectId, roleKey: job.roleKey, roleName: job.portrait.roleName, description: job.portrait.description,
    requestKey: job.requestKey, quoteVersion: job.portrait.quoteVersion, provider: job.portrait.binding.provider, status: job.status, submissionStatus: submission?.status ?? null,
    failureCode: job.failureCode, reservedCredits: job.reservedCredits, actualCredits: job.actualCredits, materialId: asset?.referenceMaterialId ?? null,
    current: !!role && role.usage === 'visual' && portraitContentKey(job.projectId, draft.scriptVersionId, project.look, role) === job.portrait.contentKey,
    createdAt: job.createdAt, expiresAt: asset?.expiresAt ?? null });
}
async function storyboardPlanView(tx: postgres.TransactionSql, userId: string, plan: { sourceKey: string; value: StoryboardPlanValue }) {
  try {
    const draft = await preparationView(tx, { userId, projectId: plan.value.projectId });
    plan.value.current = planSourceKey(draft) === plan.sourceKey && draft.roles.every(role => role.usage !== 'visual' || role.selection?.status === 'confirmed');
  } catch (error) { if (!(error instanceof DomainError && error.statusCode === 409)) throw error; }
  return plan.value;
}
async function planImageContext(tx: postgres.TransactionSql, input: { userId: string; planId: string }, lock = false) {
  const plans = createStoryboardPlanStore(tx); let record = await plans.get(input);
  if (lock) { await createPreparationStore(tx).get({ userId: input.userId, projectId: record.value.projectId }, true); record = await plans.get(input, true); }
  const plan = await storyboardPlanView(tx, input.userId, record); const project = await createDramaStore(tx).getProject({ userId: input.userId, projectId: plan.projectId });
  return { plan, project };
}
function planImageView(record: { sourceKey: string; value: PlanImageValue }, context: Awaited<ReturnType<typeof planImageContext>>) {
  const source = planImageSource(context.plan, record.value.shotKey, context.project);
  return { ...record.value, current: context.plan.current && source.shot.reviewed && source.sourceKey === record.sourceKey };
}
async function planVideoContext(tx: postgres.TransactionSql, input: { userId: string; candidateId: string; planRevision: number }, lock = false) {
  const store = createPlanImageStore(tx); let record = await store.get(input);
  const context = await planImageContext(tx, { userId: input.userId, planId: record.value.planId }, lock); record = await store.get(input);
  const source = planImageSource(context.plan, record.value.shotKey, context.project); assertPlanImageReady(context.plan, source, input.planRevision);
  if (record.sourceKey !== source.sourceKey || !record.value.selectedAt || record.value.status !== 'succeeded') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, '请选定当前分镜的有效图片。');
  const image = await createDramaImageAssetStore(tx).get({ userId: input.userId, jobId: record.value.jobId });
  if (lock) await createMaterialStore(tx).assertUsable(input.userId, source.references.map(role => role.referenceMaterialId));
  const snapshot = planVideoSnapshot(context.plan, record.value.shotKey, source.sourceKey, image, context.project.aspectRatio, spokenLines(source.shot.sourceText));
  snapshot.quoteVersion = planVideoQuoteVersion(snapshot); return { record, snapshot };
}
async function planExportManifest(tx: postgres.TransactionSql, input: CreateDramaExportJobInput): Promise<DramaExportPlanManifest> {
  if (!input.planId || !Number.isInteger(input.planRevision)) throw new DomainError(400, ErrorCode.VALIDATION, 'Plan revision required');
  const context = await planImageContext(tx, { userId: input.userId, planId: input.planId }, true);
  if (context.plan.projectId !== input.projectId || context.plan.revision !== input.planRevision || !context.plan.current) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, '分镜计划已变化，请重新读取。');
  const drafts = context.plan.shots.filter(shot => shot.episodeNumber === input.episodeNumber);
  if (!drafts.length) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, '本集没有分镜。');
  const selected = await createPlanImageStore(tx).selected({ userId: input.userId, planId: input.planId });
  const shots: DramaExportPlanManifest['shots'] = [];
  for (const draft of drafts.sort((a, b) => a.sceneNumber - b.sceneNumber || a.shotNumber - b.shotNumber)) {
    const record = selected.find(item => item.value.shotKey === draft.key);
    if (!record) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, '本集每一镜都需要选定图片并完成视频。');
    const { snapshot } = await planVideoContext(tx, { userId: input.userId, candidateId: record.value.candidateId, planRevision: input.planRevision! }, true);
    const [video] = await createDramaShotVideoStore(tx).listForCandidates({ userId: input.userId, candidateIds: [record.value.candidateId] });
    if (video?.status !== 'succeeded' || !video.plan || video.plan.sourceKey !== snapshot.sourceKey || video.plan.imageSha256 !== snapshot.imageSha256) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, '本集仍有视频未完成或画面已变化。');
    const asset = await createDramaShotVideoAssetStore(tx).get({ userId: input.userId, jobId: video.id });
    shots.push({ shotId: video.shotId, sceneNumber: draft.sceneNumber, shotNumber: draft.shotNumber, candidateId: video.candidateId, scriptVersionId: video.plan.scriptVersionId,
      roleVersionIds: video.plan.roleVersionIds, sourceText: video.plan.sourceText, spokenLines: video.plan.spokenLines,
      videoJobId: video.id, videoAssetId: asset.id, objectKey: asset.objectKey, sha256: asset.sha256, byteLength: asset.byteLength, width: asset.width, height: asset.height, durationMs: asset.durationMs });
  }
  return { formatVersion: 2, projectId: input.projectId, planId: input.planId, planRevision: input.planRevision!, episodeNumber: input.episodeNumber,
    scriptVersionId: context.plan.scriptVersionId, look: context.project.look, aspectRatio: context.project.aspectRatio, audioMode: 'silent_preview', shots };
}
function validatePortraitOffer(offer: PortraitOffer) {
  if (!Number.isSafeInteger(offer.credits) || offer.credits < 1 || !['mock', 'atlas'].includes(offer.binding.provider) || !/^portrait:[a-f0-9]{64}$/.test(offer.binding.providerKey) || !offer.binding.model || offer.binding.model.length > 200) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid portrait offer');
}

/** Only this composition layer holds raw transaction handles across modules. */
async function requireNativeJob(tx: postgres.TransactionSql, input: GenerationLocator, lock = false) {
  const job = await createGenerationStore(tx).get(input, lock);
  if (job.durationSec !== 10 || !job.nativeQuoteVersion) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Native job not found'); return job;
}
async function nativeMarketingQuote(tx: postgres.TransactionSql, input: { userId: string; request: NativeMarketingInputValue; mockAvailable: boolean; offer?: NativeMarketingOffer }): Promise<NativeMarketingQuoteValue> {
  const parsed = NativeMarketingInput.safeParse(input.request);
  if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid native marketing quote');
  const request = { ...parsed.data, materialIds: normalizeMaterialIds(parsed.data.materialIds) };
  const materials = [];
  for (const id of request.materialIds) {
    const material = await createMaterialStore(tx).get({ userId: input.userId, materialId: id });
    if (material.status !== 'active' || Date.parse(material.expiresAt) <= Date.now()) throw new DomainError(409, ErrorCode.MATERIAL_EXPIRED, 'Material expired');
    if (!input.mockAvailable && input.offer) {
      if (material.width < 300 || material.height < 300 || material.width > 6000 || material.height > 6000 || material.width / material.height < 0.4 || material.width / material.height > 2.5) throw new DomainError(400, ErrorCode.NATIVE_MATERIAL_UNSUPPORTED, 'Reference dimensions are outside native model limits');
      if (Date.parse(material.expiresAt) - Date.now() < 300000) throw new DomainError(409, ErrorCode.MATERIAL_EXPIRED, 'Reference expires before provider retrieval window');
    }
    materials.push({ id, sha256: material.sha256, expiresAt: material.expiresAt });
  }
  const source = request.copyJobId ? await createMarketingCopyStore(tx).sourceForVideo({ userId: input.userId, jobId: request.copyJobId, category: request.category }) : null;
  if (input.offer && (!Number.isSafeInteger(input.offer.credits) || input.offer.credits < 1 || !/^[a-f0-9]{64}$/.test(input.offer.binding))) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Explicit native pricing and binding required');
  const real = !input.mockAvailable && input.offer; const credits = input.mockAvailable ? 7 : real ? real.credits : null;
  return { settlementPoint: 'preview', category: request.category, resolution: '720p', aspectRatio: '9:16', durationSec: 10,
    available: input.mockAvailable || !!real, mode: input.mockAvailable ? 'mock' : real ? 'atlas' : 'disabled', credits,
    version: input.mockAvailable ? createHash('sha256').update(JSON.stringify({ revision: 2, settlementPoint: 'preview', userId: input.userId, request, materials, source, credits, provider: 'mock' })).digest('hex') : real ? createHash('sha256').update(JSON.stringify({ revision: 3, settlementPoint: 'preview', userId: input.userId, request, materials, source, credits, binding: real.binding, model: request.materialIds.length ? NATIVE_VIDEO_REFERENCE_MODEL : NATIVE_VIDEO_TEXT_MODEL })).digest('hex') : null };
}

export function createServices(databaseUrl: string): Services {
  const connection = postgres(databaseUrl, {
    max: 20,
    connect_timeout: 5,
    idle_timeout: 20,
    connection: { statement_timeout: 15000, lock_timeout: 10000 },
  });
  const mutate = async (userId: string, operation: (store: BillingStore) => Promise<void>, requireActive: boolean) => {
    await connection.begin(async tx => {
      // Consistent acquisition order for new spending: identity, then wallet.
      if (requireActive) await createIdentityStore(tx).assertActive(userId);
      await operation(createBillingStore(tx));
    });
  };
  return {
    identity: {
      async bootstrapGuest(credential) {
        return connection.begin(async tx => {
          const { session, created } = await createIdentityStore(tx).bootstrap(credential);
          if (created) {
            await tx`insert into wb_next.wallets (user_id) values (${session.userId})`;
            await createBillingStore(tx).grant({
              userId: session.userId, billingKey: `signup:${session.userId}`,
              amount: SIGNUP_GRANT_CREDITS, remark: '注册赠送',
            });
          }
          return session;
        });
      },
      async authenticate(token) {
        return connection.begin('read only', tx => createIdentityStore(tx).authenticate(token));
      },
      async deactivate(userId) {
        await connection.begin(tx => createIdentityStore(tx).deactivate(userId));
      },
    },
    billing: {
      grant: input => mutate(input.userId, store => store.grant(input), true),
      reserve: input => mutate(input.userId, store => store.reserve(input), true),
      // Revoking login must not strand an already funded generation reservation.
      settle: input => mutate(input.userId, store => store.settle(input), false),
      refund: input => mutate(input.userId, store => store.refund(input), false),
      summary: userId => connection.begin('isolation level repeatable read read only', tx => createBillingStore(tx).summary(userId)),
      entries: input => connection.begin('isolation level repeatable read read only', tx => createBillingStore(tx).entries(input)),
    },
    nativeMedia: {
      get: input => connection.begin('read only', async tx => { await requireNativeJob(tx, input); return createNativeMediaStore(tx).get(input.jobId); }),
      capture: input => connection.begin(async tx => {
        const job = await requireNativeJob(tx, input, true); if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Native job is terminal');
        const receipt = await createSubmissionStore(tx).get(input); if (receipt?.status !== 'submitted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Provider receipt required');
        const media = await createNativeMediaStore(tx).capture(input);
        if (job.settlementPoint === 'preview' && job.actualCredits === null) {
          await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`, actual: job.reservedCredits });
          await createGenerationStore(tx).recordNativePreviewCharge(input);
        }
        return media;
      }),
      recognize: input => connection.begin(async tx => { const job = await requireNativeJob(tx, input, true); if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Native job is terminal'); return createNativeMediaStore(tx).recognize(input); }),
      issue: input => connection.begin(async tx => { const job = await requireNativeJob(tx, input, true); if (job.status === 'accepted') await createNativeMediaStore(tx).issue(input.jobId, input.issue); }),
      confirm: input => connection.begin(async tx => {
        const job = await requireNativeJob(tx, input, true); if (job.status === 'failed') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Native job failed');
        const result = await createNativeMediaStore(tx).confirm(input.jobId, input.request);
        if (job.status === 'accepted') await createGenerationStore(tx).requestResume(input.jobId); return result;
      }),
      resume: input => connection.begin(async tx => { const job = await requireNativeJob(tx, input, true); if (job.status === 'accepted') await createGenerationStore(tx).requestResume(input.jobId); }),
      publish: input => connection.begin(async tx => {
        const job = await requireNativeJob(tx, input, true); const media = await createNativeMediaStore(tx).get(input.jobId);
        if (!media || media.state !== 'ready' || media.revision !== input.revision || media.sha256 !== input.sourceSha256) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Confirmed caption version required');
        const assets = createAssetStore(tx); const existing = await assets.find(input); if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted' || Date.parse(media.expiresAt) <= Date.now()) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Native source unavailable');
        if (input.width !== media.width || input.height !== media.height || Math.abs(input.durationMs - media.durationMs) > 300) throw new DomainError(400, ErrorCode.VALIDATION, 'Rendered media differs from source');
        const asset = await assets.insert(input, 10600);
        await createNativeMediaStore(tx).clearIssue(input.jobId);
        if (job.actualCredits === null) await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`, actual: job.reservedCredits });
        await createGenerationStore(tx).complete({ ...input, outputRef: `asset:${asset.id}`, actualCredits: job.reservedCredits }); return asset;
      }),
    },
    nativeMarketing: {
      quote: input => connection.begin('isolation level repeatable read read only', tx => nativeMarketingQuote(tx, input)),
      create: input => connection.begin(async tx => {
        const parsed = SubmitNativeMarketing.safeParse(input.request);
        if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid native marketing input');
        await createIdentityStore(tx).assertActive(input.userId);
        const { quoteVersion, ...request } = parsed.data;
        const create = { ...request, userId: input.userId, materialIds: normalizeMaterialIds(request.materialIds) };
        const store = createGenerationStore(tx); const existing = await store.findRequest(create);
        if (existing) {
          if (existing.nativeQuoteVersion !== quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Original quote differs');
          return existing;
        }
        const { requestKey: _requestKey, ...quoteInput } = request;
        const quote = await nativeMarketingQuote(tx, { ...input, request: quoteInput });
        if (!quote.available || !quote.credits) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Native marketing unavailable');
        if (quote.version !== quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Content or quote changed');
        await createMaterialStore(tx).assertUsable(input.userId, create.materialIds);
        const id = randomUUID(); const binding = quote.mode === 'atlas' ? input.offer!.binding : undefined;
        const model = binding ? (create.materialIds.length ? NATIVE_VIDEO_REFERENCE_MODEL : NATIVE_VIDEO_TEXT_MODEL) : create.materialIds.length ? 'mock-native:reference' : 'mock-native:text';
        await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `generation:${id}`, estimate: quote.credits, model, estimatedCostCents: binding ? null : 0 });
        return store.insert(create, id, quote.credits, model, quoteVersion, binding);
      }),
    },
    generation: {
      list: input => connection.begin('read only', tx => createGenerationStore(tx).list(input)),
      create: input => connection.begin(async tx => {
        if (input.durationSec !== 5) throw new DomainError(400, ErrorCode.VALIDATION, 'Use the native marketing admission path');
        await createIdentityStore(tx).assertActive(input.userId);
        const store = createGenerationStore(tx);
        const existing = await store.findRequest(input);
        if (existing) return existing;
        const id = randomUUID();
        const estimate = estimateCreditsFor(input.resolution);
        const model = VIDEO_PRICING[input.resolution].model;
        await createBillingStore(tx).reserve({
          userId: input.userId, billingKey: `generation:${id}`, estimate, model,
          // Current pricing contract specifies selling price = estimated cost times two.
          estimatedCostCents: Math.ceil(estimate / 2),
        });
        await createMaterialStore(tx).assertUsable(input.userId, input.materialIds ?? []);
        if (input.copyJobId) await createMarketingCopyStore(tx).sourceForVideo({ userId: input.userId, jobId: input.copyJobId, category: input.category });
        return store.insert(input, id, estimate, model);
      }),
      get: input => connection.begin('read only', async tx => {
        const job = await createGenerationStore(tx).get(input);
        if (job.copyJobId) job.sourceFacts = await createMarketingCopyStore(tx).sourceForVideo({ userId: input.userId, jobId: job.copyJobId, category: job.category });
        return job;
      }),
      complete: input => connection.begin(async tx => {
        const store = createGenerationStore(tx);
        const existing = await store.prepareComplete(input);
        if (existing.durationSec === 10) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Use confirmed native media publication');
        if (existing.status === 'succeeded') return existing;
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`,
          actual: input.actualCredits, actualCostCents: input.actualCostCents });
        return store.complete(input);
      }),
      fail: input => connection.begin(async tx => {
        const store = createGenerationStore(tx);
        const existing = await store.prepareFail(input);
        if (existing.status === 'failed') return existing;
        await createBillingStore(tx).refund({ userId: input.userId, billingKey: `generation:${input.jobId}` });
        return store.fail(input);
      }),
    },
    assets: {
      get: input => connection.begin('read only', tx => createAssetStore(tx).get(input)),
      publish: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const job = await generation.get(input, true);
        if (job.durationSec === 10) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Use confirmed native media publication');
        const assets = createAssetStore(tx);
        const existing = await assets.find(input);
        if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Generation cannot publish media');
        const asset = await assets.insert(input);
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`, actual: job.reservedCredits });
        await generation.complete({ ...input, outputRef: `asset:${asset.id}`, actualCredits: job.reservedCredits });
        return asset;
      }),
    },
    providerSubmissions: {
      get: input => connection.begin('read only', tx => createSubmissionStore(tx).get(input)),
      begin: input => connection.begin(tx => createSubmissionStore(tx).begin(input)),
      accepted: input => connection.begin(tx => createSubmissionStore(tx).accepted(input)),
      unknown: input => connection.begin(tx => createSubmissionStore(tx).unknown(input)),
      reject: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const failure = { userId: input.userId, jobId: input.jobId, failureCode: 'PROVIDER_REJECTED' };
        const job = await generation.prepareFail(failure);
        const submission = await createSubmissionStore(tx).reject(input);
        if (job.status !== 'failed') {
          await createBillingStore(tx).refund({ userId: input.userId, billingKey: `generation:${input.jobId}` });
          await generation.fail(failure);
        }
        return submission;
      }),
    },
    materials: {
      register: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createMaterialStore(tx).insert(input);
      }),
      get: input => connection.begin('read only', tx => createMaterialStore(tx).get(input)),
      listForJob: input => connection.begin('read only', tx => {
        const materials = createMaterialStore(tx);
        return materials.listForJob(input);
      }),
      sweepExpired: () => connection.begin(tx => createMaterialStore(tx).sweepExpired()),
    },
    marketingCopies: {
      quote: input => connection.begin('read only', tx => createMarketingCopyStore(tx).quote(input)),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId); const store = createMarketingCopyStore(tx); const job = await store.create(input);
        const found = await store.row({ userId: input.userId, jobId: job.id }, true);
        if (found.billing_state === 'held') await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `marketing-copy:${found.id}`, estimate: Number(found.reserved_credits), model: found.binding!.model, estimatedCostCents: found.estimated_cost_cents === null ? null : Number(found.estimated_cost_cents) });
        return job;
      }),
      get: input => connection.begin('read only', tx => createMarketingCopyStore(tx).get(input)),
      latest: input => connection.begin('read only', tx => createMarketingCopyStore(tx).latest(input)),
      snapshot: input => connection.begin('read only', tx => createMarketingCopyStore(tx).snapshot(input)),
      response: input => connection.begin('read only', tx => createMarketingCopyStore(tx).response(input)),
      begin: input => connection.begin(tx => createMarketingCopyStore(tx).begin(input)),
      record: input => connection.begin(tx => createMarketingCopyStore(tx).record(input)),
      unknown: input => connection.begin(tx => createMarketingCopyStore(tx).unknown(input)),
      receive: input => connection.begin(async tx => {
        const store = createMarketingCopyStore(tx); const result = await store.receive(input);
        if (!result.terminal && result.job.provider === 'atlas') {
          const billing = createBillingStore(tx); const billingKey = `marketing-copy:${result.job.id}`;
          if (result.success) await billing.settle({ userId: input.userId, billingKey, actual: result.job.reservedCredits }); else await billing.refund({ userId: input.userId, billingKey });
        }
        return result.job;
      }),
      reject: input => connection.begin(async tx => {
        const store = createMarketingCopyStore(tx); const job = await store.row(input, true);
        await store.reject(input); if (job.billing_state === 'held') await createBillingStore(tx).refund({ userId: input.userId, billingKey: `marketing-copy:${job.id}` });
      }),
    },
    marketingCopyOutbox: {
      claim: () => connection.begin(tx => createMarketingCopyStore(tx).claim()),
      ack: input => connection.begin(tx => createMarketingCopyStore(tx).ack(input)),
      release: input => connection.begin(tx => createMarketingCopyStore(tx).release(input)),
    },
    opsCopyReview: {
      list: () => connection.begin('read only', tx => createMarketingCopyStore(tx).listReviews()),
      resolve: input => connection.begin(async tx => {
        const store = createMarketingCopyStore(tx); const prepared = await store.prepareReview(input.jobId, input.request);
        const token = { userId: prepared.found.user_id, jobId: input.jobId, token: prepared.found.token! };
        if (!prepared.replay) {
          if (prepared.request.action === 'receipt') await store.record({ ...token, response: prepared.request.response });
          else { await store.reject(token); if (prepared.found.billing_state === 'held') await createBillingStore(tx).refund({ userId: token.userId, billingKey: `marketing-copy:${input.jobId}` }); }
          await store.reviewRecorded(input.jobId, prepared.hash, prepared.found.submission_state!, prepared.request);
        }
        return store.get(token);
      }),
    },
    scriptBatches: {
      quote: input => connection.begin('read only', async tx => (await createScriptBatchStore(tx).offer(input)).quote),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId); await createDramaStore(tx).lockProject(input);
        const batches = createScriptBatchStore(tx); const replay = await batches.findRequest(input); if (replay) return replay;
        const prepared = await batches.offer(input); const inserted = await batches.insert(input, prepared);
        for (const child of inserted.inserted) if (child.credits) await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `drama-script:${child.id}`, estimate: child.credits, model: child.model, estimatedCostCents: input.admission.offer!.estimatedCostCents });
        await advanceScriptBatch(tx, { userId: input.userId, projectId: input.projectId, batchId: inserted.id });
        return batches.get({ userId: input.userId, batchId: inserted.id });
      }),
      latest: input => connection.begin('read only', tx => createScriptBatchStore(tx).latest(input)),
      get: input => connection.begin('read only', tx => createScriptBatchStore(tx).get(input)),
      advance: input => connection.begin(async tx => { await advanceBatchForJob(tx, input); }),
    },
    dramaScripts: {
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const jobs = createDramaScriptStore(tx);
        const result = await jobs.create(input);
        const stored = await jobs.lock({ userId: input.userId, jobId: result.id });
        if (stored.quote && stored.billing_state === 'held') await createBillingStore(tx).reserve({ userId: input.userId,
          billingKey: `drama-script:${stored.id}`, estimate: stored.quote.credits, model: stored.binding!.model, estimatedCostCents: stored.quote.estimatedCostCents });
        return result;
      }),
      quote: input => connection.begin('read only', tx => createDramaScriptStore(tx).quote(input)),
      get: input => connection.begin('read only', tx => createDramaScriptStore(tx).get(input)),
      latest: input => connection.begin('read only', tx => createDramaScriptStore(tx).latest(input)),
      snapshot: input => connection.begin('read only', tx => createDramaScriptStore(tx).snapshot(input)),
      complete: input => connection.begin(tx => completeScript(tx, input)),
      response: input => connection.begin('read only', tx => createDramaScriptStore(tx).response(input)),
      beginSubmission: input => connection.begin(tx => createDramaScriptStore(tx).beginSubmission(input)),
      recordResponse: input => connection.begin(tx => createDramaScriptStore(tx).recordResponse(input)),
      submissionUnknown: input => connection.begin(tx => createDramaScriptStore(tx).submissionUnknown(input)),
      rejectSubmission: input => connection.begin(async tx => {
        const jobs = createDramaScriptStore(tx); const initial = await jobs.get(input);
        await createDramaStore(tx).lockProject({ userId: input.userId, projectId: initial.projectId });
        const existing = await jobs.lock(input);
        if (existing.billing_state === 'held') await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-script:${existing.id}` });
        const result = await jobs.rejectSubmission(input); await advanceBatchForJob(tx, input); return result;
      }),
      receive: input => connection.begin(async tx => {
        const parsed = TextGenerationReceipt.safeParse(input.response);
        if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid script response');
        const response = parsed.data;
        const jobs = createDramaScriptStore(tx); const initial = await jobs.get(input);
        const project = await createDramaStore(tx).lockProject({ userId: input.userId, projectId: initial.projectId });
        const existing = await jobs.lock(input);
        if (response.provider !== (existing.binding?.provider ?? 'mock') || (existing.binding && (response.model !== existing.binding.model || existing.submission_state !== 'received' || !existing.response))) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script response provider mismatch or receipt missing');
        if (existing.response) {
          if (JSON.stringify(TextGenerationReceipt.parse(existing.response)) !== JSON.stringify(response)) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script response conflicts');
          if (existing.status !== 'accepted') return jobs.get(input);
        }
        if (existing.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Script job already terminal');
        await jobs.saveResponse(input, response);
        const failureCode = response.finishReason !== 'stop' ? 'SCRIPT_OUTPUT_INCOMPLETE'
          : !response.text.trim() ? 'SCRIPT_OUTPUT_EMPTY'
            : response.textTruncated || response.text.length > 20000 ? 'SCRIPT_OUTPUT_TOO_LONG'
              : project.active_version_id ? 'SCRIPT_PROJECT_CONFIRMED' : null;
        if (failureCode) return failScript(tx, { ...input, failureCode });
        return completeScript(tx, { ...input, content: response.text }, true);
      }),
      fail: input => connection.begin(tx => failScript(tx, input)),
      confirm: input => connection.begin(async tx => {
        ConfirmDramaScript.parse({ versionId: input.versionId });
        await createIdentityStore(tx).assertActive(input.userId);
        const drama = createDramaStore(tx);
        await drama.lockProject(input);
        const draftScriptId = await createDramaScriptStore(tx).draftScriptId(input);
        return drama.confirmScript({ ...input, draftScriptId });
      }),
    },
    dramaScriptOutbox: {
      claim: () => connection.begin(tx => createDramaScriptStore(tx).claim()),
      ack: input => connection.begin(tx => createDramaScriptStore(tx).ack(input)),
      release: input => connection.begin(tx => createDramaScriptStore(tx).release(input)),
    },
    drama: {
      getPreparation: input => connection.begin('isolation level repeatable read read only', tx => preparationView(tx, input)),
      savePreparation: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const saved = await createPreparationStore(tx).save(input);
        for (const id of new Set(saved.roles.flatMap(role => role.referenceMaterialId ? [role.referenceMaterialId] : []))) {
          // Drafts may retain an expired owned reference; adoption performs the active/expiry check.
          await createMaterialStore(tx).get({ userId: input.userId, materialId: id });
        }
        return preparationView(tx, input);
      }),
      confirmRoleAppearance: input => connection.begin(async tx => {
        const parsed = ConfirmRoleAppearance.safeParse(input.confirmation);
        if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid appearance confirmation');
        await createIdentityStore(tx).assertActive(input.userId);
        const preparation = createPreparationStore(tx); const draft = await preparation.get(input, true); const confirmation = parsed.data;
        if (draft.scriptVersionId !== confirmation.scriptVersionId || draft.revision !== confirmation.preparationRevision) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Preparation changed; reload before confirming');
        const selectedRole = draft.roles.find(role => role.key === confirmation.roleKey);
        if (!selectedRole) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Preparation role not found');
        if (selectedRole.usage !== 'visual' || !selectedRole.referenceMaterialId) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Visual role requires a reference image');
        const materials = createMaterialStore(tx);
        await materials.assertUsable(input.userId, [selectedRole.referenceMaterialId]);
        const material = await materials.get({ userId: input.userId, materialId: selectedRole.referenceMaterialId });
        const fingerprint = appearanceFingerprint(draft.scriptVersionId, selectedRole);
        const existing = (await preparation.selections(input)).find(item => item.role_key === selectedRole.key);
        if (existing?.fingerprint === fingerprint && existing.script_version_id === draft.scriptVersionId && existing.reference_sha256 === material.sha256) return preparationView(tx, input);
        const drama = createDramaStore(tx); const role = await drama.roleByName({ ...input, name: selectedRole.name });
        const description = appearanceDescription(selectedRole);
        const reference = { userId: input.userId, description, referenceMaterialId: material.id, referenceSha256: material.sha256 };
        const version = !role ? (await drama.createRole({ ...reference, projectId: input.projectId, name: selectedRole.name })).latestVersion
          : role.latestVersion.referenceMaterialId === material.id && role.latestVersion.referenceSha256 === material.sha256 && role.latestVersion.description === description ? role.latestVersion
            : await drama.reviseRole({ ...reference, roleId: role.id });
        await preparation.selectAppearance({ ...input, roleKey: selectedRole.key, scriptVersionId: draft.scriptVersionId, roleVersionId: version.id, fingerprint });
        return preparationView(tx, input);
      }),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).create(input);
      }),
      getProject: input => connection.begin('read only', tx => createDramaStore(tx).getProject(input)),
      listProjects: input => connection.begin('read only', tx => createDramaStore(tx).listProjects(input)),
      listScripts: input => connection.begin('read only', tx => createDramaStore(tx).listScripts(input)),
      getScript: input => connection.begin('read only', tx => createDramaStore(tx).getScript(input)),
      repairScript: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).repairScript(input);
      }),
      getWorkflow: input => connection.begin('read only', tx => createDramaStore(tx).getWorkflow(input)),
      createRole: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const materials = createMaterialStore(tx);
        await materials.assertUsable(input.userId, [input.referenceMaterialId]);
        const material = await materials.get({ userId: input.userId, materialId: input.referenceMaterialId });
        return createDramaStore(tx).createRole({ ...input, referenceSha256: material.sha256 });
      }),
      reviseRole: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const materials = createMaterialStore(tx);
        await materials.assertUsable(input.userId, [input.referenceMaterialId]);
        const material = await materials.get({ userId: input.userId, materialId: input.referenceMaterialId });
        return createDramaStore(tx).reviseRole({ ...input, referenceSha256: material.sha256 });
      }),
      createScene: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).createScene(input);
      }),
      reviseScene: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).reviseScene(input);
      }),
      createShot: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).createShot(input);
      }),
      createCandidate: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const drama = createDramaStore(tx);
        const materialId = await drama.candidateReferenceMaterialId(input);
        await createMaterialStore(tx).assertUsable(input.userId, [materialId]);
        return drama.createCandidate(input);
      }),
      selectCandidate: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        return createDramaStore(tx).selectCandidate(input);
      }),
      selectedCandidateForShot: input => connection.begin('read only', tx => createDramaStore(tx).selectedCandidateForShot(input)),
    },
    planImages: {
      quote: input => connection.begin('read only', async tx => {
        const request = PlanImageRequest.parse(input.request); const context = await planImageContext(tx, input);
        const source = planImageSource(context.plan, request.shotKey, context.project); assertPlanImageReady(context.plan, source, request.planRevision);
        return input.mockAvailable ? { mode: 'mock' as const, credits: PLAN_IMAGE_TEST_CREDITS, version: source.quoteVersion } : { mode: 'disabled' as const, credits: null, version: null };
      }),
      create: input => connection.begin(async tx => {
        const request = SubmitPlanImage.parse(input.request); await createIdentityStore(tx).assertActive(input.userId);
        const store = createPlanImageStore(tx); const existing = await store.findRequest({ ...input, request });
        if (existing) return planImageView(existing, await planImageContext(tx, { userId: input.userId, planId: existing.value.planId }));
        const context = await planImageContext(tx, input, true); const source = planImageSource(context.plan, request.shotKey, context.project);
        assertPlanImageReady(context.plan, source, request.planRevision);
        if (!input.mockAvailable) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, '分镜图片生成暂未开放。');
        if (source.quoteVersion !== request.quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, '分镜或报价已变化，请重新确认。');
        await createMaterialStore(tx).assertUsable(input.userId, source.references.map(role => role.referenceMaterialId));
        const candidateId = await store.createCandidate({ userId: input.userId, plan: context.plan, source }); const id = randomUUID();
        await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `drama-image:${id}`, estimate: PLAN_IMAGE_TEST_CREDITS, model: PLAN_IMAGE_MODEL, estimatedCostCents: null });
        await createDramaImageStore(tx).insert({ userId: input.userId, candidateId, requestKey: request.requestKey }, id, PLAN_IMAGE_TEST_CREDITS, PLAN_IMAGE_MODEL);
        return planImageView(await store.get({ userId: input.userId, candidateId }), context);
      }),
      list: input => connection.begin('isolation level repeatable read read only', async tx => {
        const context = await planImageContext(tx, input); planImageSource(context.plan, input.shotKey, context.project);
        const page = await createPlanImageStore(tx).list(input); return { items: page.records.map(record => planImageView(record, context)), nextCursor: page.nextCursor };
      }),
      select: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId); const store = createPlanImageStore(tx); const record = await store.get(input);
        const context = await planImageContext(tx, { userId: input.userId, planId: record.value.planId }, true);
        const source = planImageSource(context.plan, record.value.shotKey, context.project); assertPlanImageReady(context.plan, source, input.planRevision);
        if (record.sourceKey !== source.sourceKey || record.value.status !== 'succeeded') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, '请使用当前分镜已生成的图片。');
        await createDramaImageAssetStore(tx).get({ userId: input.userId, jobId: record.value.jobId });
        await createMaterialStore(tx).assertUsable(input.userId, source.references.map(role => role.referenceMaterialId));
        return planImageView(await store.select(input), context);
      }),
    },
    storyboardPlans: {
      production: input => connection.begin('isolation level repeatable read read only', async tx => {
        const context = await planImageContext(tx, input); return buildDramaProductionPlan(context.plan, context.project.episodeCount);
      }),
      create: input => connection.begin(async tx => {
        const request = CreateStoryboardPlan.parse(input.request); await createIdentityStore(tx).assertActive(input.userId);
        await createPreparationStore(tx).get(input, true); const draft = await preparationView(tx, input);
        if (draft.scriptVersionId !== request.scriptVersionId || draft.revision !== request.preparationRevision || draft.roles.some(role => role.usage === 'visual' && role.selection?.status !== 'confirmed')) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Save preparation and confirm all visual roles first');
        await createMaterialStore(tx).assertUsable(input.userId, draft.roles.flatMap(role => role.usage === 'visual' ? [role.selection!.referenceMaterialId] : []));
        const project = await createDramaStore(tx).getProject(input); const snapshot = planSnapshot(draft); const shots = deriveStoryboardShots(project.activeVersion!.content, draft);
        if (!shots.length || shots.length > 1000) throw new DomainError(400, ErrorCode.VALIDATION, 'Script has too many or no storyboard blocks');
        StoryboardPlan.shape.shots.parse(shots);
        const plan = await createStoryboardPlanStore(tx).create({ ...input, snapshot, shots, sourceKey: planSourceKey(draft) });
        return { ...plan.value, current: true };
      }),
      latest: input => connection.begin('read only', async tx => {
        await createDramaStore(tx).getProject(input); const plan = await createStoryboardPlanStore(tx).latest(input); return plan ? storyboardPlanView(tx, input.userId, plan) : null;
      }),
      get: input => connection.begin('read only', async tx => storyboardPlanView(tx, input.userId, await createStoryboardPlanStore(tx).get(input))),
      update: input => connection.begin(async tx => {
        const request = UpdateStoryboardPlanShot.parse(input.request); await createIdentityStore(tx).assertActive(input.userId);
        const store = createStoryboardPlanStore(tx); const plan = await store.get(input);
        const projectInput = { userId: input.userId, projectId: plan.value.projectId }; await createPreparationStore(tx).get(projectInput, true);
        if (!(await storyboardPlanView(tx, input.userId, plan)).current) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Preparation changed; organize a new storyboard draft');
        await createMaterialStore(tx).assertUsable(input.userId, plan.value.roles.flatMap(role => role.referenceMaterialId ? [role.referenceMaterialId] : []));
        const saved = await store.update({ ...input, request }); return { ...saved.value, current: true };
      }),
    },
    rolePortraits: {
      quote: input => connection.begin('read only', async tx => {
        const request = PortraitRequest.parse(input.request); const draft = await createPreparationStore(tx).get(input);
        const project = await createDramaStore(tx).getProject(input); const role = draft.roles.find(item => item.key === request.roleKey);
        if (!role) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Preparation role not found');
        if (draft.revision !== request.preparationRevision) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Preparation changed');
        if (!input.offer || role.usage !== 'visual') return { mode: 'disabled' as const, credits: null, version: null };
        validatePortraitOffer(input.offer);
        const snapshot = portraitSnapshot(input.projectId, draft, project.look, role, input.offer.binding, input.offer.credits);
        return { mode: input.offer.binding.provider, credits: input.offer.credits, version: snapshot.quoteVersion };
      }),
      create: input => connection.begin(async tx => {
        const request = SubmitPortrait.parse(input.request); await createIdentityStore(tx).assertActive(input.userId);
        const images = createDramaImageStore(tx); const existing = await images.findPortraitRequest({ userId: input.userId, projectId: input.projectId, ...request });
        if (existing) return portraitView(tx, input.userId, existing);
        const draft = await createPreparationStore(tx).get(input, true); const project = await createDramaStore(tx).getProject(input);
        const role = draft.roles.find(item => item.key === request.roleKey);
        if (!role) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Preparation role not found');
        if (!input.offer) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Portrait generation unavailable');
        validatePortraitOffer(input.offer);
        const snapshot = portraitSnapshot(input.projectId, draft, project.look, role, input.offer.binding, input.offer.credits);
        if (role.usage !== 'visual' || draft.revision !== request.preparationRevision || snapshot.quoteVersion !== request.quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Portrait quote changed');
        const id = randomUUID();
        await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `drama-image:${id}`, estimate: input.offer.credits, model: snapshot.binding.model, estimatedCostCents: null });
        const job = await images.insertPortrait({ userId: input.userId, projectId: input.projectId, roleKey: request.roleKey, requestKey: request.requestKey, id, credits: input.offer.credits, snapshot });
        return portraitView(tx, input.userId, job);
      }),
      get: input => connection.begin('read only', async tx => portraitView(tx, input.userId, await createDramaImageStore(tx).get(input))),
      list: input => connection.begin('isolation level repeatable read read only', async tx => {
        await createDramaStore(tx).getProject(input); const page = await createDramaImageStore(tx).listPortraits(input);
        return { items: await Promise.all(page.items.map(job => portraitView(tx, input.userId, job))), nextCursor: page.nextCursor };
      }),
      select: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const job = await createDramaImageStore(tx).get(input);
        if (job.target !== 'portrait' || !job.projectId || !job.roleKey || !job.portrait) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Portrait job not found');
        const projectInput = { userId: input.userId, projectId: job.projectId }; const store = createPreparationStore(tx);
        const draft = await store.get(projectInput, true); const project = await createDramaStore(tx).getProject(projectInput);
        const role = draft.roles.find(item => item.key === job.roleKey);
        if (job.status !== 'succeeded' || !role || role.usage !== 'visual' || portraitContentKey(job.projectId, draft.scriptVersionId, project.look, role) !== job.portrait.contentKey) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Portrait no longer matches preparation');
        const asset = await createDramaImageAssetStore(tx).get(input);
        if (!asset.referenceMaterialId) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Portrait reference not ready');
        await createMaterialStore(tx).assertUsable(input.userId, [asset.referenceMaterialId]);
        if (role.referenceMaterialId === asset.referenceMaterialId) return preparationView(tx, projectInput);
        if (draft.revision !== input.preparationRevision) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Preparation revision changed');
        const data = SaveDramaPreparation.parse({ scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
          roles: draft.roles.map(({ key, name, description, usage, referenceMaterialId }) => ({ key, name, description, usage, referenceMaterialId: key === job.roleKey ? asset.referenceMaterialId : referenceMaterialId })),
          scenes: draft.scenes.map(({ key, description }) => ({ key, description })) });
        await store.save({ ...projectInput, draft: data }); return preparationView(tx, projectInput);
      }),
    },
    dramaImages: {
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const images = createDramaImageStore(tx);
        const existing = await images.findRequest(input);
        if (existing) return existing;
        const materialId = await createDramaStore(tx).candidateReferenceMaterialIdForCandidate({ userId: input.userId, candidateId: input.candidateId });
        await createMaterialStore(tx).assertUsable(input.userId, [materialId]);
        const id = randomUUID();
        await createBillingStore(tx).reserve({
          userId: input.userId, billingKey: `drama-image:${id}`, estimate: DRAMA_IMAGE_PRICING.credits,
          model: DRAMA_IMAGE_PRICING.model, estimatedCostCents: DRAMA_IMAGE_PRICING.estimatedCostCents,
        });
        return images.insert(input, id, DRAMA_IMAGE_PRICING.credits, DRAMA_IMAGE_PRICING.model);
      }),
      get: input => connection.begin('read only', tx => createDramaImageStore(tx).get(input)),
      complete: input => connection.begin(async tx => {
        const images = createDramaImageStore(tx);
        const existing = await images.prepareComplete(input);
        if (existing.target === 'portrait' || existing.model === PLAN_IMAGE_MODEL) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Image must publish validated media');
        if (existing.status === 'succeeded') return existing;
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `drama-image:${input.jobId}`,
          actual: input.actualCredits, actualCostCents: input.actualCostCents });
        return images.complete(input);
      }),
      fail: input => connection.begin(async tx => {
        const images = createDramaImageStore(tx);
        const existing = await images.prepareFail(input);
        if (existing.status === 'failed') return existing;
        if (existing.target === 'portrait') {
          const submission = await createDramaImageSubmissionStore(tx).get(input);
          if (!submission || !['submitted', 'rejected'].includes(submission.status)) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Unknown portrait submission cannot refund');
        }
        await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-image:${input.jobId}` });
        return images.fail(input);
      }),
    },
    dramaImageSubmissions: {
      get: input => connection.begin('read only', tx => createDramaImageSubmissionStore(tx).get(input)),
      begin: input => connection.begin(tx => createDramaImageSubmissionStore(tx).begin(input)),
      accepted: input => connection.begin(tx => createDramaImageSubmissionStore(tx).accepted(input)),
      unknown: input => connection.begin(tx => createDramaImageSubmissionStore(tx).unknown(input)),
      reject: input => connection.begin(async tx => {
        const images = createDramaImageStore(tx);
        const failure = { userId: input.userId, jobId: input.jobId, failureCode: 'PROVIDER_REJECTED' };
        const job = await images.prepareFail(failure);
        const submission = await createDramaImageSubmissionStore(tx).reject(input);
        if (job.status !== 'failed') {
          await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-image:${input.jobId}` });
          await images.fail(failure);
        }
        return submission;
      }),
    },
    dramaImageAssets: {
      get: input => connection.begin('read only', tx => createDramaImageAssetStore(tx).get(input)),
      publish: input => connection.begin(async tx => {
        const images = createDramaImageStore(tx);
        const job = await images.get(input, true);
        const assets = createDramaImageAssetStore(tx);
        const existing = await assets.find(input);
        if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama image cannot publish asset');
        if (job.target === 'portrait') {
          const submission = await createDramaImageSubmissionStore(tx).get(input);
          if (!submission || submission.status !== 'submitted' || submission.providerKey !== job.portrait?.binding.providerKey) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Portrait receipt required');
        }
        if (job.model === PLAN_IMAGE_MODEL) {
          const submission = await createDramaImageSubmissionStore(tx).get(input);
          if (!submission || submission.status !== 'submitted' || submission.providerKey !== 'mock-candidate-image:v1') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Mock storyboard image receipt required');
        }
        const asset = await assets.insert(input);
        if (job.target === 'portrait') {
          const material = await createMaterialStore(tx).insertGenerated({ ...input, contentType: 'image/png', expiresAt: asset.expiresAt,
            objectKey: `materials/${input.userId}/generated/${input.jobId}/${asset.sha256}.png` });
          await assets.bindReference({ ...input, materialId: material.id });
          asset.referenceMaterialId = material.id;
        }
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `drama-image:${input.jobId}`, actual: job.reservedCredits });
        await images.complete({ ...input, outputRef: `drama-image-asset:${asset.id}`, actualCredits: job.reservedCredits });
        return asset;
      }),
    },
    dramaImageOutbox: {
      claim: () => connection.begin(tx => createDramaImageStore(tx).claim()),
      ack: input => connection.begin(tx => createDramaImageStore(tx).ack(input)),
      release: input => connection.begin(tx => createDramaImageStore(tx).release(input)),
    },
    dramaShotVideos: {
      quotePlan: input => connection.begin('read only', async tx => {
        const { snapshot } = await planVideoContext(tx, input);
        return input.mockAvailable ? { mode: 'mock' as const, credits: PLAN_VIDEO_CREDITS, version: snapshot.quoteVersion } : { mode: 'disabled' as const, credits: null, version: null };
      }),
      createPlan: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId); const videos = createDramaShotVideoStore(tx); const existing = await videos.findRequest(input);
        if (existing) {
          if (existing.candidateId !== input.candidateId || !existing.plan || existing.plan.planRevision !== input.planRevision || existing.plan.quoteVersion !== input.quoteVersion) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Plan video request conflicts');
          return existing;
        }
        const { record, snapshot } = await planVideoContext(tx, input, true);
        if (!input.mockAvailable) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, '分镜视频真实生成尚未开放。');
        if (snapshot.quoteVersion !== input.quoteVersion) throw new DomainError(409, ErrorCode.QUOTE_CHANGED, '报价已变化，请重新确认。');
        const id = randomUUID();
        await createBillingStore(tx).reserve({ userId: input.userId, billingKey: `drama-video:${id}`, estimate: PLAN_VIDEO_CREDITS, model: PLAN_VIDEO_MODEL, estimatedCostCents: null });
        return videos.insert(input, id, record.value.shotId, input.candidateId, PLAN_VIDEO_CREDITS, PLAN_VIDEO_MODEL, snapshot);
      }),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const videos = createDramaShotVideoStore(tx);
        const existing = await videos.findRequest(input);
        if (existing) {
          if (existing.shotId !== input.shotId || existing.plan) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Shot video request conflicts with existing state');
          return existing;
        }
        const candidate = await createDramaStore(tx).selectedCandidateForShot({ userId: input.userId, shotId: input.shotId }, true);
        if (candidate.imageJob?.status !== 'succeeded') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Shot video requires a published candidate image');
        }
        const id = randomUUID();
        await createBillingStore(tx).reserve({
          userId: input.userId, billingKey: `drama-video:${id}`, estimate: DRAMA_SHOT_VIDEO_PRICING.credits,
          model: DRAMA_SHOT_VIDEO_PRICING.model, estimatedCostCents: DRAMA_SHOT_VIDEO_PRICING.estimatedCostCents,
        });
        return videos.insert(input, id, input.shotId, candidate.id, DRAMA_SHOT_VIDEO_PRICING.credits, DRAMA_SHOT_VIDEO_PRICING.model);
      }),
      createForCandidate: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const videos = createDramaShotVideoStore(tx);
        const existing = await videos.findRequest(input);
        if (existing) {
          if (existing.candidateId !== input.candidateId || existing.plan) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Shot video request conflicts with existing state');
          return existing;
        }
        const selected = await createDramaStore(tx).selectedCandidateForVideo({ userId: input.userId, candidateId: input.candidateId });
        if (selected.candidate.imageJob?.status !== 'succeeded') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Shot video requires a published candidate image');
        }
        const id = randomUUID();
        await createBillingStore(tx).reserve({
          userId: input.userId, billingKey: `drama-video:${id}`, estimate: DRAMA_SHOT_VIDEO_PRICING.credits,
          model: DRAMA_SHOT_VIDEO_PRICING.model, estimatedCostCents: DRAMA_SHOT_VIDEO_PRICING.estimatedCostCents,
        });
        return videos.insert(input, id, selected.shotId, input.candidateId, DRAMA_SHOT_VIDEO_PRICING.credits, DRAMA_SHOT_VIDEO_PRICING.model);
      }),
      get: input => connection.begin('read only', tx => createDramaShotVideoStore(tx).get(input)),
      listForCandidates: input => connection.begin('read only', tx => createDramaShotVideoStore(tx).listForCandidates(input)),
      complete: input => connection.begin(async tx => {
        const videos = createDramaShotVideoStore(tx);
        const existing = await videos.prepareComplete(input);
        if (existing.plan) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Plan video completion requires asset publication');
        if (existing.status === 'succeeded') return existing;
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `drama-video:${input.jobId}`,
          actual: input.actualCredits, actualCostCents: input.actualCostCents });
        return videos.complete(input);
      }),
      fail: input => connection.begin(async tx => {
        const videos = createDramaShotVideoStore(tx);
        const existing = await videos.prepareFail(input);
        if (existing.status === 'failed') return existing;
        if (existing.plan) {
          const submission = await createDramaShotVideoSubmissionStore(tx).get(input);
          if (!submission || !['submitted', 'rejected'].includes(submission.status)) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Unknown plan video cannot refund automatically');
        }
        await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-video:${input.jobId}` });
        return videos.fail(input);
      }),
    },
    dramaShotVideoSubmissions: {
      get: input => connection.begin('read only', tx => createDramaShotVideoSubmissionStore(tx).get(input)),
      begin: input => connection.begin(tx => createDramaShotVideoSubmissionStore(tx).begin(input)),
      accepted: input => connection.begin(tx => createDramaShotVideoSubmissionStore(tx).accepted(input)),
      unknown: input => connection.begin(tx => createDramaShotVideoSubmissionStore(tx).unknown(input)),
      reject: input => connection.begin(async tx => {
        const videos = createDramaShotVideoStore(tx);
        const failure = { userId: input.userId, jobId: input.jobId, failureCode: 'PROVIDER_REJECTED' };
        const job = await videos.prepareFail(failure);
        const submission = await createDramaShotVideoSubmissionStore(tx).reject(input);
        if (job.status !== 'failed') {
          await createBillingStore(tx).refund({ userId: input.userId, billingKey: `drama-video:${input.jobId}` });
          await videos.fail(failure);
        }
        return submission;
      }),
    },
    dramaShotVideoAssets: {
      get: input => connection.begin('read only', tx => createDramaShotVideoAssetStore(tx).get(input)),
      publish: input => connection.begin(async tx => {
        const videos = createDramaShotVideoStore(tx);
        const job = await videos.get(input, true);
        const assets = createDramaShotVideoAssetStore(tx);
        const existing = await assets.find(input);
        if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama shot video cannot publish asset');
        if (job.plan) {
          const submission = await createDramaShotVideoSubmissionStore(tx).get(input);
          if (submission?.status !== 'submitted' || submission.providerKey !== 'mock-shot-video:v1' || job.model !== PLAN_VIDEO_MODEL) throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Plan video publication requires recorded mock receipt');
        }
        const asset = await assets.insert(input);
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `drama-video:${input.jobId}`, actual: job.reservedCredits });
        await videos.complete({ ...input, outputRef: `drama-shot-video-asset:${asset.id}`, actualCredits: job.reservedCredits });
        return asset;
      }),
    },
    dramaShotVideoOutbox: {
      claim: () => connection.begin(tx => createDramaShotVideoStore(tx).claim()),
      ack: input => connection.begin(tx => createDramaShotVideoStore(tx).ack(input)),
      release: input => connection.begin(tx => createDramaShotVideoStore(tx).release(input)),
    },
    dramaExports: {
      listForPlan: input => connection.begin('read only', async tx => { await createStoryboardPlanStore(tx).get(input); return createDramaExportStore(tx).listForPlan(input); }),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const exports = createDramaExportStore(tx);
        const existing = await exports.findRequest(input);
        return existing ?? exports.insert(input, input.planId ? await planExportManifest(tx, input) : undefined);
      }),
      get: input => connection.begin('read only', tx => createDramaExportStore(tx).get(input)),
      getVersion: input => connection.begin('read only', tx => createDramaExportStore(tx).getVersion(input)),
      complete: input => connection.begin(async tx => {
        const exports = createDramaExportStore(tx);
        const existing = await exports.prepareComplete(input);
        return existing.status === 'succeeded' ? existing : exports.complete(input);
      }),
      fail: input => connection.begin(async tx => {
        const exports = createDramaExportStore(tx);
        const existing = await exports.prepareFail(input);
        return existing.status === 'failed' ? existing : exports.fail(input);
      }),
    },
    dramaExportAssets: {
      get: input => connection.begin('read only', tx => createDramaExportAssetStore(tx).get(input)),
      publish: input => connection.begin(async tx => {
        const exports = createDramaExportStore(tx);
        const job = await exports.get(input, true);
        const assets = createDramaExportAssetStore(tx);
        const existing = await assets.find(input);
        if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Drama export cannot publish asset');
        const asset = await assets.insert(input);
        await exports.complete({ ...input, outputRef: `drama-export-asset:${asset.id}` });
        return asset;
      }),
    },
    dramaExportOutbox: {
      claim: () => connection.begin(tx => createDramaExportStore(tx).claim()),
      ack: input => connection.begin(tx => createDramaExportStore(tx).ack(input)),
      release: input => connection.begin(tx => createDramaExportStore(tx).release(input)),
    },
    opsPortraitReview: {
      list: input => connection.begin('read only', tx => createPortraitReviewStore(tx).list(input?.cursor)),
      resolve: input => connection.begin(async tx => {
        const reviews = createPortraitReviewStore(tx); const prepared = await reviews.prepare(input.jobId, input.request);
        const images = createDramaImageStore(tx); const submissions = createDramaImageSubmissionStore(tx);
        let review: PortraitReviewResultValue['review'];
        if (prepared.replay) review = prepared.review;
        else {
          const token = { ...prepared.locator, token: prepared.token };
          if (prepared.request.action === 'receipt') await submissions.accepted({ ...token, providerTaskId: prepared.request.providerTaskId });
          else {
            await submissions.reject(token);
            await createBillingStore(tx).refund({ userId: token.userId, billingKey: `drama-image:${input.jobId}` });
            await images.fail({ ...token, failureCode: 'PROVIDER_REJECTED' });
          }
          review = await reviews.record({ jobId: input.jobId, hash: prepared.hash, priorState: prepared.priorState, request: prepared.request });
          await images.requestResume(input.jobId);
        }
        const job = await images.get(prepared.locator); const submission = await submissions.get(prepared.locator);
        return { job: { id: job.id, status: job.status, submissionStatus: submission!.status, reservedCredits: job.reservedCredits, actualCredits: job.actualCredits }, review };
      }),
    },
    opsScriptReview: {
      list: input => connection.begin('read only', tx => createScriptReviewStore(tx).list(input?.cursor)),
      resolve: input => connection.begin(async tx => {
        const reviews = createScriptReviewStore(tx); const jobs = createDramaScriptStore(tx);
        // Acquire project before the review's job lock; batch advancement must not reverse that order.
        await createDramaStore(tx).lockProject(await reviews.locate(input.jobId));
        const prepared = await reviews.prepare(input.jobId, input.request);
        if (prepared.replay) return { job: await jobs.get(prepared.locator), review: prepared.review };
        const token = { ...prepared.locator, token: prepared.token };
        if (prepared.request.action === 'receipt') {
          // Persist the known fact and its audit together. Publication uses a later transaction.
          await jobs.recordResponse({ ...token, response: prepared.request.response });
        } else {
          const job = await jobs.lock(prepared.locator);
          if (job.billing_state === 'held') await createBillingStore(tx).refund({ userId: job.user_id, billingKey: `drama-script:${job.id}` });
          await jobs.rejectSubmission(token);
          await advanceBatchForJob(tx, token);
        }
        const review = await reviews.record({ jobId: input.jobId, hash: prepared.hash, priorState: prepared.priorState, request: prepared.request });
        return { job: await jobs.get(prepared.locator), review };
      }),
    },
    opsReview: {
      list: () => connection.begin('read only', async tx => {
        const rows = await createGenerationStore(tx).listUnknownReviews();
        return rows.map(row => ({
          jobId: row.job_id, userId: row.user_id, prompt: row.prompt, resolution: row.resolution,
          reservedCredits: Number(row.reserved_credits), providerKey: row.provider_key,
          createdAt: row.created_at.toISOString(),
        }));
      }),
      receipt: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const job = await generation.getById(input.jobId, true);
        if (job.status !== 'accepted') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Job already settled; receipt rejected');
        }
        const row = await createSubmissionStore(tx).lockForReview(input.jobId);
        if (row.status !== 'unknown') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Submission is not awaiting review');
        }
        await createSubmissionStore(tx).accepted({ userId: job.userId, jobId: input.jobId, token: row.token, providerTaskId: input.providerTaskId });
        await generation.requestResume(input.jobId);
        return { jobId: input.jobId, action: 'receipt' as const, status: 'accepted' as const };
      }),
      reject: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const submissions = createSubmissionStore(tx);
        const job = await generation.getById(input.jobId, true);
        if (job.status !== 'accepted') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Job already settled');
        }
        const row = await submissions.lockForReview(input.jobId);
        if (row.status !== 'unknown') {
          throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Submission is not awaiting review');
        }
        const failure = { userId: job.userId, jobId: input.jobId, failureCode: 'PROVIDER_REJECTED' };
        const prepared = await generation.prepareFail(failure);
        await submissions.reject({ userId: job.userId, jobId: input.jobId, token: row.token });
        if (prepared.status !== 'failed') {
          await createBillingStore(tx).refund({ userId: job.userId, billingKey: `generation:${input.jobId}` });
          await generation.fail(failure);
        }
        await generation.requestResume(input.jobId);
        return { jobId: input.jobId, action: 'reject' as const, status: 'failed' as const };
      }),
    },
    generationOutbox: {
      claim: () => connection.begin(tx => createGenerationStore(tx).claim()),
      ack: input => connection.begin(tx => createGenerationStore(tx).ack(input)),
      release: input => connection.begin(tx => createGenerationStore(tx).release(input)),
    },
    async probe() {
      await connection`select 1 from wb_next.users, wb_next.sessions, wb_next.wallets, wb_next.reservations, wb_next.ledger,
        wb_next.generation_jobs, wb_next.outbox, wb_next.provider_submissions, wb_next.media_assets,
        wb_next.user_materials, wb_next.generation_job_materials, wb_next.drama_projects, wb_next.drama_scripts,
        wb_next.drama_script_versions, wb_next.drama_roles, wb_next.drama_role_versions, wb_next.drama_scenes,
        wb_next.drama_scene_versions, wb_next.drama_storyboard_shots, wb_next.drama_storyboard_candidates,
        wb_next.drama_image_jobs, wb_next.drama_image_assets, wb_next.drama_image_submissions, wb_next.drama_image_outbox,
        wb_next.drama_shot_video_jobs, wb_next.drama_shot_video_assets, wb_next.drama_shot_video_submissions,
        wb_next.drama_shot_video_outbox limit 0`;
    },
    async close() { await connection.end({ timeout: 5 }); },
  };
}
