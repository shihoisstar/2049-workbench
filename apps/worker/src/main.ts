import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { atlasVideoAdapter, createGatewayRouter } from '@wb/model-gateway';
import type { ChannelView, VideoAdapter } from '@wb/model-gateway';
import { createServices, DomainError } from '@wb/server';
import { readWorkerConfig } from './config';
import { runDispatcher, temporalWorkflowStarter } from './dispatcher';
import { createVideoPollingActivity, createVideoSubmissionActivity } from './video-submission';
import type { VideoInput } from './workflow-types';

async function main() {
  const config = readWorkerConfig();
  const services = createServices(config.databaseUrl);
  let connection: Connection | undefined;
  let native: NativeConnection | undefined;
  let worker: Worker | undefined;
  const controller = new AbortController();
  try {
    await services.probe();
    const mock: VideoAdapter = {
      async submit() {
        console.info(JSON.stringify({ event: 'mock_provider_submit' }));
        return { providerTaskId: `mock-${randomUUID()}`, raw: {} };
      },
      async poll(_ctx, _channel, id) { return { status: 'succeeded', videoUrl: `https://mock.invalid/${id}.mp4`, raw: {} }; },
    };
    const channel: ChannelView = { id: 1, name: config.mode, providerName: config.mode, weight: 1, rpmLimit: null,
      status: 'active', health: 'ok', secretRef: 'worker-provider', baseUrl: config.atlas?.baseUrl ?? null,
      config: config.atlas ? { model: config.atlas.model, videoModels: { '480p': config.atlas.model, '720p': config.atlas.fastModel } } : {},
    };
    const gateway = createGatewayRouter({ channels: [channel], adapters: { [config.mode]: config.mode === 'mock' ? mock : atlasVideoAdapter },
      secretResolver: { resolve: async () => config.atlas?.secret ?? 'mock-only' }, maxAttempts: 1 });
    const wrap = <T>(activity: (input: VideoInput) => Promise<T>) => async (input: VideoInput): Promise<T> => {
      try { return await activity(input); }
      catch (error) {
        if (error instanceof DomainError && error.statusCode < 500) throw ApplicationFailure.nonRetryable('Video activity rejected', `DOMAIN_${error.code}`);
        throw ApplicationFailure.retryable('Video activity unavailable', 'VIDEO_ACTIVITY_UNAVAILABLE');
      }
    };
    connection = await Connection.connect({ address: config.address });
    native = await NativeConnection.connect({ address: config.address });
    const client = new Client({ connection, namespace: config.namespace });
    worker = await Worker.create({ connection: native, namespace: config.namespace, taskQueue: config.taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities: {
        submitVideo: wrap(createVideoSubmissionActivity({ services, gateway, channel })),
        pollVideo: wrap(createVideoPollingActivity({ services, gateway, channel })),
        failMedia: wrap(async (input: VideoInput) => {
          if ((await services.generation.get(input)).status === 'accepted') await services.generation.fail({ ...input, failureCode: 'MEDIA_PROCESSING_FAILED' });
        }),
      },
      maxConcurrentActivityTaskExecutions: 4, shutdownGraceTime: '5 seconds',
    });
    const stop = () => { controller.abort(); if (worker?.getState() === 'RUNNING') worker.shutdown(); };
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
    const execution = worker.run().finally(() => controller.abort());
    console.info(JSON.stringify({ event: 'generation_worker_started', mode: config.mode, taskQueue: config.taskQueue }));
    await Promise.all([execution, runDispatcher(services.generationOutbox, temporalWorkflowStarter(client, config.taskQueue, config.mediaTaskQueue), controller.signal)]);
  } finally {
    controller.abort();
    await native?.close();
    await connection?.close();
    await services.close();
  }
}

void main().catch(() => { console.error(JSON.stringify({ event: 'generation_worker_failed' })); process.exitCode = 1; });
