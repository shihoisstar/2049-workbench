import type { NativeMarketingOffer } from '@wb/server';
import 'reflect-metadata';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, OnApplicationShutdown,
  Param, Post, Query, Req, ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { imageSize } from 'image-size';
import { API_VERSION, ErrorCode, GuestBootstrapRequest, GuestSession, HealthResponse, WalletSummary, WalletEntryList, WalletEntryListQuery,
  GenerationList, GenerationListQuery, GenerationSettings, GenerationQuote, GenerationView, MediaAccess, SubmitGeneration, generationQuoteVersion, VIDEO_PRICING,
  MaterialView, MATERIAL_CONTENT_TYPES, MATERIAL_MAX_BYTES, MATERIAL_TTL_MS, OpsReceiptRequest, OpsReviewList, OpsReviewActionResult,
  CreateDramaProject, DramaProjectList, DramaProjectListQuery, DramaProjectView, DramaScriptList, DramaScriptListQuery, DramaScriptVersion, DramaScriptView, RepairDramaScript,
  CreateDramaRole, CreateDramaRoleVersion, DramaRole, DramaRoleVersion, CreateDramaScene, CreateDramaSceneVersion, DramaScene, DramaSceneVersion,
  CreateDramaStoryboardShot, CreateDramaStoryboardCandidate, DramaStoryboardCandidate, DramaStoryboardShot, DramaProjectWorkflow, SubmitDramaImageJob, DramaImageJobView, DramaImageAccess,
  SubmitDramaShotVideoJob, DramaShotVideoJobView, DramaShotVideoAccess,
  CreateDramaExport, DramaExportJobView, DramaExportAccess } from '@wb/contracts';
import type { ObjectStore } from '@wb/media';
import { createServices, DomainError } from '@wb/server';
import type { PortraitOffer, ScriptAdmission, Services } from '@wb/server';
import { PortraitRequest, SubmitPortrait, SelectPortrait, PortraitListQuery, PortraitQuote, PortraitJobView, PortraitJobList } from '@wb/contracts';
import { SubmitDramaScriptJob, DramaScriptJobView, ConfirmDramaScript, DramaScriptQuote } from '@wb/contracts';
import { SubmitScriptBatch, ScriptBatch, ScriptBatchQuote } from '@wb/contracts';
import { MarketingCopyInput, MarketingCopyQuery, MarketingCopyReviewList, SubmitMarketingCopy, MarketingCopyQuote, MarketingCopyJob } from '@wb/contracts';
import type { CopyAdmission } from '@wb/server';
import { ConfirmRoleAppearance, DramaPreparation, SaveDramaPreparation, MaterialAccess, ScriptReviewQuery, ScriptReviewList, ReviewScriptRequest, ScriptReviewResult } from '@wb/contracts';
import { PortraitReviewQuery, PortraitReviewList, ReviewPortraitRequest, PortraitReviewResult } from '@wb/contracts';
import { CreateStoryboardPlan, UpdateStoryboardPlanShot, StoryboardPlan } from '@wb/contracts';
import { PlanImageRequest, SubmitPlanImage, PlanImageQuote, PlanImageQuery, SelectPlanImage, PlanImage, PlanImageList } from '@wb/contracts';
import { PlanVideoRequest, SubmitPlanVideo, PlanVideoQuote, PlanExportList } from '@wb/contracts';
import { DramaProductionPlan, MarketingProductionRequest, MarketingProductionPlan } from '@wb/contracts';
import { NativeMarketingInput, NativeMarketingQuote, SubmitNativeMarketing } from '@wb/contracts';
import { NativeCaptionReview, ConfirmNativeCaptions, NativeSourceAccess, ResumeNativeMedia } from '@wb/contracts';
import { buildMarketingProductionPlan } from '@wb/server';
import type { DramaExportAccessValue, DramaExportJobViewValue, DramaImageAccessValue, DramaImageJobViewValue, DramaShotVideoAccessValue, DramaShotVideoJobViewValue, DramaProjectWorkflowValue, DramaRoleValue, DramaRoleVersionValue, DramaSceneValue, DramaSceneVersionValue, DramaScriptViewValue, DramaStoryboardCandidateValue, DramaStoryboardShotValue } from '@wb/contracts';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from './config';
import type { DatabaseConnection } from './database';
import { ApiExceptionFilter, sendErrorResponse } from './errors';

const DATABASE = Symbol('DATABASE');
const SERVICES = Symbol('SERVICES');
const GENERATION_AVAILABLE = Symbol('GENERATION_AVAILABLE');
const OBJECT_STORE = Symbol('OBJECT_STORE');
const OPS_TOKEN = Symbol('OPS_TOKEN');
const BATCH_ADMISSION = Symbol('BATCH_ADMISSION');
const COPY_ADMISSION = Symbol('COPY_ADMISSION');
const NATIVE_MARKETING_MOCK = Symbol('NATIVE_MARKETING_MOCK');
const NATIVE_MARKETING_OFFER = Symbol('NATIVE_MARKETING_OFFER');

async function principal(services: Services, authorization: string | undefined) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '')?.[1];
  if (!token) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Session required');
  return services.identity.authenticate(token);
}

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseConnection,
    @Inject(SERVICES) private readonly services: Services,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.objectStore?.close();
    await Promise.all([this.database.close(), ...(this.database !== this.services ? [this.services.close()] : [])]);
  }
}

