const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdirSync, readFileSync, writeFileSync, createWriteStream } = require('node:fs');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client, Connection, WorkflowFailedError } = require('@temporalio/client');
const { Worker, bundleWorkflowCode } = require('@temporalio/worker');
const { historyToJSON } = require('@temporalio/common/lib/proto-utils');

const evidence = resolve(process.env.EVIDENCE_DIR || 'evidence/latest');
mkdirSync(evidence, { recursive: true });
process.env.EVIDENCE_DIR = evidence;
process.env.TEMPORAL_TASK_QUEUE = `wb-spike-${randomUUID()}`;
const report = { sdk: '1.24.0', node: process.version, startedAt: new Date().toISOString(), assertions: [], histories: [] };
const workers = [];
const deadline = setTimeout(() => { console.error('Experiment exceeded 180 seconds'); process.exit(1); }, 180_000);

function startWorker(label) {
  const log = createWriteStream(join(evidence, `${label}.log`));
  const child = spawn(process.execPath, ['worker.cjs'], { env: process.env });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on('exit', () => log.end());
  workers.push(child);
  return child;
}
async function killWorker(child) {
  const exited = once(child, 'exit');
  assert.equal(child.kill('SIGKILL'), true);
  const [code, signal] = await exited;
  assert.equal(code, null); assert.equal(signal, 'SIGKILL');
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForState(handle, expected) {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    try { const state = await handle.query('state'); if (state.stage === expected) return state; }
    catch { /* A newly started worker may not yet have polled. */ }
    await wait(200);
  }
  throw new Error(`Did not reach ${expected}`);
}

async function main() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS });
  const client = new Client({ connection, namespace: 'default' });
  try {
    const originalWorker = startWorker('worker-before-kill');
    const workflowId = `episode-${randomUUID()}`;
    const episode = await client.workflow.start('episodeWorkflow', {
      workflowId, taskQueue: process.env.TEMPORAL_TASK_QUEUE, workflowExecutionTimeout: '2 minutes',
    });
    await waitForState(episode, 'waiting-approval');
    const before = await episode.describe();
    await killWorker(originalWorker);
    await episode.signal('approve');
    const offlineHistory = await episode.fetchHistory();
    assert.ok(offlineHistory.events.some((event) => event.workflowExecutionSignaledEventAttributes), 'approval must be durably recorded with no worker');
    report.assertions.push('Worker SIGKILL confirmed; approval signal accepted and in real server history while no worker exists');
    const replacementWorker = startWorker('worker-after-kill');
    assert.notEqual(originalWorker.pid, replacementWorker.pid);
    const failedState = await waitForState(episode, 'waiting-retry');
    assert.deepEqual(failedState.failed, ['shot-b']);
    assert.deepEqual(Object.keys(failedState.completed).sort(), ['shot-a', 'shot-c']);
    const after = await episode.describe();
    assert.equal(after.runId, before.runId, 'recovery must continue the original workflow run');
    report.assertions.push('Replacement process recovered the same workflow run and retained two successful child results');
    await episode.signal('retryShot', 'shot-b');
    assert.deepEqual(await episode.result(), {
      'shot-a': 'mock-asset:shot-a:1', 'shot-b': 'mock-asset:shot-b:2', 'shot-c': 'mock-asset:shot-c:1',
    });

    const faultHandles = [];
    for (const mode of ['non-retryable', 'timeout']) {
      const handle = await client.workflow.start('failureWorkflow', {
        workflowId: `${mode}-${randomUUID()}`, taskQueue: process.env.TEMPORAL_TASK_QUEUE,
        args: [mode], workflowExecutionTimeout: '30 seconds',
      });
      await assert.rejects(handle.result(), WorkflowFailedError);
      faultHandles.push(handle);
    }
    const activityLog = readFileSync(join(evidence, 'activities.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const shotStarts = activityLog.filter((event) => event.kind === 'start');
    assert.equal(shotStarts.length, 4);
    assert.equal(shotStarts.filter((event) => event.shot === 'shot-a').length, 1);
    assert.equal(shotStarts.filter((event) => event.shot === 'shot-c').length, 1);
    assert.equal(shotStarts.filter((event) => event.shot === 'shot-b').length, 2);
    const firstStarts = shotStarts.filter((event) => event.generation === 1);
    const firstFinishes = activityLog.filter((event) => ['complete', 'rejected'].includes(event.kind) && event.generation === 1);
    assert.ok(Math.max(...firstStarts.map((event) => event.time)) < Math.min(...firstFinishes.map((event) => event.time)), 'three child activities must overlap');
    assert.equal(activityLog.filter((event) => event.mode === 'non-retryable').length, 1);
    assert.equal(activityLog.filter((event) => event.mode === 'timeout').length, 2);
    report.assertions.push('3 child activities overlapped; only failed shot-b ran generation 2; successful shot-a/shot-c ran once');
    report.assertions.push('Non-retryable activity ran once; one-second timeout activity ran exactly twice then failed');

    const handles = [episode, ...faultHandles];
    for (const shot of ['shot-a', 'shot-b', 'shot-c']) handles.push(client.workflow.getHandle(`${workflowId}/${shot}/1`));
    handles.push(client.workflow.getHandle(`${workflowId}/shot-b/2`));
    await killWorker(replacementWorker);
    const bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./workflows.cjs') });
    for (let index = 0; index < handles.length; index++) {
      const handle = handles[index];
      const history = await handle.fetchHistory();
      const file = `history-${index}.json`;
      writeFileSync(join(evidence, file), historyToJSON(history));
      const diskHistory = JSON.parse(readFileSync(join(evidence, file), 'utf8'));
      await Worker.runReplayHistory({ workflowBundle: bundle }, diskHistory, handle.workflowId);
      report.histories.push({ workflowId: handle.workflowId, file, events: history.events.length, replay: 'accepted' });
    }
    report.assertions.push('All 7 exported history files replayed from disk with no live activity worker');
    const incompatibleBundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./incompatible-workflows.cjs') });
    await assert.rejects(Worker.runReplayHistory({ workflowBundle: incompatibleBundle },
      JSON.parse(readFileSync(join(evidence, 'history-0.json'), 'utf8')), workflowId), /[Nn]ondetermin|[Nn]on.?determin/);
    report.assertions.push('Deliberately incompatible workflow code was rejected by the real replay engine');
    report.activityCounts = { shots: 4, nonRetryable: 1, timedOut: 2 };
    report.completedAt = new Date().toISOString();
    writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const worker of workers) if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL');
    await connection.close();
    clearTimeout(deadline);
  }
}
main().catch((error) => {
  writeFileSync(join(evidence, 'failure.json'), JSON.stringify({ ...report, error: String(error), stack: error.stack }, null, 2));
  console.error(error); process.exitCode = 1;
});
