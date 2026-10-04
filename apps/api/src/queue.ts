/**
 * BullMQ 队列装配。连接解析模式借 2049-agent apps/server/src/queue.ts
 * (numEnv 防 ".env 空串击穿 ??" 的坑;removeOnComplete/Fail 控制历史长度)。
 */
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

export const QUEUE_NAME = 'generate';
export type TaskJobName = 'submit' | 'poll' | 'sweep';

export interface TaskJobData {
  taskId?: string; // sweep 无
}

export function buildRedisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis URL protocol: ${url.protocol}`);
  }
  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath ? Number(dbPath) : undefined;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    maxRetriesPerRequest: null, // BullMQ 要求
  };
}

export function createRedisConnection(redisUrl: string): Redis {
  return new IORedis(redisUrl, buildRedisConnectionOptions(redisUrl));
}

export function createTaskQueue(connection: Redis): Queue<TaskJobData> {
  return new Queue<TaskJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
}
