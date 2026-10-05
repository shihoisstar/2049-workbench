import { join } from 'node:path';
/**
 * worker 独立入口:开发/生产以 `pnpm start:worker` 运行(与 api 进程分离,共享 postgres/redis)。
 */
import { buildGatewayRouterFromEnv } from './gateway-setup';
import { buildApp } from './app';
import { createRedisConnection, createTaskQueue } from './queue';
import { createTaskWorker } from './task-worker';
import { loadServerEnv, numEnv } from './env';

loadServerEnv();

export async function startWorker() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !process.env.REDIS_URL) {
    console.error('缺少 DATABASE_URL / REDIS_URL(参考 apps/api/.env.example)');
    process.exit(1);
  }
  const app = buildApp({ databaseUrl, jwtSecret: process.env.JWT_SECRET ?? 'dev-only' });
  const connection = createRedisConnection(process.env.REDIS_URL);
  const queue = createTaskQueue(connection);

  // BullMQ v6:周期任务用 upsertJobScheduler(repeat 选项已从 add 移除)
  await queue.upsertJobScheduler('sweep', { every: numEnv('TASK_SWEEP_INTERVAL_MS', 60_000) }, {
    name: 'sweep',
    data: {},
  });
  await queue.upsertJobScheduler('ttl-sweep', { every: numEnv('TASK_TTL_SWEEP_INTERVAL_MS', 3_600_000) }, {
    name: 'ttl-sweep',
    data: {},
  });

  const worker = createTaskWorker(
    {
      db: app.db,
      wallet: app.wallet,
      tasks: app.tasks,
      router: buildGatewayRouterFromEnv(),
      queue,
      timings: {
        pollIntervalMs: numEnv('TASK_POLL_INTERVAL_MS', 2_000, { min: 0 }),
        retryBackoffMs: numEnv('TASK_RETRY_BACKOFF_MS', 1_000, { min: 0 }),
      },
      storage: app.storage,
      watermarkAssetPath: join(__dirname, '..', 'assets', 'watermark.png'),
    },
    connection,
  );
  worker.on('failed', (job, err) => console.error(`[worker] job ${job?.name}/${job?.id} failed:`, err.message));
  console.log(`[worker] ready: poll=${numEnv('TASK_POLL_INTERVAL_MS', 2_000)}ms sweep=${numEnv('TASK_SWEEP_INTERVAL_MS', 60_000)}ms`);
  return { app, worker, queue, connection };
}

if (require.main === module) {
  startWorker();
}
