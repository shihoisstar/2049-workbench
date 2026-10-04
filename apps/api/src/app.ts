import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import type { Queue } from 'bullmq';

import { createDb } from './db';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerStoreRoutes } from './routes/store';
import { registerTaskRoutes } from './routes/tasks';
import { registerWalletRoutes } from './routes/wallet';
import { StoreService } from './store';
import { TaskService } from './tasks';
import { WalletService } from './wallet';
import { createRedisConnection, createTaskQueue, type TaskJobData } from './queue';

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
  }
}

/** 组装应用(routes 经闭包拿依赖;结构对齐 2049-agent apps/server,不做装饰器花活)。 */
export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const { db, client } = createDb(opts.databaseUrl);
  app.addHook('onClose', async () => {
    await client.end();
    await queuePromise?.then((q) => q.close()).catch(() => undefined);
  });

  // H5 端跨源(开发期全放行;生产按域名收窄,随部署工单)
  app.register(cors, { origin: true });
  app.register(fjwt, { secret: opts.jwtSecret });

  const wallet = new WalletService(db);
  const tasks = new TaskService(db, wallet);
  const store = new StoreService(db, wallet);
  app.decorate('db', db);
  app.decorate('wallet', wallet);
  app.decorate('tasks', tasks);
  app.decorate('store', store);

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
  registerWalletRoutes(app, wallet);
  registerStoreRoutes(app, store);
  registerTaskRoutes(app, { tasks, enqueue });

  return app;
}
