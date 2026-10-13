import { access, readFile } from 'node:fs/promises';
import { NativeConnection, Worker } from '@temporalio/worker';
import { ApplicationFailure } from '@temporalio/common';
import { createServices, DomainError } from '@wb/server';
import { createObjectStore, readObjectStoreConfig, createLocalNativeTranscriber } from '@wb/media';
import { createComposeDramaExportActivity, createPublishVideoActivity } from './activity';
import { createNativeMarketingActivity } from './native-marketing';

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
    const composeExport = createComposeDramaExportActivity(services, store, fontFile);
    const nativeConfig = [process.env.NATIVE_ASR_PYTHON, process.env.NATIVE_ASR_SCRIPT, process.env.NATIVE_ASR_MODEL_DIR];
    if (nativeConfig.some(Boolean) && !nativeConfig.every(Boolean)) throw new Error('Complete native ASR configuration required');
    for (const file of nativeConfig.filter((v): v is string => !!v)) await access(file);
    const native = createNativeMarketingActivity(services, store, fontFile, {
      transcribe: nativeConfig.every(Boolean) ? createLocalNativeTranscriber({ python: nativeConfig[0]!, script: nativeConfig[1]!, modelDirectory: nativeConfig[2]! }) : async () => { throw new Error('Native ASR is not configured'); },
      mockSource: async job => { const file = job.category === 'commerce' ? process.env.NATIVE_MOCK_COMMERCE_FILE : process.env.NATIVE_MOCK_STORE_FILE; if (!file) throw new Error('Native mock fixture missing'); return readFile(file); },
    });
    const worker = await Worker.create({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      taskQueue: required('TEMPORAL_MEDIA_TASK_QUEUE'), maxConcurrentActivityTaskExecutions: 1, shutdownGraceTime: '10 seconds',
      activities: {
        processNativeMarketing: async (input: Parameters<typeof native>[0]) => {
          try { return await native(input); } catch (error) {
            if (error instanceof DomainError && error.statusCode < 500) throw ApplicationFailure.nonRetryable('Native processing rejected', `DOMAIN_${error.code}`);
            throw ApplicationFailure.retryable('Native processing can resume from original source', 'NATIVE_PROCESSING_FAILED');
          }
        },
        publishVideo: async (input: Parameters<typeof publish>[0]) => {
          try { return await publish(input); }
          catch (error) {
            if (error instanceof DomainError && error.statusCode < 500) throw ApplicationFailure.nonRetryable('Media publication rejected', `DOMAIN_${error.code}`);
            throw ApplicationFailure.retryable('Media processing unavailable', 'MEDIA_PROCESSING_FAILED');
          }
        },
        composeDramaExport: async (input: Parameters<typeof composeExport>[0]) => {
          try { return await composeExport(input); }
          catch (error) {
            if (error instanceof DomainError && error.statusCode < 500) throw ApplicationFailure.nonRetryable('Export composition rejected', `DOMAIN_${error.code}`);
            throw ApplicationFailure.retryable('Export composition unavailable', 'EXPORT_COMPOSITION_FAILED');
          }
        },
      },
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { if (worker.getState() === 'RUNNING') worker.shutdown(); });
    console.info(JSON.stringify({ event: 'media_worker_started' }));
    await worker.run();
  } finally { await connection?.close(); await services.close(); store.close(); }
}
void main().catch(() => { console.error(JSON.stringify({ event: 'media_worker_failed' })); process.exitCode = 1; });
