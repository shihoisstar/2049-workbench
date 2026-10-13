import { setTimeout as delay } from 'node:timers/promises';
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import type { Client } from '@temporalio/client';
import type {
  DramaExportDelivery, DramaExportOutbox, DramaImageDelivery, DramaImageOutbox, DramaShotVideoDelivery,
  DramaShotVideoOutbox, GenerationDelivery, GenerationOutbox,
} from '@wb/server';
import { CANDIDATE_IMAGE_WORKFLOW, EXPORT_WORKFLOW, SHOT_VIDEO_WORKFLOW, VIDEO_WORKFLOW } from './workflow-types';
import { SCRIPT_WORKFLOW } from './workflow-types';
import { PORTRAIT_WORKFLOW } from './workflow-types';
import type { DramaScriptOutbox } from '@wb/server';
import type { CopyOutbox } from '@wb/server';
import { MARKETING_COPY_WORKFLOW } from './workflow-types';

export async function dispatchMarketingCopy(outbox: CopyOutbox, client: Client, taskQueue: string): Promise<boolean> {
  const delivery = await outbox.claim(); if (!delivery) return false;
  try {
    if (delivery.type === 'resume') {
      try { await client.workflow.getHandle(delivery.workflowId).signal('resumeMarketingCopy'); } catch (error) { if (!(error instanceof WorkflowNotFoundError)) throw error; }
    } else {
      try { await client.workflow.start(MARKETING_COPY_WORKFLOW, { workflowId: delivery.workflowId, taskQueue, workflowIdReusePolicy: 'REJECT_DUPLICATE', args: [{ userId: delivery.userId, jobId: delivery.jobId }] }); }
      catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error; if ((await client.workflow.getHandle(delivery.workflowId).describe()).type !== MARKETING_COPY_WORKFLOW) throw new Error('Copy workflow ID belongs to another type'); }
    }
    await outbox.ack(delivery); return true;
  } catch (error) { try { await outbox.release(delivery); } catch { /* A stale lease can be reclaimed. */ } throw error; }
}

export async function dispatchDramaScript(outbox: DramaScriptOutbox, client: Client, taskQueue: string): Promise<boolean> {
  const delivery = await outbox.claim();
  if (!delivery) return false;
  try {
    try { await client.workflow.start(SCRIPT_WORKFLOW, { workflowId: delivery.workflowId, taskQueue, workflowIdReusePolicy: 'REJECT_DUPLICATE', args: [{ userId: delivery.userId, jobId: delivery.jobId, ...(delivery.provider === 'atlas' ? { provider: 'atlas' } : {}) }] }); }
    catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      if ((await client.workflow.getHandle(delivery.workflowId).describe()).type !== SCRIPT_WORKFLOW) throw new Error('Workflow ID belongs to another workflow type');
    }
    await outbox.ack(delivery); return true;
  } catch (error) { try { await outbox.release(delivery); } catch { /* Expired leases are reclaimed. */ } throw error; }
}

export type WorkflowStarter = (delivery: GenerationDelivery) => Promise<void>;

