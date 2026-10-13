export { createServices } from './infrastructure/services';
export type { DramaScriptService, DramaScriptOutbox, ScriptDelivery, ScriptSnapshot, ScriptJobLocator, ScriptBinding, ScriptRequest, ScriptSubmission, ScriptSubmissionClaim, ScriptSubmissionToken, ScriptOffer, ScriptAdmission, CreateScriptJobInput } from './modules/drama-script/public';
export { scriptProviderBinding, buildScriptRequest } from './modules/drama-script/prompt';
export type { Services } from './infrastructure/services';
export { DomainError } from './errors';
export type { MediaAsset, PublishMediaInput, AssetService } from './modules/assets/public';
export type { ProviderSubmission, SubmissionClaim, SubmissionToken, ProviderSubmissions } from './modules/generation/public';
export type { GrantInput, ReserveInput, SettleInput, RefundInput } from './modules/billing/public';
export type { MaterialRecord, MaterialLocator, InsertMaterialInput, MaterialStore } from './modules/materials/public';
export type { CreateDramaProjectInput, DramaDiagnostic, DramaParseResult, DramaProject, DramaScript, DramaScriptVersion, DramaRole, DramaRoleVersion, DramaScene, DramaSceneVersion, DramaStoryboardCandidate, DramaStoryboardShot, DramaProjectWorkflow, DramaService } from './modules/drama/public';
export type {
  CreateDramaImageJobInput, DramaImageAsset, DramaImageAssets, DramaImageDelivery, DramaImageJob, DramaImageJobLocator,
  DramaImageOutbox, DramaImageService, DramaImageSubmission, DramaImageSubmissionClaim, DramaImageSubmissions,
  DramaImageSubmissionToken, PublishDramaImageInput,
} from './modules/drama-image/public';
export type {
  CreateDramaShotVideoForCandidateInput, CreateDramaShotVideoJobInput, DramaShotVideoAsset, DramaShotVideoAssets, DramaShotVideoDelivery, DramaShotVideoJob,
  DramaShotVideoJobLocator, DramaShotVideoOutbox, DramaShotVideoService, DramaShotVideoSubmission,
  DramaShotVideoSubmissionClaim, DramaShotVideoSubmissions, DramaShotVideoSubmissionToken, PublishDramaShotVideoInput,
} from './modules/drama-shot-video/public';
export type {
  CompleteDramaExportInput, CreateDramaExportJobInput, DramaExportAsset, DramaExportAssets, DramaExportDelivery,
  DramaExportJob, DramaExportJobLocator, DramaExportManifest, DramaExportOutbox, DramaExportService,
  DramaExportShotManifest, DramaExportVersion, FailDramaExportInput, PublishDramaExportInput,
} from './modules/drama-export/public';
export { parseDramaScript } from './modules/drama/parser';
export { buildDramaProductionPlan } from './modules/drama/production-plan';
export { buildMarketingProductionPlan } from './modules/marketing-copy/production-plan';
export { seriesScriptProviderBinding } from './modules/drama-script/prompt';
export { marketingCopyBinding, buildMarketingCopyRequest, parseMarketingCopy } from './modules/marketing-copy/prompt';
export type { CopyAdmission, CopyLocator, CopyDelivery, MarketingCopyService, CopyOutbox } from './modules/marketing-copy/public';
export { marketingVideoPrompt } from './modules/generation/prompt';
export type { NativeMediaRecord, NativeMediaSource } from './modules/generation/native-media';
export { portraitBinding, PORTRAIT_MODEL } from './modules/drama-image/portrait';
export type { PortraitBinding, PortraitSnapshot, PortraitOffer, RolePortraitService } from './modules/drama-image/public';
export type {
  CreateGenerationInput, GenerationJob, GenerationLocator, CompleteGenerationInput,
  FailGenerationInput, GenerationService, GenerationDelivery, GenerationOutbox,
} from './modules/generation/public';

export { nativeMarketingBinding, NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from './modules/generation/native-offer';
export type { NativeMarketingOffer } from './modules/generation/native-offer';
export { nativeMarketingPrompt } from './modules/generation/prompt';
