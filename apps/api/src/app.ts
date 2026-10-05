import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import type { Queue } from 'bullmq';

import { createDb } from './db';
import { ContentSafetyService, loadBannedWords } from './content-safety';
import { registerAuthRoutes } from './routes/auth';
import { registerImageRoutes } from './routes/images';
import { registerFeedbackRoutes } from './routes/feedback';
import { registerHealthRoutes } from './routes/health';
import { registerPolishRoutes } from './routes/polish';
import { registerStoreRoutes } from './routes/store';
import { registerTaskRoutes } from './routes/tasks';
import { registerUploadRoutes } from './routes/uploads';
import { registerTemplateRoutes } from './routes/templates';
import { registerWalletRoutes } from './routes/wallet';
import { StoreService } from './store';
import { TaskService } from './tasks';
import { WalletService } from './wallet';
import { createRedisConnection, createTaskQueue, type TaskJobData } from './queue';
import { LocalDiskStorage } from './storage';
import { buildGatewayRouterFromEnv } from './gateway-setup';

export interface AppOptions {
  databaseUrl: string;
  jwtSecret: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof createDb>['db'];
    wallet: WalletService;
    tasks: TaskService;
    store: StoreService;
    storage: LocalDiskStorage;
  }
}

/** 组装应用(routes 经闭包拿依赖;结构对齐 2049-agent apps/server,不做装饰器花活)。 */
export function buildApp(opts: AppOptions): FastifyInstance {
  // T3.3:结构化日志(pino)+ request-id;authorization 一律脱敏
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie'] },
    },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  });
  const { db, client } = createDb(opts.databaseUrl);
  app.addHook('onClose', async () => {
    await client.end();
    await queuePromise?.then((q) => q.close()).catch(() => undefined);
  });

  // H5 端跨源(开发期全放行;生产按域名收窄,随部署工单)
  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(fjwt, { secret: opts.jwtSecret });

  const wallet = new WalletService(db);
  const tasks = new TaskService(db, wallet);
  const store = new StoreService(db, wallet);
  const safety = new ContentSafetyService(loadBannedWords());
  // V0 本地盘存储(生产换 S3 兼容实现,接口不变);成片经 /videos/ 静态公开
  const storage = new LocalDiskStorage({ rootDir: join(process.cwd(), 'storage') });
  app.decorate('db', db);
  app.decorate('wallet', wallet);
  app.decorate('tasks', tasks);
  app.decorate('store', store);
  app.decorate('safety', safety);
  app.decorate('storage', storage);

  mkdirSync(join(process.cwd(), 'storage'), { recursive: true });
  void app.register(fastifyStatic, { root: join(process.cwd(), 'storage', 'videos'), prefix: '/videos/' });

  // 入队惰性建连:api 进程只 add job,消费在 worker 进程(REDIS_URL 未配时显式报错)
  let queuePromise: Promise<Queue<TaskJobData>> | null = null;
  async function enqueue(taskId: string): Promise<void> {
    if (!process.env.REDIS_URL) {
      throw Object.assign(new Error('REDIS_URL 未配置,无法入队'), { statusCode: 503 });
    }
    if (!queuePromise) {
      queuePromise = Promise.resolve(createTaskQueue(createRedisConnection(process.env.REDIS_URL)));
    }
    const q: Queue<TaskJobData> = await queuePromise;
    await q.add('submit', { taskId }, { jobId: `submit:${taskId}:${Date.now()}` });
  }

  registerHealthRoutes(app);
  registerAuthRoutes(app, db, wallet);
  registerTemplateRoutes(app, db);
  registerPolishRoutes(app, buildGatewayRouterFromEnv());
  registerImageRoutes(app, buildGatewayRouterFromEnv());
  registerFeedbackRoutes(app, db);
  registerWalletRoutes(app, wallet);
  registerStoreRoutes(app, store);
  registerUploadRoutes(app, storage);
  registerTaskRoutes(app, { tasks, safety, enqueue });

  return app;
}
