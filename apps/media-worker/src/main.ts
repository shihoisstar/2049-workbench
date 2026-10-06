import { access } from 'node:fs/promises';
import { NativeConnection, Worker } from '@temporalio/worker';
import { ApplicationFailure } from '@temporalio/common';
import { createServices, DomainError } from '@wb/server';
import { createObjectStore, readObjectStoreConfig } from '@wb/media';
import { createPublishVideoActivity } from './activity';

async function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
  const services = createServices(required('API_NEXT_DATABASE_URL'));
  const store = createObjectStore(readObjectStoreConfig());
  let connection: NativeConnection | undefined;
  try {
    const fontFile = required('MEDIA_FONT_FILE');
    await access(fontFile);
    await services.probe(); await store.probe();
    connection = await NativeConnection.connect({ address: required('TEMPORAL_ADDRESS') });
    const publish = createPublishVideoActivity(services, store, fontFile);
    const worker = await Worker.create({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      taskQueue: required('TEMPORAL_MEDIA_TASK_QUEUE'), maxConcurrentActivityTaskExecutions: 1, shutdownGraceTime: '10 seconds',
      activities: { publishVideo: async (input: Parameters<typeof publish>[0]) => {
        try { return await publish(input); }
        catch (error) {
          if (error instanceof DomainError && error.statusCode < 500) throw ApplicationFailure.nonRetryable('Media publication rejected', `DOMAIN_${error.code}`);
          throw ApplicationFailure.retryable('Media processing unavailable', 'MEDIA_PROCESSING_FAILED');
        }
      } },
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { if (worker.getState() === 'RUNNING') worker.shutdown(); });
    console.info(JSON.stringify({ event: 'media_worker_started' }));
    await worker.run();
  } finally { await connection?.close(); await services.close(); store.close(); }
}
void main().catch(() => { console.error(JSON.stringify({ event: 'media_worker_failed' })); process.exitCode = 1; });