export function temporalWorkflowStarter(client: Client, taskQueue: string, mediaTaskQueue?: string): WorkflowStarter {
  return async delivery => {
    if (delivery.type === 'generation.resume') {
      // 已结束的工作流没有可恢复的状态;resume 视为已送达,避免队列卡死。
      try { await client.workflow.getHandle(delivery.workflowId).signal('resumeVideoGeneration'); }
      catch (error) { if (!(error instanceof WorkflowNotFoundError)) throw error; }
      return;
    }
    try {
      await client.workflow.start(VIDEO_WORKFLOW, {
        workflowId: delivery.workflowId, taskQueue, workflowIdReusePolicy: 'REJECT_DUPLICATE',
        args: [{ jobId: delivery.jobId, userId: delivery.userId, ...(mediaTaskQueue ? { mediaTaskQueue } : {}), ...(delivery.nativeMarketing ? { nativeMarketing: true } : {}) }],
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(delivery.workflowId).describe();
      if (existing.type !== VIDEO_WORKFLOW) throw new Error('Workflow ID belongs to another workflow type');
    }
  };
}

export type CandidateImageWorkflowStarter = (delivery: DramaImageDelivery) => Promise<void>;
export function temporalCandidateImageWorkflowStarter(client: Client, taskQueue: string): CandidateImageWorkflowStarter {
  return async delivery => {
    const workflow = delivery.target === 'portrait' ? PORTRAIT_WORKFLOW : CANDIDATE_IMAGE_WORKFLOW;
    if (delivery.type === 'drama_image.resume') {
      try { await client.workflow.getHandle(delivery.workflowId).signal(delivery.target === 'portrait' ? 'resumeRolePortrait' : 'resumeCandidateImage'); }
      catch (error) { if (!(error instanceof WorkflowNotFoundError)) throw error; }
      return;
    }
    try {
      await client.workflow.start(workflow, { workflowId: delivery.workflowId, taskQueue,
        workflowIdReusePolicy: 'REJECT_DUPLICATE', args: [{ jobId: delivery.jobId, userId: delivery.userId }] });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(delivery.workflowId).describe();
      if (existing.type !== workflow) throw new Error('Workflow ID belongs to another workflow type');
    }
  };
}

export async function dispatchCandidateImage(outbox: DramaImageOutbox, start: CandidateImageWorkflowStarter): Promise<boolean> {
  const delivery = await outbox.claim();
  if (!delivery) return false;
  try { await start(delivery); await outbox.ack(delivery); return true; }
  catch (error) { try { await outbox.release(delivery); } catch { /* Expired leases are reclaimed by the next dispatcher. */ } throw error; }
}

export type ShotVideoWorkflowStarter = (delivery: DramaShotVideoDelivery) => Promise<void>;
export function temporalShotVideoWorkflowStarter(client: Client, taskQueue: string): ShotVideoWorkflowStarter {
  return async delivery => {
    if (delivery.type === 'drama_video.resume') {
      try { await client.workflow.getHandle(delivery.workflowId).signal('resumeShotVideo'); }
      catch (error) { if (!(error instanceof WorkflowNotFoundError)) throw error; }
      return;
    }
    try {
      await client.workflow.start(SHOT_VIDEO_WORKFLOW, { workflowId: delivery.workflowId, taskQueue,
        workflowIdReusePolicy: 'REJECT_DUPLICATE', args: [{ jobId: delivery.jobId, userId: delivery.userId }] });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(delivery.workflowId).describe();
      if (existing.type !== SHOT_VIDEO_WORKFLOW) throw new Error('Workflow ID belongs to another workflow type');
    }
  };
}

export async function dispatchShotVideo(outbox: DramaShotVideoOutbox, start: ShotVideoWorkflowStarter): Promise<boolean> {
  const delivery = await outbox.claim();
  if (!delivery) return false;
  try { await start(delivery); await outbox.ack(delivery); return true; }
  catch (error) { try { await outbox.release(delivery); } catch { /* Expired leases are reclaimed by the next dispatcher. */ } throw error; }
}

export type ExportWorkflowStarter = (delivery: DramaExportDelivery) => Promise<void>;
export function temporalExportWorkflowStarter(client: Client, taskQueue: string, mediaTaskQueue?: string): ExportWorkflowStarter {
  return async delivery => {
    if (delivery.type === 'drama_export.resume') {
      try { await client.workflow.getHandle(delivery.workflowId).signal('resumeDramaExport'); }
      catch (error) { if (!(error instanceof WorkflowNotFoundError)) throw error; }
      return;
    }
    if (!mediaTaskQueue) throw new Error('TEMPORAL_MEDIA_TASK_QUEUE required for drama export dispatch');
    try {
      await client.workflow.start(EXPORT_WORKFLOW, { workflowId: delivery.workflowId, taskQueue,
        workflowIdReusePolicy: 'REJECT_DUPLICATE', args: [{ jobId: delivery.jobId, userId: delivery.userId, mediaTaskQueue }] });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(delivery.workflowId).describe();
      if (existing.type !== EXPORT_WORKFLOW) throw new Error('Workflow ID belongs to another workflow type');
    }
  };
}

export async function dispatchExport(outbox: DramaExportOutbox, start: ExportWorkflowStarter): Promise<boolean> {
  const delivery = await outbox.claim();
  if (!delivery) return false;
  try { await start(delivery); await outbox.ack(delivery); return true; }
  catch (error) { try { await outbox.release(delivery); } catch { /* Expired leases are reclaimed by the next dispatcher. */ } throw error; }
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
