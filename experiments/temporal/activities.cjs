const { appendFileSync } = require('node:fs');
const { join } = require('node:path');
const { activityInfo } = require('@temporalio/activity');
const { ApplicationFailure } = require('@temporalio/common');

function record(event) {
  const info = activityInfo();
  appendFileSync(join(process.env.EVIDENCE_DIR, 'activities.jsonl'), JSON.stringify({
    ...event, time: Date.now(), workflowId: info.workflowExecution.workflowId,
    activityAttempt: info.attempt, processId: process.pid,
  }) + '\n');
}

async function renderShot(shot, generation) {
  record({ kind: 'start', shot, generation });
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (shot === 'shot-b' && generation === 1) {
    record({ kind: 'rejected', shot, generation });
    throw ApplicationFailure.nonRetryable('Mock shot rejected; requires explicit retry', 'MockShotRejected');
  }
  record({ kind: 'complete', shot, generation });
  return `mock-asset:${shot}:${generation}`;
}

async function fault(mode) {
  record({ kind: 'fault', mode });
  if (mode === 'non-retryable') throw ApplicationFailure.nonRetryable('Invalid mock input', 'InvalidMockInput');
  if (mode === 'timeout') await new Promise(() => {});
  throw new Error(`unknown test mode ${mode}`);
}

module.exports = { renderShot, fault };
