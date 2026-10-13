import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowNotFoundError } from '@temporalio/client';
import type { Client } from '@temporalio/client';
import type { DramaExportDelivery, DramaExportOutbox, DramaImageDelivery, DramaImageOutbox, GenerationDelivery, GenerationOutbox } from '@wb/server';
import {
  dispatchCandidateImage, dispatchExport, dispatchGeneration, temporalCandidateImageWorkflowStarter,
  temporalExportWorkflowStarter, temporalWorkflowStarter,
} from './dispatcher';
import { readWorkerConfig } from './config';

const delivery: GenerationDelivery = { id: 'event', jobId: 'job', userId: 'user', workflowId: 'generation:job', leaseToken: 'lease', type: 'generation.requested', attempt: 1 };
const resumeDelivery: GenerationDelivery = { ...delivery, type: 'generation.resume' };
const imageDelivery: DramaImageDelivery = { id: 'image-event', jobId: 'image-job', userId: 'user', workflowId: 'drama-image:image-job', leaseToken: 'lease', type: 'drama_image.requested', attempt: 1 };
const exportDelivery: DramaExportDelivery = { id: 'export-event', jobId: 'export-job', userId: 'user', workflowId: 'drama-export:export-job', leaseToken: 'lease', type: 'drama_export.requested', attempt: 1 };
function mockClient(calls: string[], overrides: { signalError?: Error } = {}): Client {
  return {
    workflow: {
      getHandle: (workflowId: string) => ({
        signal: async (name: string) => {
          calls.push(`signal:${workflowId}:${name}`);
          if (overrides.signalError) throw overrides.signalError;
        },
        describe: async () => ({ type: 'videoGeneration' }),
      }),
      start: async (type: string) => { calls.push(`start:${type}`); },
    },
  } as unknown as Client;
}
test('resume delivery signals the live workflow instead of starting a new one', async () => {
  const calls: string[] = [];
  const start = temporalWorkflowStarter(mockClient(calls), 'queue');
  await start(resumeDelivery);
  assert.deepEqual(calls, ['signal:generation:job:resumeVideoGeneration']);
});
test('resume delivery for a closed or missing workflow is treated as delivered', async () => {
  const calls: string[] = [];
  const missing = new WorkflowNotFoundError('not found', 'generation:job', undefined);
  const start = temporalWorkflowStarter(mockClient(calls, { signalError: missing }), 'queue');
  await start(resumeDelivery);
  assert.deepEqual(calls, ['signal:generation:job:resumeVideoGeneration']);
});
test('resume delivery rethrows signal failures other than not-found', async () => {
  const calls: string[] = [];
  const failure = new Error('signal lost');
  const start = temporalWorkflowStarter(mockClient(calls, { signalError: failure }), 'queue');
  await assert.rejects(start(resumeDelivery), error => error === failure);
  assert.deepEqual(calls, ['signal:generation:job:resumeVideoGeneration']);
});
test('candidate image resume uses its own signal and dispatcher acknowledges after acceptance', async () => {
  const calls: string[] = [];
  const start = temporalCandidateImageWorkflowStarter(mockClient(calls), 'queue');
  await start({ ...imageDelivery, type: 'drama_image.resume' });
  assert.deepEqual(calls, ['signal:drama-image:image-job:resumeCandidateImage']);
  const outbox: DramaImageOutbox = { claim: async () => imageDelivery, ack: async () => { calls.push('ack'); }, release: async () => { calls.push('release'); } };
  assert.equal(await dispatchCandidateImage(outbox, async () => { calls.push('start'); }), true);
  assert.deepEqual(calls.slice(-2), ['start', 'ack']);
});

test('export resume signals the live workflow and dispatch acknowledges after acceptance', async () => {
  const calls: string[] = [];
  const start = temporalExportWorkflowStarter(mockClient(calls), 'queue', 'media-queue');
  await start({ ...exportDelivery, type: 'drama_export.resume' });
  assert.deepEqual(calls, ['signal:drama-export:export-job:resumeDramaExport']);
  const outbox: DramaExportOutbox = { claim: async () => exportDelivery, ack: async () => { calls.push('ack'); }, release: async () => { calls.push('release'); } };
  assert.equal(await dispatchExport(outbox, async () => { calls.push('start'); }), true);
  assert.deepEqual(calls.slice(-2), ['start', 'ack']);
});

test('dispatcher acknowledges only after workflow acceptance', async () => {
  const calls: string[] = [];
  const outbox: GenerationOutbox = { claim: async () => delivery, ack: async () => { calls.push('ack'); }, release: async () => { calls.push('release'); } };
  assert.equal(await dispatchGeneration(outbox, async value => { assert.equal(value.workflowId, 'generation:job'); calls.push('start'); }), true);
  assert.deepEqual(calls, ['start', 'ack']);
});
test('ambiguous workflow start releases delivery and never acknowledges it', async () => {
  const calls: string[] = [];
  const outbox: GenerationOutbox = { claim: async () => delivery, ack: async () => { calls.push('ack'); }, release: async () => { calls.push('release'); } };
  await assert.rejects(dispatchGeneration(outbox, async () => { throw new Error('lost response'); }));
  assert.deepEqual(calls, ['release']);
});
test('ack failure preserves the original failure even when the lease can no longer be released', async () => {
  const failure = new Error('ack lost');
  const outbox: GenerationOutbox = { claim: async () => delivery, ack: async () => { throw failure; }, release: async () => { throw new Error('expired lease'); } };
  await assert.rejects(dispatchGeneration(outbox, async () => {}), error => error === failure);
});
test('empty queue does not start a workflow', async () => {
  const outbox: GenerationOutbox = { claim: async () => null, ack: async () => { assert.fail(); }, release: async () => { assert.fail(); } };
  assert.equal(await dispatchGeneration(outbox, async () => { assert.fail(); }), false);
});
test('worker requires explicit database/provider mode; mock does not need or load credentials', () => {
  assert.throws(() => readWorkerConfig({ DATABASE_URL: 'postgres://legacy/old' }));
  const env = { API_NEXT_DATABASE_URL: 'postgres://test@localhost/workbench_verify', WORKER_PROVIDER_MODE: 'mock', TEMPORAL_ADDRESS: 'localhost:7233', TEMPORAL_TASK_QUEUE: 'test' };
  assert.equal(readWorkerConfig(env).atlas, null);
  assert.throws(() => readWorkerConfig({ ...env, WORKER_PROVIDER_MODE: 'atlas' }));
  assert.throws(() => readWorkerConfig({ ...env, WORKER_PROVIDER_MODE: 'atlas', ATLAS_API_KEY: 'test', ATLAS_MODEL: 'model', ATLAS_MODEL_FAST: 'fast', ATLAS_BASE_URL: 'http://provider.invalid' }));
});
