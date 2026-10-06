import { setTimeout as delay } from 'node:timers/promises';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import type { Client } from '@temporalio/client';
import type { GenerationDelivery, GenerationOutbox } from '@wb/server';
import { VIDEO_WORKFLOW } from './workflow-types';

export type WorkflowStarter = (delivery: GenerationDelivery) => Promise<void>;

export function temporalWorkflowStarter(client: Client, taskQueue: string, mediaTaskQueue?: string): WorkflowStarter {
  return async delivery => {
    try {
      await client.workflow.start(VIDEO_WORKFLOW, {
        workflowId: delivery.workflowId, taskQueue, workflowIdReusePolicy: 'REJECT_DUPLICATE',
        args: [{ jobId: delivery.jobId, userId: delivery.userId, ...(mediaTaskQueue ? { mediaTaskQueue } : {}) }],
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(delivery.workflowId).describe();
      if (existing.type !== VIDEO_WORKFLOW) throw new Error('Workflow ID belongs to another workflow type');
    }
  };
}

export async function dispatchGeneration(outbox: GenerationOutbox, start: WorkflowStarter): Promise<boolean> {
  const delivery = await outbox.claim();
  if (!delivery) return false;
  try {
    await start(delivery);
    await outbox.ack(delivery);
    return true;
  } catch (error) {
    // A lost start/ack response may have succeeded. Redelivery uses the same workflow ID.
    try { await outbox.release(delivery); } catch { /* Expired leases are reclaimed by the next dispatcher. */ }
    throw error;
  }
}

export async function runDispatcher(outbox: GenerationOutbox, start: WorkflowStarter, signal: AbortSignal) {
  while (!signal.aborted) {
    try { if (await dispatchGeneration(outbox, start)) continue; }
    catch { console.warn(JSON.stringify({ event: 'generation_dispatch_retry' })); }
    try { await delay(1000, undefined, { signal }); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}
