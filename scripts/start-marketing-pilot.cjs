// Local, persistent marketing pilot. Paid providers require a separately approved allowance file.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process'); const { randomBytes, randomUUID } = require('node:crypto'); const { parseEnv } = require('node:util');
const { createRequire } = require('node:module'); const { setTimeout: delay } = require('node:timers/promises');
const { pilotMediaEnvironment } = require('./marketing-pilot-media.cjs');
const root = path.resolve(__dirname, '..'); const home = path.join(root, '.local/marketing-pilot');
const mode = process.argv.includes('--live') ? 'live' : 'rehearsal'; const prepare = process.argv.includes('--prepare'); const stop = process.argv.includes('--stop');
const noPaidCalls = process.argv.includes('--no-paid-calls');
const directory = path.join(home, mode); const approvalFile = path.join(home, 'approval/approval.json'); const stateFile = path.join(directory, 'state.json');
const req = createRequire(path.join(root, 'apps/worker/package.json'));
function write(file, value) { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); assert.equal(fs.readFileSync(file, 'utf8'), text); }
function provider() { const values = parseEnv(fs.readFileSync(path.join(root, 'apps/api/.env'), 'utf8')); return { secret: values.ATLAS_API_KEY?.trim().replace(/^(['"])(.*)\1$/, '$2'), model: values.ATLAS_CHAT_MODEL || 'deepseek-ai/deepseek-v4.1-flash' }; }
function docker(args) { const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 }); if (result.status !== 0) throw new Error(`Docker ${args[0]} unavailable`); return result.stdout.trim(); }
async function until(check) { const deadline = Date.now() + 90000; while (Date.now() < deadline) { try { if (await check()) return; } catch {} await delay(500); } throw new Error('Pilot dependency did not become ready'); }
async function main() {
  if (prepare) {
    if (!fs.existsSync(approvalFile)) write(approvalFile, { approved: false, approvalId: randomUUID(), chatModel: provider().model, maxVideoCalls: 2, maxTextCalls: 2, maximumUsdEstimate: 2.1, budgetCny: 20, purpose: 'Marketing pilot: commerce and store visit; no additional image generation', humanApproval: null });
    const scope = JSON.parse(fs.readFileSync(approvalFile));
    console.log(JSON.stringify({ event: 'pilot_prepared', approvalRequired: !scope.approved, textCalls: scope.maxTextCalls, videoCalls: scope.maxVideoCalls, budgetCny: scope.budgetCny, model: scope.chatModel, paidCalls: 0 })); return;
  }
  if (stop) { assert.ok(fs.existsSync(stateFile), 'Pilot state missing'); write(path.join(directory, 'stop'), 'stop'); console.log('Pilot stop requested; data will remain available.'); return; }
  const { createApplication } = require('../apps/api-next/dist/application');
  const { createServices, nativeMarketingBinding, marketingCopyBinding } = req('@wb/server'); const { createObjectStore } = req('@wb/media');
  const { pilotAllowance } = require('../apps/worker/dist/pilot-spending');
  const port = mode === 'live' ? 3037 : 3036; const apiBase = `http://127.0.0.1:${port}`;
  let scope, account;
  if (mode === 'live') { scope = JSON.parse(fs.readFileSync(approvalFile)); assert.equal(scope.approved, true, 'Separate human approval required'); assert.ok(scope.humanApproval?.trim(), 'Human approval reference required'); account = provider(); assert.ok(account.secret); assert.equal(account.model, scope.chatModel); }
  fs.mkdirSync(directory, { recursive: true });
  let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : null;
  if (state) {
    assert.equal(state.mode, mode); assert.match(state.runId, /^wb-marketing-pilot-[a-f0-9-]{36}$/);
    let running;
    try { running = await (await fetch(`${apiBase}/__pilot`, { signal: AbortSignal.timeout(2000) })).json(); } catch {}
    if (running?.runId === state.runId) { assert.equal(Boolean(running.noPaidCalls), noPaidCalls, 'Running pilot has a different paid-call mode; stop explicitly before restart'); console.log(JSON.stringify({ event: 'pilot_already_running', mode, apiBase, noPaidCalls })); return; }
    for (const pid of Object.values(state.pids)) { let running = false; try { process.kill(pid, 0); running = true; } catch {} if (running) throw new Error('A prior pilot process may still be running; preserve it for manual recovery'); }
  } else { state = { mode, runId: `wb-marketing-pilot-${randomUUID()}`, pids: {}, containers: [], volumes: [], pgPassword: randomBytes(24).toString('hex'), objectStore: { region: 'garage', bucket: 'media', accessKeyId: `GK${randomBytes(16).toString('hex')}`, secretAccessKey: randomBytes(32).toString('hex') } }; }
  const save = () => write(stateFile, state); state.pids.supervisor = process.pid; save();
  function owned(name) { const [item] = JSON.parse(docker(['inspect', name])); assert.equal(item.Config.Labels['wb.marketing-pilot'], state.runId); return item; }
  const databaseName = `workbench_marketing_pilot_${mode}`;
  function container(role, args) { const name = `${state.runId}-${role}`; docker(['run', '-d', '--name', name, '--label', `wb.marketing-pilot=${state.runId}`, ...args]); state.containers.push(name); save(); return name; }
  if (!state.containers.length) {
    for (const role of ['pg', 'temporal', 's3']) { const name = `${state.runId}-${role}-data`; docker(['volume', 'create', '--label', `wb.marketing-pilot=${state.runId}`, name]); state.volumes.push(name); save(); }
    const config = path.join(directory, 'garage.toml'); write(config, `metadata_dir = "/data/meta"\ndata_dir = "/data/blocks"\ndb_engine = "sqlite"\nreplication_factor = 1\nrpc_bind_addr = "0.0.0.0:3901"\nrpc_public_addr = "127.0.0.1:3901"\nrpc_secret = "${randomBytes(32).toString('hex')}"\n[s3_api]\ns3_region = "garage"\napi_bind_addr = "0.0.0.0:3900"\nroot_domain = ".s3.garage.localhost"\n`);
    container('pg', ['-p', '127.0.0.1::5432', '-v', `${state.volumes[0]}:/var/lib/postgresql/data`, '-e', 'POSTGRES_USER=wb', '-e', `POSTGRES_PASSWORD=${state.pgPassword}`, '-e', `POSTGRES_DB=${databaseName}`, 'postgres:16-alpine']);
    docker(['run', '--rm', '-v', `${state.volumes[1]}:/data`, 'alpine:3.22', 'chown', '1000:1000', '/data']);
    container('temporal', ['-p', '127.0.0.1::7233', '-v', `${state.volumes[1]}:/data`, 'temporalio/temporal:1.9.1@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e', 'server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/data/pilot.sqlite', '--headless', '--log-level', 'warn']);
    container('s3', ['-p', '127.0.0.1::3900', '-v', `${state.volumes[2]}:/data`, '--mount', `type=bind,source=${config.replaceAll('\\', '/')},target=/etc/garage.toml,readonly`, '-e', `GARAGE_DEFAULT_ACCESS_KEY=${state.objectStore.accessKeyId}`, '-e', `GARAGE_DEFAULT_SECRET_KEY=${state.objectStore.secretAccessKey}`, '-e', 'GARAGE_DEFAULT_BUCKET=media', 'dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690', '/garage', 'server', '--single-node', '--default-bucket']);
  }
  assert.equal(state.containers.length, 3, 'Partial pilot setup requires recovery');
  for (const name of state.containers) if (!owned(name).State.Running) docker(['start', name]);
  const [pg, temporal, s3] = state.containers;
  await until(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'wb', '-d', databaseName], { windowsHide: true, stdio: 'ignore' }).status === 0);
  await until(() => spawnSync('docker', ['exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], { windowsHide: true, stdio: 'ignore' }).status === 0);
  const published = (name, internal) => owned(name).NetworkSettings.Ports[`${internal}/tcp`][0].HostPort;
  state.databaseUrl = `postgres://wb:${state.pgPassword}@127.0.0.1:${published(pg, 5432)}/${databaseName}`; state.temporalAddress = `127.0.0.1:${published(temporal, 7233)}`; state.objectStore.endpoint = `http://127.0.0.1:${published(s3, 3900)}`; state.apiBase = apiBase; save();
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE, API_NEXT_DATABASE_URL: state.databaseUrl,
    WORKER_PROVIDER_MODE: 'mock', DRAMA_SCRIPT_PROVIDER_MODE: 'disabled', DRAMA_PORTRAIT_PROVIDER_MODE: 'disabled', MARKETING_COPY_PROVIDER_MODE: mode === 'live' ? 'atlas' : 'disabled', NATIVE_MARKETING_PROVIDER_MODE: mode === 'live' ? 'atlas' : 'disabled',
    TEMPORAL_ADDRESS: state.temporalAddress, TEMPORAL_NAMESPACE: 'default', TEMPORAL_TASK_QUEUE: state.runId, TEMPORAL_MEDIA_TASK_QUEUE: `${state.runId}-media`,
    S3_ENDPOINT: state.objectStore.endpoint, S3_REGION: 'garage', S3_BUCKET: 'media', S3_ACCESS_KEY_ID: state.objectStore.accessKeyId, S3_SECRET_ACCESS_KEY: state.objectStore.secretAccessKey,
    ...pilotMediaEnvironment(root),
    ...(mode === 'live' ? { ATLAS_API_KEY: account.secret, ATLAS_CHAT_MODEL: account.model, ATLAS_BASE_URL: 'https://api.atlascloud.ai', MARKETING_PILOT_APPROVAL_FILE: approvalFile, MARKETING_PILOT_NO_PAID_CALLS: noPaidCalls ? '1' : '0' } : { NATIVE_MOCK_COMMERCE_FILE: path.join(root, '.local/native-commerce-2026-10-11/source.mp4'), NATIVE_MOCK_STORE_FILE: path.join(root, '.local/native-visit-2026-10-11/source.mp4') }) };
  const migration = spawnSync(process.execPath, ['packages/server/scripts/migrate.cjs'], { cwd: root, env, windowsHide: true, encoding: 'utf8' }); assert.equal(migration.status, 0, 'Pilot database migration failed');
  for (const file of [env.MEDIA_FONT_FILE, env.NATIVE_ASR_PYTHON, env.NATIVE_ASR_SCRIPT, path.join(env.NATIVE_ASR_MODEL_DIR, 'source-manifest.json')]) assert.ok(fs.existsSync(file), 'Offline media dependency missing');
  for (const command of ['ffmpeg', 'ffprobe']) assert.equal(spawnSync(command, ['-version'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }).status, 0, 'Media executable missing');
  const services = createServices(state.databaseUrl); const store = createObjectStore(state.objectStore); await until(() => store.probe().then(() => true));
  const nativeOffer = { binding: nativeMarketingBinding(), credits: 7 }; const copyOffer = mode === 'live' ? { binding: marketingCopyBinding({ model: account.model, baseUrl: 'https://api.atlascloud.ai' }), credits: 1, estimatedCostCents: null } : null;
  const app = await createApplication({ config: { databaseUrl: state.databaseUrl, port }, services, objectStore: store, nativeMarketingMockAvailable: mode === 'rehearsal', marketingCopyMockAvailable: mode === 'rehearsal',
    nativeMarketingOffer: () => mode === 'live' && !noPaidCalls && pilotAllowance(approvalFile, 'video') ? nativeOffer : undefined,
    marketingCopyAdmission: () => ({ offer: mode === 'live' && !noPaidCalls && pilotAllowance(approvalFile, 'text') ? copyOffer : null, mockAvailable: mode === 'rehearsal' }) });
  app.getHttpAdapter().getInstance().get('/__pilot', async () => ({ runId: state.runId, mode, noPaidCalls, videoAvailable: mode === 'rehearsal' || (!noPaidCalls && pilotAllowance(approvalFile, 'video')), copyAvailable: mode === 'rehearsal' || (!noPaidCalls && pilotAllowance(approvalFile, 'text')) }));
  const { supervisePilotWorkers } = require('./marketing-pilot-workers.cjs');
  let supervisor; let closing = false;
  const stopFile = path.join(directory, 'stop'); if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  try {
    supervisor = supervisePilotWorkers([['generation', 'apps/worker/dist/main.js'], ['media', 'apps/media-worker/dist/main.js']], ([role, entry], restarts) => {
      const child = spawn(process.execPath, [entry], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); state.pids[role] = child.pid; save();
      const log = fs.createWriteStream(path.join(directory, `${role}.log`), { flags: 'a' }); child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false }); child.once('exit', (code, signal) => { log.end(); console.log(JSON.stringify({ event: 'pilot_worker_exit', role, code, signal })); });
      child.once('error', () => { log.end(); console.warn(JSON.stringify({ event: 'pilot_worker_start_failed', role })); });
      if (restarts) console.log(JSON.stringify({ event: 'pilot_worker_restart', role, restarts }));
      return child;
    });
    await app.listen(port, '127.0.0.1'); console.log(JSON.stringify({ event: 'marketing_pilot_ready', mode, apiBase, runId: state.runId, persistent: true, noPaidCalls }));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { closing = true; });
    while (!closing && !fs.existsSync(stopFile)) { supervisor.tick(); await delay(500); }
  } finally {
    supervisor?.close();
    await app.close();
    for (const child of supervisor?.children() ?? []) if (child.pid && child.exitCode === null && child.signalCode === null) { const ended = new Promise(done => child.once('exit', done)); child.kill('SIGTERM'); await Promise.race([ended, delay(12000)]); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended; } }
    store.close();
    for (const name of state.containers) if (owned(name).State.Running) docker(['stop', name]);
    state.pids = {}; save();
    console.log('Marketing pilot stopped; database and media volumes retained.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