@Controller()
class HealthController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseConnection) {}

  @Get('/healthz')
  live(): HealthResponse {
    return HealthResponse.parse({
      status: 'ok', apiVersion: API_VERSION, uptimeSec: Math.floor(process.uptime()),
    });
  }

  @Get('/readyz')
  async ready(): Promise<HealthResponse> {
    try {
      await this.database.probe();
    } catch {
      throw new ServiceUnavailableException();
    }
    return this.live();
  }
}

@Controller('/v2')
class AccountController {
  constructor(@Inject(SERVICES) private readonly services: Services) {}

  private async principal(authorization: string | undefined) {
    return principal(this.services, authorization);
  }

  @Post('/auth/guest')
  @HttpCode(200)
  async guest(@Body() body: unknown): Promise<GuestSession> {
    const parsed = GuestBootstrapRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return GuestSession.parse(await this.services.identity.bootstrapGuest(parsed.data.credential));
  }

  @Get('/wallet')
  async wallet(@Headers('authorization') authorization: string | undefined): Promise<WalletSummary> {
    const { userId } = await this.principal(authorization);
    return WalletSummary.parse(await this.services.billing.summary(userId));
  }

  @Get('/wallet/entries')
  async walletEntries(@Headers('authorization') authorization: string | undefined, @Query() query: unknown): Promise<WalletEntryList> {
    const { userId } = await this.principal(authorization);
    const parsed = WalletEntryListQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return WalletEntryList.parse(await this.services.billing.entries({ userId, ...parsed.data }));
  }

  @Post('/auth/deactivate')
  @HttpCode(204)
  async deactivate(@Headers('authorization') authorization: string | undefined): Promise<void> {
    const { userId } = await this.principal(authorization);
    await this.services.identity.deactivate(userId);
  }
}

@Controller('/v2/marketing/video')
class NativeMarketingController {
  constructor(@Inject(SERVICES) private readonly services: Services, @Inject(NATIVE_MARKETING_MOCK) private readonly mockAvailable: boolean, @Inject(NATIVE_MARKETING_OFFER) private readonly offer: NativeMarketingOffer | (() => NativeMarketingOffer | undefined) | undefined, @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore | null) {}
  private currentOffer() { return typeof this.offer === 'function' ? this.offer() : this.offer ?? undefined; }
  private async locator(authorization: string | undefined, id: string) { const { userId } = await principal(this.services, authorization); if (!GenerationView.shape.id.safeParse(id).success) throw new BadRequestException(); return { userId, jobId: id }; }
  @Get('/:id/review')
  async review(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return NativeCaptionReview.nullable().parse(await this.services.nativeMedia.get(await this.locator(authorization, id))); }
  @Get('/:id/source')
  async source(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const media = await this.services.nativeMedia.get(await this.locator(authorization, id)); if (!media) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Source is not ready');
    const ttl = Math.min(600, Math.floor((Date.parse(media.expiresAt) - Date.now()) / 1000)); if (ttl < 1) throw new DomainError(410, ErrorCode.MATERIAL_EXPIRED, 'Source expired');
    if (!this.objectStore) throw new ServiceUnavailableException();
    return NativeSourceAccess.parse({ url: await this.objectStore.access(media.objectKey, ttl), urlExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(), expiresAt: media.expiresAt, sha256: media.sha256, width: media.width, height: media.height, durationMs: media.durationMs });
  }
  @Post('/:id/review')
  @HttpCode(200)
  async confirm(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const input = await this.locator(authorization, id); const parsed = ConfirmNativeCaptions.safeParse(body); if (!parsed.success) throw new BadRequestException();
    return NativeCaptionReview.parse(await this.services.nativeMedia.confirm({ ...input, request: parsed.data }));
  }
  @Post('/:id/resume')
  @HttpCode(204)
  async resume(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) { const input = await this.locator(authorization, id); if (!ResumeNativeMedia.safeParse(body).success) throw new BadRequestException(); await this.services.nativeMedia.resume(input); }
  @Post('/quote')
  @HttpCode(200)
  async quote(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = NativeMarketingInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return NativeMarketingQuote.parse(await this.services.nativeMarketing.quote({ userId, request: parsed.data, mockAvailable: this.mockAvailable, offer: this.currentOffer() }));
  }
  @Post()
  @HttpCode(200)
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SubmitNativeMarketing.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return GenerationView.parse(await this.services.nativeMarketing.create({ userId, request: parsed.data, mockAvailable: this.mockAvailable, offer: this.currentOffer() }));
  }
}

@Controller('/v2/generation')
class GenerationController {
  constructor(
    @Inject(SERVICES) private readonly services: Services,
    @Inject(GENERATION_AVAILABLE) private readonly available: boolean | (() => boolean),
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore | null,
  ) {}

  @Post('/quote')
  @HttpCode(200)
  quote(@Body() body: unknown): GenerationQuote {
    const settings = GenerationSettings.safeParse(body);
    if (!settings.success) throw new BadRequestException();
    return GenerationQuote.parse({ ...settings.data, version: generationQuoteVersion(settings.data),
      credits: VIDEO_PRICING[settings.data.resolution].credits, available: typeof this.available === 'function' ? this.available() : this.available });
  }

