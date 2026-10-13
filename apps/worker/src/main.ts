import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { atlasVideoAdapter, createGatewayRouter } from '@wb/model-gateway';
import type { ChannelView, VideoAdapter } from '@wb/model-gateway';
import { createObjectStore, readOptionalObjectStoreConfig } from '@wb/media';
import { createServices, DomainError, NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from '@wb/server';
import { createMockScriptActivity, createScriptFailureActivity } from './drama-script';
import { createRealScriptActivity } from './real-drama-script';
import { createMarketingCopyActivity } from './marketing-copy';
import { dispatchMarketingCopy } from './dispatcher';
import { createPortraitActivity } from './role-portrait';
import { dispatchDramaScript } from './dispatcher';
import { readWorkerConfig } from './config';
import {
  dispatchCandidateImage, dispatchExport, dispatchShotVideo, runDispatcher, temporalCandidateImageWorkflowStarter,
  temporalExportWorkflowStarter, temporalShotVideoWorkflowStarter, temporalWorkflowStarter,
} from './dispatcher';
import { createCandidateImageFailActivity, createCandidateImagePublishingActivity, createCandidateImageSubmissionActivity } from './candidate-image';
import { createShotVideoFailActivity, createShotVideoPublishingActivity, createShotVideoSubmissionActivity } from './shot-video';
import { createVideoPollingActivity, createVideoSubmissionActivity } from './video-submission';
import type { VideoInput } from './workflow-types';
import { createPilotFetch } from './pilot-spending';

async function main() {
  const config = readWorkerConfig();
  const services = createServices(config.databaseUrl);
  const storeConfig = readOptionalObjectStoreConfig();
  // 未配置对象存储时启动降级:带素材的任务在提交时转入人工受理队列,无素材任务不受影响。
  const store = storeConfig ? createObjectStore(storeConfig) : undefined;
  let connection: Connection | undefined;
  let native: NativeConnection | undefined;
  let worker: Worker | undefined;
  const controller = new AbortController();
  try {
    const pilotFile = process.env.MARKETING_PILOT_APPROVAL_FILE;
    if (pilotFile && (config.mode !== 'mock' || config.script || config.portrait?.mode === 'atlas')) throw new Error('Pilot only permits marketing providers');
    const pilotFetch = pilotFile ? createPilotFetch(pilotFile, fetch, process.env.MARKETING_PILOT_NO_PAID_CALLS !== '1') : undefined;
    if (config.nativeMarketing && !store) throw new Error('Native marketing requires private media storage');
    await services.probe();
    await store?.probe();
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
    const nativeChannel: ChannelView | null = config.nativeMarketing ? { id: 2, name: 'native-marketing', providerName: 'atlas', weight: 1, rpmLimit: null, status: 'active', health: 'ok', secretRef: 'native-marketing', baseUrl: config.nativeMarketing.baseUrl,
      config: { model: NATIVE_VIDEO_TEXT_MODEL, modelI2v: NATIVE_VIDEO_REFERENCE_MODEL, videoModels: { '720p': NATIVE_VIDEO_TEXT_MODEL } } } : null;
    const nativeGateway = nativeChannel ? createGatewayRouter({ channels: [nativeChannel], adapters: { atlas: atlasVideoAdapter }, secretResolver: { resolve: async () => config.nativeMarketing!.secret }, maxAttempts: 1, fetchImpl: pilotFetch }) : null;
    const legacySubmit = createVideoSubmissionActivity({ services, gateway, channel, objectStore: store });
    const legacyPoll = createVideoPollingActivity({ services, gateway, channel });
    const nativeOptions = nativeChannel && nativeGateway ? { services, gateway: nativeGateway, channel: nativeChannel, objectStore: store, nativeBinding: config.nativeMarketing!.binding } : null;
    const nativeSubmit = nativeOptions ? createVideoSubmissionActivity(nativeOptions) : null;
    const nativePoll = nativeOptions ? createVideoPollingActivity(nativeOptions) : null;
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
        generateMockScript: createMockScriptActivity(services, config.mode === 'mock'),
        generateRealScript: createRealScriptActivity(services, config.script),
        generateMarketingCopy: createMarketingCopyActivity(services, config.copy, pilotFetch),
        advancePortrait: createPortraitActivity({ services, config: config.portrait, objectStore: store }),
        failScriptJob: createScriptFailureActivity(services),
        submitVideo: wrap(async input => {
          const job = await services.generation.get(input);
          if (job.nativeBinding) { if (!nativeSubmit) throw new Error('Native provider disabled'); return nativeSubmit(input); }
          return legacySubmit(input);
        }),
        pollVideo: wrap(async input => {
          const job = await services.generation.get(input);
          if (job.nativeBinding) { if (!nativePoll) throw new Error('Native provider disabled'); return nativePoll(input); }
          return legacyPoll(input);
        }),
        submitCandidateImage: createCandidateImageSubmissionActivity({ services }),
        publishCandidateImage: createCandidateImagePublishingActivity({ services, objectStore: store }),
        failCandidateImage: createCandidateImageFailActivity({ services }),
        submitShotVideo: createShotVideoSubmissionActivity({ services }),
        publishShotVideo: createShotVideoPublishingActivity({ services, objectStore: store }),
        failShotVideo: createShotVideoFailActivity({ services }),
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
    await Promise.all([
      execution,
      runDispatcher(services.generationOutbox, temporalWorkflowStarter(client, config.taskQueue, config.mediaTaskQueue), controller.signal),
      (async () => {
        while (!controller.signal.aborted) {
          try { await dispatchDramaScript(services.dramaScriptOutbox, client, config.taskQueue); }
          catch { console.warn(JSON.stringify({ event: 'drama_script_dispatch_retry' })); }
          try { await dispatchMarketingCopy(services.marketingCopyOutbox, client, config.taskQueue); }
          catch { console.warn(JSON.stringify({ event: 'marketing_copy_dispatch_retry' })); }
          try { if (await dispatchCandidateImage(services.dramaImageOutbox, temporalCandidateImageWorkflowStarter(client, config.taskQueue))) continue; }
          catch { console.warn(JSON.stringify({ event: 'drama_image_dispatch_retry' })); }
          try { if (await dispatchShotVideo(services.dramaShotVideoOutbox, temporalShotVideoWorkflowStarter(client, config.taskQueue))) continue; }
          catch { console.warn(JSON.stringify({ event: 'drama_shot_video_dispatch_retry' })); }
          try { if (await dispatchExport(services.dramaExportOutbox, temporalExportWorkflowStarter(client, config.taskQueue, config.mediaTaskQueue))) continue; }
          catch { console.warn(JSON.stringify({ event: 'drama_export_dispatch_retry' })); }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      })(),
    ]);
  } finally {
    controller.abort();
    await native?.close();
    await connection?.close();
    await services.close();
    store?.close();
  }
}

void main().catch(() => { console.error(JSON.stringify({ event: 'generation_worker_failed' })); process.exitCode = 1; });
