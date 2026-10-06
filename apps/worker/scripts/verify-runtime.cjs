const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { Client, Connection } = require('@temporalio/client');
const { Worker } = require('@temporalio/worker');
const { historyToJSON } = require('@temporalio/common/lib/proto-utils');
const postgres = require('postgres');
const { createServices } = require('@wb/server');
const { dispatchGeneration, temporalWorkflowStarter } = require('../dist/dispatcher');

const root = resolve(__dirname, '../../..');
const runId = `wb-worker-${randomUUID()}`;
const evidence = join(root, 'docs/验收留档/WORKER-2026-10-06', runId);
const owned = [];
const children = [];
let services, sql, connection;
const report = { runId, paidProviderCalls: 0 };
function save(name, value) {
  mkdirSync(evidence, { recursive: true });
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  const path = join(evidence, name);
  writeFileSync(path, content);
  assert.equal(readFileSync(path, 'utf8'), content, 'Evidence readback mismatch');
}
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, `Docker ${args[0]} failed`);
  return result.stdout.trim();
}
function startContainer(suffix, args) {
  const name = `${runId}-${suffix}`;
  docker(['run', '-d', '--name', name, '--label', `wb.worker-proof=${runId}`, ...args]);
  owned.push(name);
  return name;
}
async function eventually(check, timeout = 90000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(250);
  }
  throw new Error(`Runtime proof timed out${last ? ': ' + last.message : ''}`);
}
function launchWorker(env) {
  const child = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const item = { child, stdout: '', stderr: '' };
  item.exit = new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code, signal })); });
  child.stdout.on('data', chunk => { item.stdout += chunk; });
  child.stderr.on('data', chunk => { item.stderr += chunk; });
  children.push(item);
  return item;
}
async function forceStop(item) {
  if (item.child.exitCode === null && item.child.signalCode === null) item.child.kill('SIGKILL');
  await item.exit;
}

async function main() {
  try {
    const pg = startContainer('pg', ['-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
      '-e', 'POSTGRES_USER=wb', '-e', 'POSTGRES_PASSWORD=wb_dev_only', '-e', 'POSTGRES_DB=workbench_verify', 'postgres:16-alpine']);
    const temporal = startContainer('temporal', ['-p', '127.0.0.1::7233', '--cpus', '2', '--memory', '1g',
      'temporalio/temporal:1.9.1@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e',
      'server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/tmp/proof.sqlite', '--headless', '--log-level', 'warn']);
    await eventually(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'wb', '-d', 'workbench_verify'], { stdio: 'ignore', windowsHide: true }).status === 0);
    await eventually(() => spawnSync('docker', ['exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], { stdio: 'ignore', windowsHide: true }).status === 0);
    const port = (name, internal) => JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports[`${internal}/tcp`][0].HostPort;
    const databaseUrl = `postgres://wb:wb_dev_only@127.0.0.1:${port(pg, 5432)}/workbench_verify`;
    const address = `127.0.0.1:${port(temporal, 7233)}`;
    const env = { ...process.env, API_NEXT_DATABASE_URL: databaseUrl, WORKER_PROVIDER_MODE: 'mock', TEMPORAL_ADDRESS: address, TEMPORAL_NAMESPACE: 'default', TEMPORAL_TASK_QUEUE: runId };
    const migration = spawnSync(process.execPath, ['packages/server/scripts/migrate.cjs'], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(migration.status, 0, 'Isolated migration failed');
    services = createServices(databaseUrl);
    sql = postgres(databaseUrl, { max: 2 });
    connection = await Connection.connect({ address });
    const client = new Client({ connection });
    const starter = temporalWorkflowStarter(client, runId);
    const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const job = await services.generation.create({ userId, requestKey: randomUUID(), prompt: 'Runtime smoke fixture', resolution: '480p', aspectRatio: '9:16', durationSec: 5 });
    const workflowId = `generation:${job.id}`;
    let captured;
    await assert.rejects(dispatchGeneration({ ...services.generationOutbox, ack: async () => { throw new Error('Injected lost acknowledgement'); } }, async delivery => {
      captured = delivery;
      await starter(delivery);
    }));
    const handle = client.workflow.getHandle(workflowId);
    const originalRun = (await handle.describe()).runId;
    report.workflowId = workflowId;
    report.runIdBeforeRestart = originalRun;
    const query = () => connection.withDeadline(Date.now() + 4000, () => handle.query('videoGenerationStatus'));
    const first = launchWorker(env);
    await eventually(async () => (await query()).stage === 'awaiting_media');
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.outbox where job_id = ${job.id}`;
      return row.status === 'delivered' && row.attempts >= 2;
    });
    assert.equal((await services.providerSubmissions.get({ userId, jobId: job.id })).status, 'submitted');
    assert.equal((await services.billing.summary(userId)).balance, 3);
    report.redeliverySameRun = (await handle.describe()).runId === originalRun;
    assert.equal(report.redeliverySameRun, true);
    await forceStop(first);
    await handle.signal('resumeVideoGeneration');
    launchWorker(env);
    await eventually(async () => {
      const history = await handle.fetchHistory();
      return history.events.filter(event => event.activityTaskScheduledEventAttributes?.activityType?.name === 'pollVideo').length >= 2;
    });
    await eventually(async () => (await query()).stage === 'awaiting_media');
    report.runIdAfterRestart = (await handle.describe()).runId;
    assert.equal(report.runIdAfterRestart, originalRun);
    report.mockSubmissions = children.reduce((n, child) => n + (child.stdout.match(/"event":"mock_provider_submit"/g) ?? []).length, 0);
    assert.equal(report.mockSubmissions, 1);
    // Fixture-only terminal failure verifies signal-driven completion without faking a published asset.
    await services.generation.fail({ userId, jobId: job.id, failureCode: 'RUNTIME_TEST_CLEANUP' });
    await handle.signal('resumeVideoGeneration');
    await connection.withDeadline(Date.now() + 15000, () => handle.result());
    await starter(captured);
    report.closedWorkflowNotRestarted = (await handle.describe()).runId === originalRun;
    assert.equal(report.closedWorkflowNotRestarted, true);
    assert.equal((await services.billing.summary(userId)).balance, 80);
    const collisionId = `${workflowId}-collision`;
    await client.workflow.start('unrelatedWorkflow', { workflowId: collisionId, taskQueue: `${runId}-unused` });
    await assert.rejects(starter({ ...captured, workflowId: collisionId }));
    await client.workflow.getHandle(collisionId).terminate();
    report.foreignWorkflowRejected = true;
    const history = await handle.fetchHistory();
    save('history.json', historyToJSON(history));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, history, workflowId);
    report.replayAccepted = true;
    report.historyEvents = history.events.length;
    report.status = 'passed';
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    for (const child of children) await forceStop(child);
    await services?.close();
    await sql?.end();
    await connection?.close();
    for (const name of owned.reverse()) {
      const [container] = JSON.parse(docker(['inspect', name]));
      assert.equal(container.Config.Labels['wb.worker-proof'], runId);
      docker(['rm', '-f', '-v', container.Id]);
    }
    report.remainingContainers = docker(['ps', '-a', '--filter', `label=wb.worker-proof=${runId}`, '--format', '{{.Names}}']).split('\n').filter(Boolean);
    save('report.json', report);
    children.forEach((child, index) => { save(`worker-${index}.stdout.log`, child.stdout); save(`worker-${index}.stderr.log`, child.stderr); });
    console.log(`Evidence: ${evidence}`);
  }
}
main().catch(() => { console.error('Worker runtime proof failed; see report.json and worker logs.'); process.exitCode = 1; });