  @Post()
  @HttpCode(200)
  async submit(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<GenerationView> {
    const { userId } = await principal(this.services, authorization);
    const parsed = SubmitGeneration.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    if (!(typeof this.available === 'function' ? this.available() : this.available)) throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Generation unavailable');
    const { quoteVersion, ...input } = parsed.data;
    if (quoteVersion !== generationQuoteVersion(input)) {
      throw new DomainError(409, ErrorCode.QUOTE_CHANGED, 'Refresh generation quote');
    }
    return GenerationView.parse(await this.services.generation.create({ ...input, userId }));
  }

  @Get()
  async list(@Headers('authorization') authorization: string | undefined, @Query() query: unknown): Promise<GenerationList> {
    const { userId } = await principal(this.services, authorization);
    const parsed = GenerationListQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return GenerationList.parse(await this.services.generation.list({ userId, ...parsed.data }));
  }

  @Get('/:id')
  async get(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<GenerationView> {
    const { userId } = await principal(this.services, authorization);
    if (!GenerationView.shape.id.safeParse(id).success) throw new BadRequestException();
    return GenerationView.parse(await this.services.generation.get({ userId, jobId: id }));
  }

  @Get('/:id/media')
  async media(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<MediaAccess> {
    const { userId } = await principal(this.services, authorization);
    if (!GenerationView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.generation.get({ userId, jobId: id });
    if (job.status !== 'succeeded') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Media not ready');
    const asset = await this.services.assets.get({ userId, jobId: id });
    if (!this.objectStore) throw new ServiceUnavailableException();
    const seconds = Math.min(600, Math.floor((Date.parse(asset.expiresAt) - Date.now()) / 1000));
    if (seconds < 1) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Media expired');
    const url = await this.objectStore.access(asset.objectKey, seconds);
    return MediaAccess.parse({ assetId: asset.id, jobId: id, url, urlExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      expiresAt: asset.expiresAt, sha256: asset.sha256, byteLength: asset.byteLength, width: asset.width, height: asset.height, durationMs: asset.durationMs });
  }
}

@Controller('/v2/materials')
class MaterialsController {
  constructor(
    @Inject(SERVICES) private readonly services: Services,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore | null,
  ) {}

  @Get('/:id/access')
  async access(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!MaterialView.shape.id.safeParse(id).success) throw new BadRequestException();
    const material = await this.services.materials.get({ userId, materialId: id });
    const seconds = Math.min(600, Math.floor((Date.parse(material.expiresAt) - Date.now()) / 1000));
    if (material.status !== 'active' || seconds < 1) throw new DomainError(410, ErrorCode.MATERIAL_EXPIRED, 'Material expired');
    if (!this.objectStore) throw new ServiceUnavailableException();
    return MaterialAccess.parse({ materialId: id, url: await this.objectStore.access(material.objectKey, seconds, material.contentType),
      urlExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(), expiresAt: material.expiresAt });
  }

  @Post()
  @HttpCode(201)
  async upload(@Headers('authorization') authorization: string | undefined, @Req() request: FastifyRequest): Promise<MaterialView> {
    const { userId } = await principal(this.services, authorization);
    if (!this.objectStore) throw new ServiceUnavailableException();
    const file = await request.file();
    if (!file || !(MATERIAL_CONTENT_TYPES as readonly string[]).includes(file.mimetype)) throw new BadRequestException();
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw new BadRequestException();
    }
    if (!bytes.length) throw new BadRequestException();
    let dimensions: { width?: number; height?: number };
    try {
      dimensions = imageSize(bytes);
    } catch {
      throw new BadRequestException();
    }
    if (!dimensions.width || !dimensions.height || dimensions.width > 8192 || dimensions.height > 8192) throw new BadRequestException();
    const contentType = file.mimetype as (typeof MATERIAL_CONTENT_TYPES)[number];
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const objectKey = `materials/${userId}/${sha256}.${extension}`;
    await this.objectStore.put(objectKey, bytes, sha256, contentType);
    await this.services.materials.sweepExpired();
    return MaterialView.parse(await this.services.materials.register({
      userId, objectKey, sha256, byteLength: bytes.length, contentType, width: dimensions.width, height: dimensions.height,
      expiresAt: new Date(Date.now() + MATERIAL_TTL_MS).toISOString(),
    }));
  }
}

const SCRIPT_ADMISSION = Symbol('SCRIPT_ADMISSION');
const PORTRAIT_OFFER = Symbol('PORTRAIT_OFFER');
const PLAN_IMAGE_MOCK = Symbol('PLAN_IMAGE_MOCK');
@Controller('/v2/drama')
class DramaController {
  constructor(
    @Inject(SERVICES) private readonly services: Services,
    @Inject(GENERATION_AVAILABLE) private readonly available: boolean | (() => boolean),
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStore | null,
    @Inject(SCRIPT_ADMISSION) private readonly scriptAdmission: ScriptAdmission,
    @Inject(BATCH_ADMISSION) private readonly batchAdmission: ScriptAdmission,
    @Inject(PORTRAIT_OFFER) private readonly portraitOffer: PortraitOffer | null,
    @Inject(PLAN_IMAGE_MOCK) private readonly planImageMock: boolean,
  ) {}

  @Post('/projects')
  @HttpCode(201)
  async createProject(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<DramaProjectView> {
    const { userId } = await principal(this.services, authorization);
    const parsed = CreateDramaProject.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaProjectView.parse(await this.services.drama.create({ ...parsed.data, userId }));
  }

  @Post('/projects/:id/script-jobs')
  @HttpCode(201)
  async submitScript(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization);
    const parsed = SubmitDramaScriptJob.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return DramaScriptJobView.parse(await this.services.dramaScripts.create({ userId, projectId: id, ...parsed.data, admission: this.scriptAdmission }));
  }
  @Get('/projects/:id/script-quote')
  async scriptQuote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaScriptQuote.parse(await this.services.dramaScripts.quote({ userId, projectId: id, admission: this.scriptAdmission }));
  }
  @Get('/projects/:id/preparation')
  async preparation(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaPreparation.parse(await this.services.drama.getPreparation({ userId, projectId: id }));
  }
  @Post('/projects/:id/preparation')
  @HttpCode(200)
  async savePreparation(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SaveDramaPreparation.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return DramaPreparation.parse(await this.services.drama.savePreparation({ userId, projectId: id, draft: parsed.data }));
  }
  @Post('/projects/:id/role-appearance')
  @HttpCode(200)
  async confirmAppearance(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = ConfirmRoleAppearance.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return DramaPreparation.parse(await this.services.drama.confirmRoleAppearance({ userId, projectId: id, confirmation: parsed.data }));
  }
  @Get('/projects/:id/script-batch-quote')
  async batchQuote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return ScriptBatchQuote.parse(await this.services.scriptBatches.quote({ userId, projectId: id, admission: this.batchAdmission }));
  }
  @Post('/projects/:id/script-batches')
  async submitBatch(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SubmitScriptBatch.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return ScriptBatch.parse(await this.services.scriptBatches.create({ userId, projectId: id, request: parsed.data, admission: this.batchAdmission }));
  }
  @Get('/projects/:id/script-batches/latest')
  async latestBatch(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return ScriptBatch.nullable().parse(await this.services.scriptBatches.latest({ userId, projectId: id }));
  }
  @Get('/script-batches/:id')
  async getBatch(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!ScriptBatch.shape.id.safeParse(id).success) throw new BadRequestException();
    return ScriptBatch.parse(await this.services.scriptBatches.get({ userId, batchId: id }));
  }
  @Post('/projects/:id/portrait-quote')
  @HttpCode(200)
  async portraitQuote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = PortraitRequest.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return PortraitQuote.parse(await this.services.rolePortraits.quote({ userId, projectId: id, request: parsed.data, offer: this.objectStore ? this.portraitOffer : null }));
  }
  @Post('/projects/:id/storyboard-plan')
  @HttpCode(200)
  async createPlan(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = CreateStoryboardPlan.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return StoryboardPlan.parse(await this.services.storyboardPlans.create({ userId, projectId: id, request: parsed.data }));
  }
  @Get('/storyboard-plans/:id/production-plan')
  async productionPlan(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!StoryboardPlan.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaProductionPlan.parse(await this.services.storyboardPlans.production({ userId, planId: id }));
  }
  @Post('/storyboard-plans/:id/image-quote')
  @HttpCode(200)
  async planImageQuote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const request = PlanImageRequest.safeParse(body);
    if (!StoryboardPlan.shape.id.safeParse(id).success || !request.success) throw new BadRequestException();
    return PlanImageQuote.parse(await this.services.planImages.quote({ userId, planId: id, request: request.data, mockAvailable: this.planImageMock && !!this.objectStore }));
  }
  @Post('/storyboard-plans/:id/images')
  @HttpCode(201)
  async createPlanImage(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const request = SubmitPlanImage.safeParse(body);
    if (!StoryboardPlan.shape.id.safeParse(id).success || !request.success) throw new BadRequestException();
    return PlanImage.parse(await this.services.planImages.create({ userId, planId: id, request: request.data, mockAvailable: this.planImageMock && !!this.objectStore }));
  }
  @Get('/storyboard-plans/:id/images')
  async planImageList(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query() query: unknown) {
    const { userId } = await principal(this.services, authorization); const request = PlanImageQuery.safeParse(query);
    if (!StoryboardPlan.shape.id.safeParse(id).success || !request.success) throw new BadRequestException();
    return PlanImageList.parse(await this.services.planImages.list({ userId, planId: id, ...request.data }));
  }
  @Post('/storyboard-images/:id/select')
  @HttpCode(200)
  async selectPlanImage(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const request = SelectPlanImage.safeParse(body);
    if (!PlanImage.shape.candidateId.safeParse(id).success || !request.success) throw new BadRequestException();
    return PlanImage.parse(await this.services.planImages.select({ userId, candidateId: id, ...request.data }));
  }
  @Get('/projects/:id/storyboard-plan')
  async latestPlan(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization); if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return StoryboardPlan.nullable().parse(await this.services.storyboardPlans.latest({ userId, projectId: id }));
  }
  @Get('/storyboard-plans/:id')
  async getPlan(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization); if (!StoryboardPlan.shape.id.safeParse(id).success) throw new BadRequestException();
    return StoryboardPlan.parse(await this.services.storyboardPlans.get({ userId, planId: id }));
  }
  @Post('/storyboard-plans/:id')
  @HttpCode(200)
  async updatePlan(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = UpdateStoryboardPlanShot.safeParse(body);
    if (!StoryboardPlan.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return StoryboardPlan.parse(await this.services.storyboardPlans.update({ userId, planId: id, request: parsed.data }));
  }
  @Post('/projects/:id/portrait-jobs')
  @HttpCode(201)
  async createPortrait(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SubmitPortrait.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return PortraitJobView.parse(await this.services.rolePortraits.create({ userId, projectId: id, request: parsed.data, offer: this.objectStore ? this.portraitOffer : null }));
  }
  @Get('/projects/:id/portrait-jobs')
  async listPortraits(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query() query: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = PortraitListQuery.safeParse(query);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return PortraitJobList.parse(await this.services.rolePortraits.list({ userId, projectId: id, ...parsed.data }));
  }
  @Get('/portrait-jobs/:id')
  async getPortrait(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaImageJobView.shape.id.safeParse(id).success) throw new BadRequestException();
    return PortraitJobView.parse(await this.services.rolePortraits.get({ userId, jobId: id }));
  }
  @Post('/portrait-jobs/:id/select')
  @HttpCode(200)
  async selectPortrait(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SelectPortrait.safeParse(body);
    if (!DramaImageJobView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return DramaPreparation.parse(await this.services.rolePortraits.select({ userId, jobId: id, ...parsed.data }));
  }
  @Get('/projects/:id/script-jobs')
  async latestScript(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaScriptJobView.nullable().parse(await this.services.dramaScripts.latest({ userId, projectId: id }));
  }
  @Get('/script-jobs/:id')
  async scriptJob(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaScriptJobView.parse(await this.services.dramaScripts.get({ userId, jobId: id }));
  }
  @Post('/projects/:id/script-confirmation')
  @HttpCode(201)
  async confirmScript(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization);
    const parsed = ConfirmDramaScript.safeParse(body);
    if (!DramaProjectView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return DramaProjectView.parse(await this.services.dramaScripts.confirm({ userId, projectId: id, ...parsed.data }));
  }

  @Get('/projects')
  async listProjects(@Headers('authorization') authorization: string | undefined, @Query() query: unknown): Promise<DramaProjectList> {
    const { userId } = await principal(this.services, authorization);
    const parsed = DramaProjectListQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return DramaProjectList.parse(await this.services.drama.listProjects({ userId, ...parsed.data }));
  }

  @Get('/projects/:id')
  async getProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaProjectView> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaProjectView.parse(await this.services.drama.getProject({ userId, projectId: id }));
  }

  @Get('/scripts')
  async listScripts(@Headers('authorization') authorization: string | undefined, @Query() query: unknown): Promise<DramaScriptList> {
    const { userId } = await principal(this.services, authorization);
    const parsed = DramaScriptListQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return DramaScriptList.parse(await this.services.drama.listScripts({ userId, ...parsed.data }));
  }

  @Get('/scripts/:id')
  async getScript(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaScriptViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaScriptView.parse(await this.services.drama.getScript({ userId, scriptId: id }));
  }

  @Post('/scripts/:id/versions')
  @HttpCode(201)
  async repairScript(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaScriptVersion> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = RepairDramaScript.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaScriptVersion.parse(await this.services.drama.repairScript({ userId, scriptId: id, ...parsed.data }));
  }

  @Get('/projects/:id/workflow')
  async getWorkflow(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaProjectWorkflowValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const workflow = await this.services.drama.getWorkflow({ userId, projectId: id });
    const candidateIds = workflow.shots.flatMap(shot => shot.candidates.map(candidate => candidate.id));
    const jobs = await this.services.dramaShotVideos.listForCandidates({ userId, candidateIds });
    const latestByCandidate = new Map(jobs.map(job => [job.candidateId, { id: job.id, status: job.status, failureCode: job.failureCode }]));
    return DramaProjectWorkflow.parse({
      ...workflow,
      shots: workflow.shots.map(shot => ({ ...shot, candidates: shot.candidates.map(candidate => ({
        ...candidate, videoJob: latestByCandidate.get(candidate.id) ?? null,
      })) })),
    });
  }

  @Post('/projects/:id/roles')
  @HttpCode(201)
  async createRole(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaRoleValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaRole.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaRole.parse(await this.services.drama.createRole({ userId, projectId: id, ...parsed.data }));
  }

  @Post('/roles/:id/versions')
  @HttpCode(201)
  async reviseRole(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaRoleVersionValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaRoleVersion.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaRoleVersion.parse(await this.services.drama.reviseRole({ userId, roleId: id, ...parsed.data }));
  }

  @Post('/projects/:id/scenes')
  @HttpCode(201)
  async createScene(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaSceneValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaScene.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaScene.parse(await this.services.drama.createScene({ userId, projectId: id, ...parsed.data }));
  }

  @Post('/scenes/:id/versions')
  @HttpCode(201)
  async reviseScene(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaSceneVersionValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaSceneVersion.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaSceneVersion.parse(await this.services.drama.reviseScene({ userId, sceneId: id, ...parsed.data }));
  }

  @Post('/projects/:id/shots')
  @HttpCode(201)
  async createShot(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaStoryboardShotValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaStoryboardShot.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaStoryboardShot.parse(await this.services.drama.createShot({ userId, projectId: id, ...parsed.data }));
  }

  @Post('/shots/:id/candidates')
  @HttpCode(201)
  async createCandidate(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaStoryboardCandidateValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaStoryboardCandidate.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return DramaStoryboardCandidate.parse(await this.services.drama.createCandidate({ userId, shotId: id, ...parsed.data }));
  }

  @Post('/candidates/:id/select')
  async selectCandidate(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaStoryboardCandidateValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return DramaStoryboardCandidate.parse(await this.services.drama.selectCandidate({ userId, candidateId: id }));
  }

  @Post('/candidates/:id/image-jobs')
  @HttpCode(200)
  async submitImageJob(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaImageJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = SubmitDramaImageJob.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    if (!(typeof this.available === 'function' ? this.available() : this.available)) {
      throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Generation unavailable');
    }
    return DramaImageJobView.parse(await this.services.dramaImages.create({ userId, candidateId: id, ...parsed.data }));
  }

  @Get('/image-jobs/:id')
  async getImageJob(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaImageJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaImages.get({ userId, jobId: id });
    if (job.target !== 'candidate') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Candidate image job not found');
    return DramaImageJobView.parse(job);
  }

  @Get('/image-jobs/:id/media')
  async imageMedia(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaImageAccessValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaImages.get({ userId, jobId: id });
    if (job.target !== 'candidate') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Candidate image job not found');
    if (job.status !== 'succeeded') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Media not ready');
    const asset = await this.services.dramaImageAssets.get({ userId, jobId: id });
    if (!this.objectStore) throw new ServiceUnavailableException();
    const seconds = Math.min(600, Math.floor((Date.parse(asset.expiresAt) - Date.now()) / 1000));
    if (seconds < 1) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Media expired');
    const url = await this.objectStore.access(asset.objectKey, seconds, 'image/png');
    return DramaImageAccess.parse({ assetId: asset.id, jobId: id, url, urlExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      expiresAt: asset.expiresAt, sha256: asset.sha256, byteLength: asset.byteLength, width: asset.width, height: asset.height });
  }

  @Post('/candidates/:id/plan-video-quote')
  @HttpCode(200)
  async planVideoQuote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const request = PlanVideoRequest.safeParse(body);
    if (!request.success || !DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    return PlanVideoQuote.parse(await this.services.dramaShotVideos.quotePlan({ userId, candidateId: id, ...request.data, mockAvailable: this.planImageMock && !!this.objectStore }));
  }
  @Post('/candidates/:id/plan-video-jobs')
  @HttpCode(200)
  async submitPlanVideo(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const request = SubmitPlanVideo.safeParse(body);
    if (!request.success || !DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaShotVideos.createPlan({ userId, candidateId: id, ...request.data, mockAvailable: this.planImageMock && !!this.objectStore });
    return DramaShotVideoJobView.parse({ id: job.id, shotId: job.shotId, candidateId: job.candidateId, requestKey: job.requestKey, status: job.status, failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt });
  }
  @Get('/candidates/:id/plan-video-jobs')
  async latestPlanVideo(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const jobs = await this.services.dramaShotVideos.listForCandidates({ userId, candidateIds: [id] }); const job = jobs[0];
    return job?.plan ? DramaShotVideoJobView.parse({ id: job.id, shotId: job.shotId, candidateId: job.candidateId, requestKey: job.requestKey, status: job.status, failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt }) : null;
  }
  @Post('/candidates/:id/video-jobs')
  @HttpCode(200)
  async submitVideoJob(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaShotVideoJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = SubmitDramaShotVideoJob.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    if (!(typeof this.available === 'function' ? this.available() : this.available)) {
      throw new DomainError(503, ErrorCode.GENERATION_UNAVAILABLE, 'Generation unavailable');
    }
    const job = await this.services.dramaShotVideos.createForCandidate({ userId, candidateId: id, ...parsed.data });
    return DramaShotVideoJobView.parse({ id: job.id, shotId: job.shotId, candidateId: job.candidateId, status: job.status,
      failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt });
  }

  @Get('/video-jobs/:id')
  async getVideoJob(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaShotVideoJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaShotVideos.get({ userId, jobId: id });
    return DramaShotVideoJobView.parse({ id: job.id, shotId: job.shotId, candidateId: job.candidateId, status: job.status,
      failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt });
  }

  @Get('/video-jobs/:id/media')
  async videoMedia(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaShotVideoAccessValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaShotVideos.get({ userId, jobId: id });
    if (job.status !== 'succeeded') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Media not ready');
    const asset = await this.services.dramaShotVideoAssets.get({ userId, jobId: id });
    if (!this.objectStore) throw new ServiceUnavailableException();
    const seconds = Math.min(600, Math.floor((Date.parse(asset.expiresAt) - Date.now()) / 1000));
    if (seconds < 1) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Media expired');
    const url = await this.objectStore.access(asset.objectKey, seconds, 'video/mp4');
    return DramaShotVideoAccess.parse({ assetId: asset.id, jobId: id, url, urlExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      expiresAt: asset.expiresAt, sha256: asset.sha256, byteLength: asset.byteLength, width: asset.width, height: asset.height, durationMs: asset.durationMs });
  }

  @Get('/storyboard-plans/:id/exports')
  async listPlanExports(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!StoryboardPlan.shape.id.safeParse(id).success) throw new BadRequestException();
    const jobs = await this.services.dramaExports.listForPlan({ userId, planId: id });
    return PlanExportList.parse(jobs.map(job => ({ id: job.id, projectId: job.projectId, episodeNumber: job.episodeNumber, requestKey: job.requestKey, status: job.status, failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt })));
  }
  @Post('/projects/:id/exports')
  @HttpCode(201)
  async createExport(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<DramaExportJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = CreateDramaExport.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const { job } = await this.services.dramaExports.create({ userId, projectId: id, ...parsed.data });
    return DramaExportJobView.parse({ id: job.id, projectId: job.projectId, episodeNumber: job.episodeNumber, requestKey: job.requestKey,
      status: job.status, failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt });
  }

  @Get('/exports/:id')
  async getExport(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaExportJobViewValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaExports.get({ userId, jobId: id });
    return DramaExportJobView.parse({ id: job.id, projectId: job.projectId, episodeNumber: job.episodeNumber, requestKey: job.requestKey,
      status: job.status, failureCode: job.failureCode, createdAt: job.createdAt, finishedAt: job.finishedAt });
  }

  @Get('/exports/:id/media')
  async exportMedia(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<DramaExportAccessValue> {
    const { userId } = await principal(this.services, authorization);
    if (!DramaProjectView.shape.id.safeParse(id).success) throw new BadRequestException();
    const job = await this.services.dramaExports.get({ userId, jobId: id });
    if (job.status !== 'succeeded') throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Media not ready');
    const asset = await this.services.dramaExportAssets.get({ userId, jobId: id });
    if (!this.objectStore) throw new ServiceUnavailableException();
    const seconds = Math.min(600, Math.floor((Date.parse(asset.expiresAt) - Date.now()) / 1000));
    if (seconds < 1) throw new DomainError(410, ErrorCode.ASSET_EXPIRED, 'Media expired');
    const url = await this.objectStore.access(asset.objectKey, seconds, 'video/mp4');
    return DramaExportAccess.parse({ assetId: asset.id, jobId: id, url, urlExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      expiresAt: asset.expiresAt, sha256: asset.sha256, byteLength: asset.byteLength, width: asset.width, height: asset.height, durationMs: asset.durationMs });
  }
}

