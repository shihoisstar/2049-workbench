const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve, join, dirname } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { Client, Connection } = require('@temporalio/client');
const { Worker } = require('@temporalio/worker');
const { historyToJSON } = require('@temporalio/common/lib/proto-utils');
const postgres = require('postgres');
const { createServices, scriptProviderBinding, buildScriptRequest, portraitBinding } = require('@wb/server');
const { createObjectStore } = require('@wb/media');
const { DRAMA_IMAGE_PRICING, DRAMA_SHOT_VIDEO_PRICING, SIGNUP_GRANT_CREDITS, SaveDramaPreparation } = require('@wb/contracts');
const { dispatchGeneration, dispatchCandidateImage, dispatchExport, dispatchShotVideo, temporalWorkflowStarter, temporalCandidateImageWorkflowStarter, temporalExportWorkflowStarter, temporalShotVideoWorkflowStarter } = require('../dist/dispatcher');
const { MOCK_PNG } = require('../dist/candidate-image');
const { dispatchDramaScript } = require('../dist/dispatcher');
const { dispatchMarketingCopy } = require('../dist/dispatcher');
const { MOCK_MP4, MOCK_MP4_PROPS } = require('../dist/shot-video');

const root = resolve(__dirname, '../../..');
const runId = `wb-worker-${randomUUID()}`;
const GARAGE = 'dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690';
const evidence = join(root, 'docs/验收留档/WORKER-2026-10-06', runId);
const owned = [];
const children = [];
let services, sql, connection, objectStore, garage;
const report = { runId, paidProviderCalls: 0 };
function save(name, value) {
  mkdirSync(evidence, { recursive: true });
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  const path = join(evidence, name);
  writeFileSync(path, content);
  assert.equal(readFileSync(path, 'utf8'), content, 'Evidence readback mismatch');
}
function writeChecked(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  assert.equal(readFileSync(path, 'utf8'), content, 'Local config readback mismatch');
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
function launchMediaWorker(env) {
  const child = spawn(process.execPath, [resolve(__dirname, '../../media-worker/dist/main.js')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const accessKeyId = `GK${randomBytes(16).toString('hex')}`;
    const secretAccessKey = randomBytes(32).toString('hex');
    const garageConfig = join(root, `.local/worker-runtime/${runId}/garage.toml`);
    writeChecked(garageConfig, `metadata_dir = "/tmp/garage/meta"\ndata_dir = "/tmp/garage/blocks"\ndb_engine = "sqlite"\nreplication_factor = 1\nrpc_bind_addr = "0.0.0.0:3901"\nrpc_public_addr = "127.0.0.1:3901"\nrpc_secret = "${randomBytes(32).toString('hex')}"\n[s3_api]\ns3_region = "garage"\napi_bind_addr = "0.0.0.0:3900"\nroot_domain = ".s3.garage.localhost"\n`);
    garage = startContainer('s3', ['-p', '127.0.0.1::3900', '--mount', `type=bind,source=${garageConfig.replaceAll('\\', '/')},target=/etc/garage.toml,readonly`,
      '-e', `GARAGE_DEFAULT_ACCESS_KEY=${accessKeyId}`, '-e', `GARAGE_DEFAULT_SECRET_KEY=${secretAccessKey}`, '-e', 'GARAGE_DEFAULT_BUCKET=media',
      GARAGE, '/garage', 'server', '--single-node', '--default-bucket']);
    await eventually(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'wb', '-d', 'workbench_verify'], { stdio: 'ignore', windowsHide: true }).status === 0);
    await eventually(() => spawnSync('docker', ['exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], { stdio: 'ignore', windowsHide: true }).status === 0);
    const port = (name, internal) => JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports[`${internal}/tcp`][0].HostPort;
    const databaseUrl = `postgres://wb:wb_dev_only@127.0.0.1:${port(pg, 5432)}/workbench_verify`;
    const address = `127.0.0.1:${port(temporal, 7233)}`;
    const s3Endpoint = `http://127.0.0.1:${port(garage, 3900)}`;
    objectStore = createObjectStore({ endpoint: s3Endpoint, region: 'garage', bucket: 'media', accessKeyId, secretAccessKey });
    await eventually(() => objectStore.probe().then(() => true));
    const env = { ...process.env, API_NEXT_DATABASE_URL: databaseUrl, WORKER_PROVIDER_MODE: 'mock', NATIVE_MARKETING_PROVIDER_MODE: 'disabled', DRAMA_SCRIPT_PROVIDER_MODE: 'disabled', MARKETING_COPY_PROVIDER_MODE: 'disabled', TEMPORAL_ADDRESS: address, TEMPORAL_NAMESPACE: 'default', TEMPORAL_TASK_QUEUE: runId,
      DRAMA_PORTRAIT_PROVIDER_MODE: 'mock', ATLAS_BASE_URL: 'https://api.atlascloud.ai',
      TEMPORAL_MEDIA_TASK_QUEUE: `${runId}-media`, MEDIA_FONT_FILE: process.env.MEDIA_FONT_FILE ?? 'C:/Windows/Fonts/msyh.ttc',
      S3_ENDPOINT: s3Endpoint, S3_REGION: 'garage', S3_BUCKET: 'media', S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey };
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
    // Candidate image fixture: redelivered start must reuse the same run, publish one private PNG and settle once.
    const imageUser = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const project = await services.drama.create({ userId: imageUser.userId, mode: 'script', title: '运行验证', content: '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
    const materialHash = randomBytes(32).toString('hex');
    const material = await services.materials.register({ userId: imageUser.userId, objectKey: `materials/${imageUser.userId}/${materialHash}.jpg`, sha256: materialHash, byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString() });
    const role = await services.drama.createRole({ userId: imageUser.userId, projectId: project.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: material.id });
    const scene = await services.drama.createScene({ userId: imageUser.userId, projectId: project.id, name: '车站', description: '夜站台。' });
    const shot = await services.drama.createShot({ userId: imageUser.userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
    const candidate = await services.drama.createCandidate({ userId: imageUser.userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。' });
    await services.billing.grant({ userId: imageUser.userId, billingKey: `runtime:${imageUser.userId}`, amount: 300 });
    const imageJob = await services.dramaImages.create({ userId: imageUser.userId, candidateId: candidate.id, requestKey: randomUUID() });
    const imageStarter = temporalCandidateImageWorkflowStarter(client, runId);
    let capturedImage;
    await assert.rejects(dispatchCandidateImage({ ...services.dramaImageOutbox, ack: async () => { throw new Error('Injected lost acknowledgement'); } }, async delivery => {
      capturedImage = delivery;
      await imageStarter(delivery);
    }));
    const imageWorkflowId = `drama-image:${imageJob.id}`;
    const imageHandle = client.workflow.getHandle(imageWorkflowId);
    const originalImageRun = (await imageHandle.describe()).runId;
    report.imageJobId = imageJob.id;
    report.imageWorkflowId = imageWorkflowId;
    report.imageRunBeforeRestart = originalImageRun;
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
    // A script workflow is admitted while no worker is running; its lost acknowledgement
    // must be recovered by the restarted worker without creating a second run or draft.
    const scriptGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    // This is the legacy single-episode history. The dedicated batch below verifies all five episodes.
    const scriptProject = await services.drama.create({ userId: scriptGuest.userId, mode: 'idea', title: '小猫剧本运行验收', content: '橘猫驾驶飞船寻找月亮。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
    const scriptWalletBefore = await services.billing.summary(scriptGuest.userId);
    const scriptJob = await services.dramaScripts.create({ userId: scriptGuest.userId, projectId: scriptProject.id, requestKey: randomUUID() });
    let scriptDelivery;
    await assert.rejects(dispatchDramaScript({ ...services.dramaScriptOutbox,
      claim: async () => { scriptDelivery = await services.dramaScriptOutbox.claim(); return scriptDelivery; },
      ack: async () => { throw new Error('Injected lost script acknowledgement'); },
    }, client, runId));
    const scriptHandle = client.workflow.getHandle(`drama-script:${scriptJob.id}`);
    const scriptOriginalRun = (await scriptHandle.describe()).runId;
    await handle.signal('resumeVideoGeneration');
    const second = launchWorker(env);
    await eventually(async () => {
      const history = await handle.fetchHistory();
      return history.events.filter(event => event.activityTaskScheduledEventAttributes?.activityType?.name === 'pollVideo').length >= 2;
    });
    await eventually(async () => (await query()).stage === 'awaiting_media');
    report.runIdAfterRestart = (await handle.describe()).runId;
    assert.equal(report.runIdAfterRestart, originalRun);
    report.mockSubmissions = children.reduce((n, child) => n + (child.stdout.match(/"event":"mock_provider_submit"/g) ?? []).length, 0);
    assert.equal(report.mockSubmissions, 1);
    await eventually(async () => (await services.dramaScripts.get({ userId: scriptGuest.userId, jobId: scriptJob.id })).status === 'succeeded');
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_script_outbox where job_id = ${scriptJob.id}`;
      return row.status === 'delivered' && row.attempts >= 2;
    });
    const generatedScript = await services.dramaScripts.get({ userId: scriptGuest.userId, jobId: scriptJob.id });
    const scriptResponse = await services.dramaScripts.response({ userId: scriptGuest.userId, jobId: scriptJob.id });
    assert.equal(scriptResponse.finishReason, 'stop');
    assert.equal(scriptResponse.text, generatedScript.draftVersion.content);
    assert.equal(scriptResponse.usage, null, 'mock must not invent billable token usage');
    report.scriptResponseRecorded = true;
    assert.equal(generatedScript.draftVersion.parse.status, 'parsed');
    assert.equal(generatedScript.draftVersion.parse.episodes.length, 1);
    assert.equal((await services.drama.getProject({ userId: scriptGuest.userId, projectId: scriptProject.id })).activeVersionId, null);
    const scriptConfirmed = await services.dramaScripts.confirm({ userId: scriptGuest.userId, projectId: scriptProject.id, versionId: generatedScript.draftVersion.id });
    assert.equal(scriptConfirmed.confirmedVersionId, generatedScript.draftVersion.id);
    const [scriptDraftCount] = await sql`select count(*)::int as n from wb_next.drama_script_versions where script_id = ${generatedScript.draftScriptId}`;
    assert.equal(scriptDraftCount.n, 1);
    assert.deepEqual(await services.billing.summary(scriptGuest.userId), scriptWalletBefore);
    report.scriptRedeliverySameRun = (await scriptHandle.describe()).runId === scriptOriginalRun;
    assert.equal(report.scriptRedeliverySameRun, true);
    await scriptHandle.result();
    await dispatchDramaScript({ claim: async () => scriptDelivery, ack: async () => {}, release: async () => {} }, client, runId);
    assert.equal((await scriptHandle.describe()).runId, scriptOriginalRun);
    const scriptHistory = await scriptHandle.fetchHistory();
    save('script-history.json', historyToJSON(scriptHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, scriptHistory, `drama-script:${scriptJob.id}`);
    report.scriptJobId = scriptJob.id;
    report.scriptDraftCount = scriptDraftCount.n;
    report.scriptConfirmed = true;
    report.scriptWalletUnchanged = true;
    report.scriptClosedWorkflowNotRestarted = true;
    report.scriptReplayAccepted = true;
    report.scriptHistoryEvents = scriptHistory.events.length;
    // Exercise the real workflow branch with a manually injected receipt; text networking stays disabled.
    const pricedGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const pricedProject = await services.drama.create({ userId: pricedGuest.userId, mode: 'idea', title: '报价恢复', content: '橘猫寻找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
    const scriptBinding = scriptProviderBinding({ model: 'runtime-fixture', baseUrl: 'https://script.invalid' });
    const scriptAdmission = { offer: { binding: scriptBinding, credits: 7, estimatedCostCents: null }, mockAvailable: false };
    const pricedQuote = await services.dramaScripts.quote({ userId: pricedGuest.userId, projectId: pricedProject.id, admission: scriptAdmission });
    const pricedJob = await services.dramaScripts.create({ userId: pricedGuest.userId, projectId: pricedProject.id, requestKey: randomUUID(), quoteVersion: pricedQuote.version, admission: scriptAdmission });
    const pricedLocator = { userId: pricedGuest.userId, jobId: pricedJob.id };
    const pricedClaim = await services.dramaScripts.beginSubmission({ ...pricedLocator, binding: scriptBinding, request: buildScriptRequest(await services.dramaScripts.snapshot(pricedLocator), scriptBinding) });
    assert.equal(pricedClaim.claimed, true);
    const pricedToken = { ...pricedLocator, token: pricedClaim.token };
    await services.dramaScripts.submissionUnknown(pricedToken);
    const pricedWorkflowId = `drama-script:${pricedJob.id}`;
    const pricedHandle = client.workflow.getHandle(pricedWorkflowId);
    await eventually(async () => (await pricedHandle.fetchHistory()).events.some(event => event.activityTaskCompletedEventAttributes));
    const pricedOriginalRun = (await pricedHandle.describe()).runId;
    assert.equal((await services.dramaScripts.get(pricedLocator)).billingStatus, 'held');
    assert.equal((await services.billing.summary(pricedGuest.userId)).balance, SIGNUP_GRANT_CREDITS - 7);
    await eventually(async () => (await services.dramaImages.get({ userId: imageUser.userId, jobId: imageJob.id })).status === 'succeeded');
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_image_outbox where job_id = ${imageJob.id}`;
      return row.status === 'delivered' && row.attempts >= 2;
    });
    report.imageRedeliverySameRun = (await imageHandle.describe()).runId === originalImageRun;
    assert.equal(report.imageRedeliverySameRun, true);
    const imageSubmission = await services.dramaImageSubmissions.get({ userId: imageUser.userId, jobId: imageJob.id });
    assert.equal(imageSubmission.status, 'submitted');
    assert.equal(imageSubmission.providerTaskId, `mock-image:${imageJob.id}`);
    const imageAsset = await services.dramaImageAssets.get({ userId: imageUser.userId, jobId: imageJob.id });
    const expectedSha = createHash('sha256').update(MOCK_PNG).digest('hex');
    assert.equal(imageAsset.objectKey, `drama-image-jobs/${imageJob.id}/${expectedSha}.png`);
    assert.equal(imageAsset.sha256, expectedSha);
    assert.equal(imageAsset.byteLength, MOCK_PNG.length);
    assert.equal(imageAsset.width, 16);
    assert.equal(imageAsset.height, 16);
    const imageDownload = await fetch(await objectStore.access(imageAsset.objectKey, 60, 'image/png'));
    assert.equal(imageDownload.status, 200);
    const storedImage = Buffer.from(await imageDownload.arrayBuffer());
    assert.equal(createHash('sha256').update(storedImage).digest('hex'), expectedSha);
    report.imageAssetBytes = storedImage.length;
    const imageWallet = await services.billing.summary(imageUser.userId);
    report.imageSettleCount = imageWallet.entries.filter(entry => entry.type === 'settle').length;
    assert.equal(report.imageSettleCount, 1);
    report.imageBalance = imageWallet.balance;
    assert.equal(imageWallet.balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits);
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
    await connection.withDeadline(Date.now() + 15000, () => imageHandle.result());
    await imageStarter(capturedImage);
    report.imageClosedWorkflowNotRestarted = (await imageHandle.describe()).runId === originalImageRun;
    assert.equal(report.imageClosedWorkflowNotRestarted, true);
    await imageStarter({ ...capturedImage, type: 'drama_image.resume' });
    assert.equal((await imageHandle.describe()).runId, originalImageRun);
    const imageHistory = await imageHandle.fetchHistory();
    save('image-history.json', historyToJSON(imageHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, imageHistory, imageWorkflowId);
    report.imageReplayAccepted = true;
    report.imageHistoryEvents = imageHistory.events.length;
    // Shot video fixture: the published image candidate above becomes the video source. The running
    // worker is stopped so the injected lost-ack dispatch is the only outbox claimer, then a fresh
    // worker must redeliver to the same run and publish one private MP4 that settles once.
    await forceStop(second);
    const batchGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const batchProject = await services.drama.create({ userId: batchGuest.userId, mode: 'idea', title: '五集自动续作运行验收', content: '橘猫驾驶飞船寻找回家的路。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
    const batchInput = { userId: batchGuest.userId, projectId: batchProject.id, admission: { offer: null, mockAvailable: true } };
    const batchQuote = await services.scriptBatches.quote(batchInput);
    const scriptBatch = await services.scriptBatches.create({ ...batchInput, request: { requestKey: randomUUID(), quoteVersion: batchQuote.version } });
    await dispatchDramaScript(services.dramaScriptOutbox, client, runId);
    const batchFirstHandle = client.workflow.getHandle(`drama-script:${scriptBatch.episodes[0].jobId}`); const batchFirstRun = (await batchFirstHandle.describe()).runId;
    const copyGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); const copies = [];
    for (const category of ['commerce', 'store_visit']) {
      const source = { category, text: category === 'commerce' ? '橘猫帆布袋，展示图案。' : '咖啡店有木桌和窗边座位。' };
      const copyAdmission = { offer: null, mockAvailable: true };
      const quote = await services.marketingCopies.quote({ userId: copyGuest.userId, request: source, admission: copyAdmission });
      const copy = await services.marketingCopies.create({ userId: copyGuest.userId, request: { ...source, requestKey: randomUUID(), quoteVersion: quote.version }, admission: copyAdmission });
      await dispatchMarketingCopy(services.marketingCopyOutbox, client, runId);
      const handle = client.workflow.getHandle(`marketing-copy:${copy.id}`); copies.push({ copy, run: (await handle.describe()).runId });
    }
    const portraitGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const portraitProject = await services.drama.create({ userId: portraitGuest.userId, mode: 'script', title: '角色候选运行验收', content: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
    const portraitInput = { userId: portraitGuest.userId, projectId: portraitProject.id };
    await services.dramaScripts.confirm({ ...portraitInput, versionId: portraitProject.activeVersionId });
    const preparation = await services.drama.getPreparation(portraitInput);
    const prepared = await services.drama.savePreparation({ ...portraitInput, draft: SaveDramaPreparation.parse({ scriptVersionId: preparation.scriptVersionId, baseRevision: preparation.revision,
      roles: preparation.roles.map(({ key, name, usage }) => ({ key, name, usage, description: '橘猫，蓝围巾' })), scenes: preparation.scenes.map(({ key, description }) => ({ key, description })) }) });
    const portraitOffer = { binding: portraitBinding('mock'), credits: 7 };
    const portraitRequest = { roleKey: prepared.roles[0].key, preparationRevision: prepared.revision };
    const portraitQuote = await services.rolePortraits.quote({ ...portraitInput, offer: portraitOffer, request: portraitRequest });
    const portraitJob = await services.rolePortraits.create({ ...portraitInput, offer: portraitOffer, request: { ...portraitRequest, quoteVersion: portraitQuote.version, requestKey: randomUUID() } });
    const portraitLocator = { userId: portraitGuest.userId, jobId: portraitJob.id };
    const portraitClaim = await services.dramaImageSubmissions.begin({ ...portraitLocator, providerKey: portraitOffer.binding.providerKey }); assert.equal(portraitClaim.claimed, true);
    await services.dramaImageSubmissions.unknown({ ...portraitLocator, token: portraitClaim.token });
    let portraitDelivery;
    await assert.rejects(dispatchCandidateImage({ ...services.dramaImageOutbox, ack: async () => { throw new Error('Injected lost portrait acknowledgement'); } }, async delivery => {
      portraitDelivery = delivery; assert.equal(delivery.target, 'portrait'); await imageStarter(delivery);
    }));
    const portraitHandle = client.workflow.getHandle(`drama-image:${portraitJob.id}`); const portraitRun = (await portraitHandle.describe()).runId;
    await services.drama.selectCandidate({ userId: imageUser.userId, candidateId: candidate.id });
    const shotVideoJob = await services.dramaShotVideos.create({ userId: imageUser.userId, shotId: shot.id, requestKey: randomUUID() });
    const shotVideoStarter = temporalShotVideoWorkflowStarter(client, runId);
    let capturedShotVideo;
    await assert.rejects(dispatchShotVideo({ ...services.dramaShotVideoOutbox, ack: async () => { throw new Error('Injected lost acknowledgement'); } }, async delivery => {
      capturedShotVideo = delivery;
      await shotVideoStarter(delivery);
    }));
    const shotVideoWorkflowId = `drama-video:${shotVideoJob.id}`;
    const shotVideoHandle = client.workflow.getHandle(shotVideoWorkflowId);
    const originalShotVideoRun = (await shotVideoHandle.describe()).runId;
    report.shotVideoJobId = shotVideoJob.id;
    report.shotVideoWorkflowId = shotVideoWorkflowId;
    report.shotVideoRunBeforeRestart = originalShotVideoRun;
    const third = launchWorker(env);
    await eventually(async () => (await services.scriptBatches.get({ userId: batchGuest.userId, batchId: scriptBatch.id })).status === 'succeeded');
    const batchResult = await services.scriptBatches.get({ userId: batchGuest.userId, batchId: scriptBatch.id });
    assert.deepEqual(batchResult.draftVersion.parse.episodes.map(episode => episode.number), [1, 2, 3, 4, 5]);
    assert.equal((await batchFirstHandle.describe()).runId, batchFirstRun);
    report.batchHistoryEvents = []; report.batchReplayAccepted = true; report.batchRestoredSameRun = true; report.batchEpisodeCount = 5;
    for (const episode of batchResult.episodes) {
      const handle = client.workflow.getHandle(`drama-script:${episode.jobId}`); await handle.result(); const history = await handle.fetchHistory();
      save(`series-${episode.number}-history.json`, historyToJSON(history)); await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, history, `drama-script:${episode.jobId}`); report.batchHistoryEvents.push(history.events.length);
    }
    assert.equal((await services.billing.summary(batchGuest.userId)).balance, 80); report.batchWalletUnchanged = true;
    report.copyHistoryEvents = []; report.copyReplayAccepted = true; report.copyRestoredSameRun = true;
    for (const { copy, run } of copies) {
      const handle = client.workflow.getHandle(`marketing-copy:${copy.id}`); await handle.result(); assert.equal((await handle.describe()).runId, run);
      assert.equal((await services.marketingCopies.get({ userId: copyGuest.userId, jobId: copy.id })).status, 'succeeded');
      const history = await handle.fetchHistory(); save(`copy-${copy.category}-history.json`, historyToJSON(history)); await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, history, `marketing-copy:${copy.id}`); report.copyHistoryEvents.push(history.events.length);
    }
    assert.equal((await services.billing.summary(copyGuest.userId)).balance, 80); report.copyWalletUnchanged = true;
    await services.dramaScripts.recordResponse({ ...pricedToken, response: { provider: 'atlas', model: scriptBinding.model, responseId: 'runtime-fixture', finishReason: 'stop',
      text: '## 第1集\n**场景1：云海 日/外**\n橘猫：出发。', textTruncated: false, usage: null } });
    await pricedHandle.signal('resumeDramaScript');
    await connection.withDeadline(Date.now() + 20000, () => pricedHandle.result());
    const pricedResult = await services.dramaScripts.get(pricedLocator);
    assert.equal(pricedResult.billingStatus, 'settled'); assert.equal(pricedResult.actualCredits, 7);
    assert.equal(pricedResult.draftVersion.source, 'ai_generated');
    assert.equal((await pricedHandle.describe()).runId, pricedOriginalRun);
    const pricedWallet = await services.billing.summary(pricedGuest.userId);
    assert.equal(pricedWallet.entries.filter(entry => entry.type === 'hold').length, 1);
    assert.equal(pricedWallet.entries.filter(entry => entry.type === 'settle').length, 1);
    const pricedHistory = await pricedHandle.fetchHistory();
    save('priced-script-history.json', historyToJSON(pricedHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, pricedHistory, pricedWorkflowId);
    report.pricedScriptJobId = pricedJob.id; report.pricedScriptRestoredSameRun = true; report.pricedScriptSettleCount = 1;
    report.pricedScriptReplayAccepted = true; report.pricedScriptHistoryEvents = pricedHistory.events.length;
    await eventually(async () => (await portraitHandle.fetchHistory()).events.some(event => event.activityTaskCompletedEventAttributes));
    assert.equal((await services.dramaImageSubmissions.get(portraitLocator)).status, 'unknown');
    await services.opsPortraitReview.resolve({ jobId: portraitJob.id, request: { action: 'receipt', requestKey: randomUUID(), reason: '独占模拟环境核对任务记录与归属', evidenceReference: 'runtime-fixture', provider: 'mock', model: portraitOffer.binding.model, providerTaskId: `recovered:${portraitJob.id}`, confirmedTaskOwnership: true } });
    await eventually(async () => (await services.rolePortraits.get(portraitLocator)).status === 'succeeded');
    await connection.withDeadline(Date.now() + 15000, () => portraitHandle.result());
    await eventually(async () => { const [row] = await sql`select status, attempts from wb_next.drama_image_outbox where job_id = ${portraitJob.id}`; return row.status === 'delivered' && row.attempts >= 2; });
    assert.equal((await portraitHandle.describe()).runId, portraitRun);
    assert.equal((await services.dramaImageSubmissions.get(portraitLocator)).providerTaskId, `recovered:${portraitJob.id}`);
    const portraitAsset = await services.dramaImageAssets.get(portraitLocator);
    const portraitMaterial = await services.materials.get({ userId: portraitGuest.userId, materialId: portraitAsset.referenceMaterialId });
    assert.equal(portraitAsset.sha256, expectedSha); assert.equal(portraitMaterial.expiresAt, portraitAsset.expiresAt);
    for (const key of [portraitAsset.objectKey, portraitMaterial.objectKey]) assert.deepEqual(await objectStore.read(key), MOCK_PNG);
    assert.equal((await services.drama.getPreparation(portraitInput)).roles[0].referenceMaterialId, null);
    const portraitSelected = await services.rolePortraits.select({ ...portraitLocator, preparationRevision: prepared.revision });
    assert.equal(portraitSelected.roles[0].selection, null);
    const portraitConfirmed = await services.drama.confirmRoleAppearance({ ...portraitInput, confirmation: { scriptVersionId: portraitSelected.scriptVersionId, preparationRevision: portraitSelected.revision, roleKey: portraitSelected.roles[0].key } });
    assert.equal(portraitConfirmed.roles[0].selection.referenceSha256, expectedSha);
    const portraitWallet = await services.billing.summary(portraitGuest.userId);
    assert.equal(portraitWallet.entries.filter(entry => entry.type === 'hold').length, 1); assert.equal(portraitWallet.entries.filter(entry => entry.type === 'settle').length, 1); assert.equal(portraitWallet.balance, 73);
    await imageStarter(portraitDelivery); await imageStarter({ ...portraitDelivery, type: 'drama_image.resume' });
    assert.equal((await portraitHandle.describe()).runId, portraitRun);
    const portraitHistory = await portraitHandle.fetchHistory(); save('portrait-history.json', historyToJSON(portraitHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, portraitHistory, `drama-image:${portraitJob.id}`);
    report.portraitJobId = portraitJob.id; report.portraitReplayAccepted = true; report.portraitHistoryEvents = portraitHistory.events.length;
    report.portraitRestoredSameRun = true; report.portraitSettleCount = 1; report.portraitCopiedBytes = MOCK_PNG.length; report.portraitConfirmedExplicitly = true;
    report.portraitUnknownReviewed = true; report.portraitResumedByOutbox = true;
    let framePlan = await services.storyboardPlans.create({ ...portraitInput, request: { scriptVersionId: portraitConfirmed.scriptVersionId, preparationRevision: portraitConfirmed.revision } });
    const frameShot = framePlan.shots[0];
    framePlan = await services.storyboardPlans.update({ userId: portraitGuest.userId, planId: framePlan.id, request: { baseRevision: framePlan.revision, shotKey: frameShot.key, content: frameShot.content, roleKeys: frameShot.roleKeys, reviewed: true } });
    const frameBase = { userId: portraitGuest.userId, planId: framePlan.id, mockAvailable: true };
    const frameRequest = { shotKey: frameShot.key, planRevision: framePlan.revision };
    const frameQuote = await services.planImages.quote({ ...frameBase, request: frameRequest }); assert.equal(frameQuote.credits, 7);
    const frame = await services.planImages.create({ ...frameBase, request: { ...frameRequest, quoteVersion: frameQuote.version, requestKey: randomUUID() } });
    await eventually(async () => (await services.dramaImages.get({ userId: portraitGuest.userId, jobId: frame.jobId })).status === 'succeeded');
    const frameHandle = client.workflow.getHandle(`drama-image:${frame.jobId}`); await connection.withDeadline(Date.now() + 15000, () => frameHandle.result());
    const frameAsset = await services.dramaImageAssets.get({ userId: portraitGuest.userId, jobId: frame.jobId }); assert.deepEqual(await objectStore.read(frameAsset.objectKey), MOCK_PNG);
    const frameSelected = await services.planImages.select({ userId: portraitGuest.userId, candidateId: frame.candidateId, planRevision: framePlan.revision });
    assert.ok(frameSelected.selectedAt); assert.deepEqual(frameSelected.roleVersionIds, [portraitConfirmed.roles[0].selection.roleVersionId]);
    const frameWallet = await services.billing.summary(portraitGuest.userId); assert.equal(frameWallet.balance, 66);
    assert.equal(frameWallet.entries.filter(entry => entry.type === 'settle' && entry.billingKey === `drama-image:${frame.jobId}`).length, 1);
    const frameHistory = await frameHandle.fetchHistory(); save('plan-image-history.json', historyToJSON(frameHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, frameHistory, `drama-image:${frame.jobId}`);
    report.planImageJobId = frame.jobId; report.planImageHistoryEvents = frameHistory.events.length; report.planImageReplayAccepted = true; report.planImageSettleCount = 1; report.planImageBytes = MOCK_PNG.length;
    await eventually(async () => (await services.dramaShotVideos.get({ userId: imageUser.userId, jobId: shotVideoJob.id })).status === 'succeeded');
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_shot_video_outbox where job_id = ${shotVideoJob.id}`;
      return row.status === 'delivered' && row.attempts >= 2;
    });
    report.shotVideoRedeliverySameRun = (await shotVideoHandle.describe()).runId === originalShotVideoRun;
    assert.equal(report.shotVideoRedeliverySameRun, true);
    const shotVideoSubmission = await services.dramaShotVideoSubmissions.get({ userId: imageUser.userId, jobId: shotVideoJob.id });
    assert.equal(shotVideoSubmission.status, 'submitted');
    assert.equal(shotVideoSubmission.providerTaskId, `mock-shot-video:${shotVideoJob.id}`);
    const shotVideoAsset = await services.dramaShotVideoAssets.get({ userId: imageUser.userId, jobId: shotVideoJob.id });
    const expectedShotSha = createHash('sha256').update(MOCK_MP4).digest('hex');
    assert.equal(shotVideoAsset.objectKey, `drama-shot-video-jobs/${shotVideoJob.id}/${expectedShotSha}.mp4`);
    assert.equal(shotVideoAsset.sha256, expectedShotSha);
    assert.equal(shotVideoAsset.byteLength, MOCK_MP4.length);
    assert.equal(shotVideoAsset.width, MOCK_MP4_PROPS.width);
    assert.equal(shotVideoAsset.height, MOCK_MP4_PROPS.height);
    assert.equal(shotVideoAsset.durationMs, MOCK_MP4_PROPS.durationMs);
    const shotVideoDownload = await fetch(await objectStore.access(shotVideoAsset.objectKey, 60, 'video/mp4'));
    assert.equal(shotVideoDownload.status, 200);
    const storedShotVideo = Buffer.from(await shotVideoDownload.arrayBuffer());
    assert.equal(createHash('sha256').update(storedShotVideo).digest('hex'), expectedShotSha);
    report.shotVideoAssetBytes = storedShotVideo.length;
    const shotVideoWallet = await services.billing.summary(imageUser.userId);
    report.shotVideoSettleCount = shotVideoWallet.entries.filter(entry => entry.type === 'settle' && entry.billingKey === `drama-video:${shotVideoJob.id}`).length;
    assert.equal(report.shotVideoSettleCount, 1);
    report.shotVideoBalance = shotVideoWallet.balance;
    assert.equal(shotVideoWallet.balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits - DRAMA_SHOT_VIDEO_PRICING.credits);
    await connection.withDeadline(Date.now() + 15000, () => shotVideoHandle.result());
    await shotVideoStarter(capturedShotVideo);
    report.shotVideoClosedWorkflowNotRestarted = (await shotVideoHandle.describe()).runId === originalShotVideoRun;
    assert.equal(report.shotVideoClosedWorkflowNotRestarted, true);
    await shotVideoStarter({ ...capturedShotVideo, type: 'drama_video.resume' });
    assert.equal((await shotVideoHandle.describe()).runId, originalShotVideoRun);
    const shotVideoHistory = await shotVideoHandle.fetchHistory();
    save('shot-video-history.json', historyToJSON(shotVideoHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, shotVideoHistory, shotVideoWorkflowId);
    report.shotVideoReplayAccepted = true;
    report.shotVideoHistoryEvents = shotVideoHistory.events.length;
    // Export fixture: the immutable shot-video asset is composed by the dedicated media queue. A
    // lost dispatcher acknowledgement must redeliver to the same workflow run and publish one MP4.
    await forceStop(third);
    const exportJob = await services.dramaExports.create({ userId: imageUser.userId, projectId: project.id, episodeNumber: 1, requestKey: randomUUID() });
    const exportStarter = temporalExportWorkflowStarter(client, runId, env.TEMPORAL_MEDIA_TASK_QUEUE);
    let capturedExport;
    await assert.rejects(dispatchExport({ ...services.dramaExportOutbox, ack: async () => { throw new Error('Injected lost acknowledgement'); } }, async delivery => {
      capturedExport = delivery;
      await exportStarter(delivery);
    }));
    const exportWorkflowId = `drama-export:${exportJob.job.id}`;
    const exportHandle = client.workflow.getHandle(exportWorkflowId);
    const originalExportRun = (await exportHandle.describe()).runId;
    report.exportJobId = exportJob.job.id;
    report.exportWorkflowId = exportWorkflowId;
    report.exportRunBeforeRestart = originalExportRun;
    const mediaWorker = launchMediaWorker(env);
    await eventually(() => mediaWorker.stdout.includes('media_worker_started'));
    const fourth = launchWorker(env);
    await eventually(async () => (await services.dramaExports.get({ userId: imageUser.userId, jobId: exportJob.job.id })).status === 'succeeded');
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_export_outbox where job_id = ${exportJob.job.id}`;
      return row.status === 'delivered' && row.attempts >= 2;
    });
    report.exportRedeliverySameRun = (await exportHandle.describe()).runId === originalExportRun;
    assert.equal(report.exportRedeliverySameRun, true);
    const exportVersion = await services.dramaExports.getVersion({ userId: imageUser.userId, jobId: exportJob.job.id });
    assert.equal(exportVersion.manifest.shots[0].videoAssetId, shotVideoAsset.id);
    const exportAsset = await services.dramaExportAssets.get({ userId: imageUser.userId, jobId: exportJob.job.id });
    assert.match(exportAsset.objectKey, new RegExp(`^drama-export-jobs/${exportJob.job.id}/[a-f0-9]{64}\\.mp4$`));
    const storedExport = await objectStore.read(exportAsset.objectKey);
    assert.equal(createHash('sha256').update(storedExport).digest('hex'), exportAsset.sha256);
    assert.equal(storedExport.length, exportAsset.byteLength);
    report.exportAssetBytes = storedExport.length;
    report.exportDurationMs = exportAsset.durationMs;
    assert.equal((await services.dramaExports.get({ userId: imageUser.userId, jobId: exportJob.job.id })).outputRef, `drama-export-asset:${exportAsset.id}`);
    await connection.withDeadline(Date.now() + 15000, () => exportHandle.result());
    await exportStarter(capturedExport);
    report.exportClosedWorkflowNotRestarted = (await exportHandle.describe()).runId === originalExportRun;
    assert.equal(report.exportClosedWorkflowNotRestarted, true);
    await exportStarter({ ...capturedExport, type: 'drama_export.resume' });
    assert.equal((await exportHandle.describe()).runId, originalExportRun);
    const exportHistory = await exportHandle.fetchHistory();
    save('export-history.json', historyToJSON(exportHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, exportHistory, exportWorkflowId);
    report.exportReplayAccepted = true;
    report.exportHistoryEvents = exportHistory.events.length;
    // A corrupted export manifest must fail only the new export and complete the workflow normally
    // rather than retrying a now-terminal job. This isolated SQL mutation does not touch source media.
    await forceStop(fourth);
    const outageExport = await services.dramaExports.create({ userId: imageUser.userId, projectId: project.id, episodeNumber: 1, requestKey: randomUUID() });
    const corruptedManifest = structuredClone(outageExport.version.manifest);
    corruptedManifest.shots[0].sha256 = '0'.repeat(64);
    await sql`update wb_next.drama_export_versions set manifest = ${JSON.stringify(corruptedManifest)}::jsonb
      where export_job_id = ${outageExport.job.id}`;
    const outageExportWorkflowId = `drama-export:${outageExport.job.id}`;
    const fifth = launchWorker(env);
    await eventually(async () => (await services.dramaExports.get({ userId: imageUser.userId, jobId: outageExport.job.id })).status === 'failed');
    const failedExport = await services.dramaExports.get({ userId: imageUser.userId, jobId: outageExport.job.id });
    report.exportSourceFailureCode = failedExport.failureCode;
    assert.equal(failedExport.failureCode, 'EXPORT_COMPOSITION_FAILED');
    assert.deepEqual(await services.dramaShotVideoAssets.get({ userId: imageUser.userId, jobId: shotVideoJob.id }), shotVideoAsset);
    assert.deepEqual(await objectStore.read(shotVideoAsset.objectKey), storedShotVideo);
    await connection.withDeadline(Date.now() + 15000, () => client.workflow.getHandle(outageExportWorkflowId).result());
    const outageExportHistory = await client.workflow.getHandle(outageExportWorkflowId).fetchHistory();
    save('export-source-failure-history.json', historyToJSON(outageExportHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, outageExportHistory, outageExportWorkflowId);
    report.exportSourceFailureReplayAccepted = true;
    report.exportSourceFailureHistoryEvents = outageExportHistory.events.length;
    // Object store outage during publication must fail and refund the job instead of freezing it.
    // Garage is stopped before the job exists so the live worker's dispatcher is the only claimer.
    docker(['stop', garage]);
    assert.equal(docker(['inspect', '-f', '{{.State.Running}}', garage]), 'false');
    assert.equal(docker(['inspect', '-f', '{{.State.Running}}', garage]), 'false');
    const outageGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const outageProject = await services.drama.create({ userId: outageGuest.userId, mode: 'script', title: '失败退款', content: '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
    const outageHash = randomBytes(32).toString('hex');
    const outageMaterial = await services.materials.register({ userId: outageGuest.userId, objectKey: `materials/${outageGuest.userId}/${outageHash}.jpg`, sha256: outageHash, byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString() });
    const outageRole = await services.drama.createRole({ userId: outageGuest.userId, projectId: outageProject.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: outageMaterial.id });
    const outageScene = await services.drama.createScene({ userId: outageGuest.userId, projectId: outageProject.id, name: '车站', description: '夜站台。' });
    const outageShot = await services.drama.createShot({ userId: outageGuest.userId, projectId: outageProject.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
    const outageCandidate = await services.drama.createCandidate({ userId: outageGuest.userId, shotId: outageShot.id, roleVersionId: outageRole.latestVersion.id, sceneVersionId: outageScene.latestVersion.id, prompt: '远景。' });
    await services.billing.grant({ userId: outageGuest.userId, billingKey: `outage:${outageGuest.userId}`, amount: 300 });
    const outageJob = await services.dramaImages.create({ userId: outageGuest.userId, candidateId: outageCandidate.id, requestKey: randomUUID() });
    const outageWorkflowId = `drama-image:${outageJob.id}`;
    const outageLocator = { userId: outageGuest.userId, jobId: outageJob.id };
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_image_outbox where job_id = ${outageJob.id}`;
      return row.status === 'delivered' && row.attempts >= 1;
    });
    report.outageDispatchedByWorker = true;
    await eventually(async () => (await services.dramaImages.get(outageLocator)).status === 'failed');
    const outage = await services.dramaImages.get(outageLocator);
    report.outageFailureCode = outage.failureCode;
    assert.equal(outage.failureCode, 'CANDIDATE_IMAGE_PUBLISH_FAILED');
    const outageWallet = await services.billing.summary(outageGuest.userId);
    report.outageRefundCount = outageWallet.entries.filter(entry => entry.type === 'refund').length;
    assert.equal(report.outageRefundCount, 1);
    report.outageBalance = outageWallet.balance;
    assert.equal(outageWallet.balance, SIGNUP_GRANT_CREDITS + 300);
    await connection.withDeadline(Date.now() + 15000, () => client.workflow.getHandle(outageWorkflowId).result());
    const outageHistory = await client.workflow.getHandle(outageWorkflowId).fetchHistory();
    save('outage-history.json', historyToJSON(outageHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, outageHistory, outageWorkflowId);
    report.outageReplayAccepted = true;
    report.outageHistoryEvents = outageHistory.events.length;
    const failedFrame = await services.planImages.create({ ...frameBase, request: { ...frameRequest, quoteVersion: frameQuote.version, requestKey: randomUUID() } });
    await eventually(async () => (await services.dramaImages.get({ userId: portraitGuest.userId, jobId: failedFrame.jobId })).status === 'failed');
    const failedFrameWallet = await services.billing.summary(portraitGuest.userId); assert.equal(failedFrameWallet.balance, 66);
    assert.equal(failedFrameWallet.entries.filter(entry => entry.type === 'refund' && entry.billingKey === `drama-image:${failedFrame.jobId}`).length, 1);
    const retainedFrames = await services.planImages.list({ userId: portraitGuest.userId, planId: framePlan.id, shotKey: frameShot.key });
    assert.equal(retainedFrames.items.length, 2); assert.equal(retainedFrames.items.find(item => item.selectedAt).candidateId, frame.candidateId);
    const failedFrameHandle = client.workflow.getHandle(`drama-image:${failedFrame.jobId}`); await connection.withDeadline(Date.now() + 15000, () => failedFrameHandle.result());
    const failedFrameHistory = await failedFrameHandle.fetchHistory(); save('plan-image-outage-history.json', historyToJSON(failedFrameHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, failedFrameHistory, `drama-image:${failedFrame.jobId}`);
    report.planImageOutageReplayAccepted = true; report.planImageOutageHistoryEvents = failedFrameHistory.events.length; report.planImageOutageRefunds = 1; report.planImageSelectionRetained = true;
    // The same outage must also fail and refund a shot video job: the image publish is metadata-only
    // (no S3 IO), so the fixture can still cross the published-image precondition while Garage is down.
    const shotOutageGuest = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    const shotOutageProject = await services.drama.create({ userId: shotOutageGuest.userId, mode: 'script', title: '视频失败退款', content: '## 第1集\n**场景1：车站 夜/外**\n林夏：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
    const shotOutageHash = randomBytes(32).toString('hex');
    const shotOutageMaterial = await services.materials.register({ userId: shotOutageGuest.userId, objectKey: `materials/${shotOutageGuest.userId}/${shotOutageHash}.jpg`, sha256: shotOutageHash, byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 600000).toISOString() });
    const shotOutageRole = await services.drama.createRole({ userId: shotOutageGuest.userId, projectId: shotOutageProject.id, name: '林夏', description: '黑发蓝衣。', referenceMaterialId: shotOutageMaterial.id });
    const shotOutageScene = await services.drama.createScene({ userId: shotOutageGuest.userId, projectId: shotOutageProject.id, name: '车站', description: '夜站台。' });
    const shotOutageShot = await services.drama.createShot({ userId: shotOutageGuest.userId, projectId: shotOutageProject.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏在车站。' });
    const shotOutageCandidate = await services.drama.createCandidate({ userId: shotOutageGuest.userId, shotId: shotOutageShot.id, roleVersionId: shotOutageRole.latestVersion.id, sceneVersionId: shotOutageScene.latestVersion.id, prompt: '远景。' });
    await services.drama.selectCandidate({ userId: shotOutageGuest.userId, candidateId: shotOutageCandidate.id });
    await services.billing.grant({ userId: shotOutageGuest.userId, billingKey: `shot-outage:${shotOutageGuest.userId}`, amount: 300 });
    const shotOutageImageJob = await services.dramaImages.create({ userId: shotOutageGuest.userId, candidateId: shotOutageCandidate.id, requestKey: randomUUID() });
    const shotOutageImageSha = randomBytes(32).toString('hex');
    await services.dramaImageAssets.publish({
      userId: shotOutageGuest.userId, jobId: shotOutageImageJob.id, objectKey: `drama-image-jobs/${shotOutageImageJob.id}/${shotOutageImageSha}.png`,
      sha256: shotOutageImageSha, byteLength: 2048, width: 768, height: 1024,
    });
    const shotOutageJob = await services.dramaShotVideos.create({ userId: shotOutageGuest.userId, shotId: shotOutageShot.id, requestKey: randomUUID() });
    const shotOutageWorkflowId = `drama-video:${shotOutageJob.id}`;
    const shotOutageLocator = { userId: shotOutageGuest.userId, jobId: shotOutageJob.id };
    await eventually(async () => {
      const [row] = await sql`select status, attempts from wb_next.drama_shot_video_outbox where job_id = ${shotOutageJob.id}`;
      return row.status === 'delivered' && row.attempts >= 1;
    });
    report.shotOutageDispatchedByWorker = true;
    await eventually(async () => (await services.dramaShotVideos.get(shotOutageLocator)).status === 'failed');
    const shotOutage = await services.dramaShotVideos.get(shotOutageLocator);
    report.shotOutageFailureCode = shotOutage.failureCode;
    assert.equal(shotOutage.failureCode, 'SHOT_VIDEO_PUBLISH_FAILED');
    const shotOutageWallet = await services.billing.summary(shotOutageGuest.userId);
    report.shotOutageRefundCount = shotOutageWallet.entries.filter(entry => entry.type === 'refund' && entry.billingKey === `drama-video:${shotOutageJob.id}`).length;
    assert.equal(report.shotOutageRefundCount, 1);
    report.shotOutageBalance = shotOutageWallet.balance;
    assert.equal(shotOutageWallet.balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits);
    await connection.withDeadline(Date.now() + 15000, () => client.workflow.getHandle(shotOutageWorkflowId).result());
    const shotOutageHistory = await client.workflow.getHandle(shotOutageWorkflowId).fetchHistory();
    save('shot-outage-history.json', historyToJSON(shotOutageHistory));
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../dist/workflows') }, shotOutageHistory, shotOutageWorkflowId);
    report.shotOutageReplayAccepted = true;
    report.shotOutageHistoryEvents = shotOutageHistory.events.length;
    report.status = 'passed';
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    if (connection && report.workflowId) {
      try { const failedHistory = await connection.withDeadline(Date.now() + 5000, () => new Client({ connection }).workflow.getHandle(report.workflowId).fetchHistory()); save('failure-history.json', historyToJSON(failedHistory)); }
      catch (diagnosticError) { report.historyDiagnosticError = diagnosticError.message; }
    }
    throw error;
  } finally {
    for (const child of children) await forceStop(child);
    await services?.close();
    await sql?.end();
    await connection?.close();
    objectStore?.close();
    try { save('garage.log', docker(['logs', garage])); } catch { /* Container logs are advisory evidence only. */ }
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
