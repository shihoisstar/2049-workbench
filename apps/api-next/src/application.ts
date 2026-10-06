import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, OnApplicationShutdown,
  Post, ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { API_VERSION, ErrorCode, GuestBootstrapRequest, GuestSession, HealthResponse, WalletSummary } from '@wb/contracts';
import { createServices, DomainError } from '@wb/server';
import type { Services } from '@wb/server';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from './config';
import type { DatabaseConnection } from './database';
import { ApiExceptionFilter, sendErrorResponse } from './errors';

const DATABASE = Symbol('DATABASE');
const SERVICES = Symbol('SERVICES');

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
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '')?.[1];
    if (!token) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Session required');
    return this.services.identity.authenticate(token);
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

@Module({})
class ApplicationModule {}

/** Caller owns init/listen and close; production bootstrap enables signal hooks. */
export async function createApplication(options: {
  config: ApiConfig;
  database?: DatabaseConnection;
  services?: Services;
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
  });
  try {
    const app = await NestFactory.create<NestFastifyApplication>({
      module: ApplicationModule,
      controllers: [HealthController, AccountController],
      providers: [{ provide: DATABASE, useValue: database }, { provide: SERVICES, useValue: services }, DatabaseLifecycle],
    }, adapter, { logger: false, abortOnError: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    return app;
  } catch (error) {
    await adapter.close();
    await Promise.all([database.close(), ...(database !== services ? [services.close()] : [])]);
    throw error;
  }
}