@Controller('/v2/ops/review/generations')
class OpsReviewController {
  constructor(
    @Inject(SERVICES) private readonly services: Services,
    @Inject(OPS_TOKEN) private readonly opsToken: string | null,
  ) {}

  private assertOpsToken(header: string | undefined) {
    if (!this.opsToken) throw new ServiceUnavailableException();
    const expected = Buffer.from(this.opsToken);
    const given = Buffer.from(header ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Ops token required');
    }
  }

  @Get()
  async list(@Headers('x-ops-token') token: string | undefined): Promise<OpsReviewList> {
    this.assertOpsToken(token);
    return OpsReviewList.parse({ items: await this.services.opsReview.list() });
  }

  @Post('/:id/receipt')
  @HttpCode(200)
  async receipt(@Headers('x-ops-token') token: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<OpsReviewActionResult> {
    this.assertOpsToken(token);
    if (!GenerationView.shape.id.safeParse(id).success) throw new BadRequestException();
    const parsed = OpsReceiptRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return OpsReviewActionResult.parse(await this.services.opsReview.receipt({ jobId: id, providerTaskId: parsed.data.providerTaskId }));
  }

  @Post('/:id/reject')
  @HttpCode(200)
  async reject(@Headers('x-ops-token') token: string | undefined, @Param('id') id: string): Promise<OpsReviewActionResult> {
    this.assertOpsToken(token);
    if (!GenerationView.shape.id.safeParse(id).success) throw new BadRequestException();
    return OpsReviewActionResult.parse(await this.services.opsReview.reject({ jobId: id }));
  }
}

@Controller('/v2/ops/review/drama-scripts')
class ScriptReviewController {
  constructor(@Inject(SERVICES) private readonly services: Services, @Inject(OPS_TOKEN) private readonly opsToken: string | null) {}
  private authorize(token: string | undefined) {
    if (!this.opsToken) throw new ServiceUnavailableException();
    const expected = Buffer.from(this.opsToken); const given = Buffer.from(token ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Ops token required');
  }
  @Get()
  async list(@Headers('x-ops-token') token: string | undefined, @Query() query: unknown) {
    this.authorize(token); const parsed = ScriptReviewQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return ScriptReviewList.parse(await this.services.opsScriptReview.list(parsed.data));
  }
  @Post('/:id')
  @HttpCode(200)
  async resolve(@Headers('x-ops-token') token: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    this.authorize(token); const parsed = ReviewScriptRequest.safeParse(body);
    if (!DramaScriptJobView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return ScriptReviewResult.parse(await this.services.opsScriptReview.resolve({ jobId: id, request: parsed.data }));
  }
}

@Controller('/v2/marketing/copy')
class MarketingCopyController {
  constructor(@Inject(SERVICES) private readonly services: Services, @Inject(COPY_ADMISSION) private readonly admission: CopyAdmission | (() => CopyAdmission)) {}
  private currentAdmission() { return typeof this.admission === 'function' ? this.admission() : this.admission; }
  @Post('/quote')
  @HttpCode(200)
  async quote(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = MarketingCopyInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException(); return MarketingCopyQuote.parse(await this.services.marketingCopies.quote({ userId, request: parsed.data, admission: this.currentAdmission() }));
  }
  @Post('/jobs')
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = SubmitMarketingCopy.safeParse(body);
    if (!parsed.success) throw new BadRequestException(); return MarketingCopyJob.parse(await this.services.marketingCopies.create({ userId, request: parsed.data, admission: this.currentAdmission() }));
  }
  @Get('/jobs/latest')
  async latest(@Headers('authorization') authorization: string | undefined, @Query() query: unknown) {
    const { userId } = await principal(this.services, authorization); const parsed = MarketingCopyQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(); return MarketingCopyJob.nullable().parse(await this.services.marketingCopies.latest({ userId, category: parsed.data.category }));
  }
  @Get('/jobs/:id')
  async get(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const { userId } = await principal(this.services, authorization);
    if (!MarketingCopyJob.shape.id.safeParse(id).success) throw new BadRequestException(); return MarketingCopyJob.parse(await this.services.marketingCopies.get({ userId, jobId: id }));
  }
}
@Controller('/v2/marketing')
class MarketingPlanController {
  constructor(@Inject(SERVICES) private readonly services: Services) {}
  @Post('/production-plan')
  @HttpCode(200)
  async plan(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    await principal(this.services, authorization); const request = MarketingProductionRequest.safeParse(body);
    if (!request.success) throw new BadRequestException(); return MarketingProductionPlan.parse(buildMarketingProductionPlan(request.data));
  }
}
@Controller('/v2/ops/review/marketing-copy')
class CopyReviewController {
  constructor(@Inject(SERVICES) private readonly services: Services, @Inject(OPS_TOKEN) private readonly opsToken: string | null) {}
  private authorize(token: string | undefined) {
    if (!this.opsToken) throw new ServiceUnavailableException(); const expected = Buffer.from(this.opsToken); const given = Buffer.from(token ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Ops token required');
  }
  @Get()
  async list(@Headers('x-ops-token') token: string | undefined) { this.authorize(token); return MarketingCopyReviewList.parse(await this.services.opsCopyReview.list()); }
  @Post('/:id')
  @HttpCode(200)
  async resolve(@Headers('x-ops-token') token: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    this.authorize(token); const parsed = ReviewScriptRequest.safeParse(body);
    if (!MarketingCopyJob.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException(); return MarketingCopyJob.parse(await this.services.opsCopyReview.resolve({ jobId: id, request: parsed.data }));
  }
}

@Module({})
class ApplicationModule {}

@Controller('/v2/ops/review/portraits')
class PortraitReviewController {
  constructor(@Inject(SERVICES) private readonly services: Services, @Inject(OPS_TOKEN) private readonly opsToken: string | null) {}
  private authorize(token: string | undefined) {
    if (!this.opsToken) throw new ServiceUnavailableException();
    const expected = Buffer.from(this.opsToken); const given = Buffer.from(token ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Ops token required');
  }
  @Get()
  async list(@Headers('x-ops-token') token: string | undefined, @Query() query: unknown) {
    this.authorize(token); const parsed = PortraitReviewQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return PortraitReviewList.parse(await this.services.opsPortraitReview.list(parsed.data));
  }
  @Post('/:id')
  @HttpCode(200)
  async resolve(@Headers('x-ops-token') token: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    this.authorize(token); const parsed = ReviewPortraitRequest.safeParse(body);
    if (!PortraitJobView.shape.id.safeParse(id).success || !parsed.success) throw new BadRequestException();
    return PortraitReviewResult.parse(await this.services.opsPortraitReview.resolve({ jobId: id, request: parsed.data }));
  }
}

/** Caller owns init/listen and close; production bootstrap enables signal hooks. */
export async function createApplication(options: {
  config: ApiConfig;
  database?: DatabaseConnection;
  services?: Services;
  // Production bootstrap leaves admission closed until the execution chain is wired.
  generationAvailable?: boolean | (() => boolean);
  nativeMarketingMockAvailable?: boolean;
  nativeMarketingOffer?: () => NativeMarketingOffer | undefined;
  marketingCopyAdmission?: () => CopyAdmission;
  dramaScriptMockAvailable?: boolean;
  marketingCopyMockAvailable?: boolean;
  planImageMockAvailable?: boolean;
  objectStore?: ObjectStore;
}): Promise<NestFastifyApplication> {
  const services = options.services ?? createServices(options.config.databaseUrl);
  const database = options.database ?? services;
  const adapter = new FastifyAdapter({
    logger: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    frameworkErrors: (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const status = error.statusCode ?? 500;
      sendErrorResponse(status, request, reply);
    },
  });
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  try {
    await adapter.getInstance().register(multipart, { limits: { fileSize: MATERIAL_MAX_BYTES, files: 1 } });
    const app = await NestFactory.create<NestFastifyApplication>({
      module: ApplicationModule,
      controllers: [NativeMarketingController, HealthController, AccountController, GenerationController, MaterialsController, DramaController, OpsReviewController, ScriptReviewController, PortraitReviewController, MarketingCopyController, CopyReviewController, MarketingPlanController],
      providers: [{ provide: DATABASE, useValue: database }, { provide: SERVICES, useValue: services },
        { provide: GENERATION_AVAILABLE, useValue: options.generationAvailable ?? false },
        { provide: NATIVE_MARKETING_MOCK, useValue: options.nativeMarketingMockAvailable ?? false },
        { provide: NATIVE_MARKETING_OFFER, useValue: options.nativeMarketingOffer ?? options.config.nativeMarketingOffer ?? null },
        { provide: SCRIPT_ADMISSION, useValue: { offer: options.config.scriptOffer ?? null, mockAvailable: options.dramaScriptMockAvailable ?? false } satisfies ScriptAdmission },
        { provide: BATCH_ADMISSION, useValue: { offer: options.config.batchOffer ?? null, mockAvailable: options.dramaScriptMockAvailable ?? false } satisfies ScriptAdmission },
        { provide: COPY_ADMISSION, useValue: options.marketingCopyAdmission ?? ({ offer: options.config.copyOffer ?? null, mockAvailable: options.marketingCopyMockAvailable ?? false } satisfies CopyAdmission) },
        { provide: PORTRAIT_OFFER, useValue: options.config.portraitOffer ?? null },
        { provide: PLAN_IMAGE_MOCK, useValue: options.planImageMockAvailable ?? false },
        { provide: OBJECT_STORE, useValue: options.objectStore ?? null },
        { provide: OPS_TOKEN, useValue: options.config.opsToken ?? null }, DatabaseLifecycle],
    }, adapter, { logger: false, abortOnError: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    // Taro H5 uploadFile/downloadFile 固定 withCredentials=true（taro-h5 upload.js 默认值），
    // 跨域上传要求响应带 Access-Control-Allow-Credentials: true，否则被浏览器直接拦截。
    if (options.config.corsOrigins?.length) app.enableCors({ origin: options.config.corsOrigins, credentials: true });
    return app;
  } catch (error) {
    await adapter.close();
    await Promise.all([database.close(), ...(database !== services ? [services.close()] : [])]);
    throw error;
  }
}
