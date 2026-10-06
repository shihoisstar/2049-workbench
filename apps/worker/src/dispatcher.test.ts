import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationDelivery, GenerationOutbox } from '@wb/server';
import { dispatchGeneration } from './dispatcher';
import { readWorkerConfig } from './config';

const delivery: GenerationDelivery = { id: 'event', jobId: 'job', userId: 'user', workflowId: 'generation:job', leaseToken: 'lease', type: 'generation.requested', attempt: 1 };
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
