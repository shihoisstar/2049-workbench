import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, OnApplicationShutdown,
  Param, Post, ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { API_VERSION, ErrorCode, GuestBootstrapRequest, GuestSession, HealthResponse, WalletSummary,
  GenerationSettings, GenerationQuote, GenerationView, MediaAccess, SubmitGeneration, generationQuoteVersion, VIDEO_PRICING } from '@wb/contracts';
import type { ObjectStore } from '@wb/media';
import { createServices, DomainError } from '@wb/server';
import type { Services } from '@wb/server';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from './config';
import type { DatabaseConnection } from './database';
import { ApiExceptionFilter, sendErrorResponse } from './errors';

const DATABASE = Symbol('DATABASE');
const SERVICES = Symbol('SERVICES');
const GENERATION_AVAILABLE = Symbol('GENERATION_AVAILABLE');
const OBJECT_STORE = Symbol('OBJECT_STORE');

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
  ) {}

  async onApplicationShutdown(): Promise<void> {
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

  @Post('/auth/deactivate')
  @HttpCode(204)
  async deactivate(@Headers('authorization') authorization: string | undefined): Promise<void> {
    const { userId } = await this.principal(authorization);
    await this.services.identity.deactivate(userId);
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

@Module({})
class ApplicationModule {}

/** Caller owns init/listen and close; production bootstrap enables signal hooks. */
export async function createApplication(options: {
  config: ApiConfig;
  database?: DatabaseConnection;
  services?: Services;
  // Production bootstrap leaves admission closed until the execution chain is wired.
  generationAvailable?: boolean | (() => boolean);
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
    const app = await NestFactory.create<NestFastifyApplication>({
      module: ApplicationModule,
      controllers: [HealthController, AccountController, GenerationController],
      providers: [{ provide: DATABASE, useValue: database }, { provide: SERVICES, useValue: services },
        { provide: GENERATION_AVAILABLE, useValue: options.generationAvailable ?? false },
        { provide: OBJECT_STORE, useValue: options.objectStore ?? null }, DatabaseLifecycle],
    }, adapter, { logger: false, abortOnError: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    if (options.config.corsOrigins?.length) app.enableCors({ origin: options.config.corsOrigins });
    return app;
  } catch (error) {
    await adapter.close();
    await Promise.all([database.close(), ...(database !== services ? [services.close()] : [])]);
    throw error;
  }
}
