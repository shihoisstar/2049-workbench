// Local acceptance stack only. Existing databases/deployments are never reused.
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream } = require('node:fs');
const { resolve, join } = require('node:path');
const { parseEnv } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '..');
const directory = join(root, '.local/video-acceptance');
const stateFile = join(directory, 'state.json');
const { createApplication } = require('../apps/api-next/dist/application');
const { createObjectStore } = require('../packages/media/dist');
const postgres = createRequire(resolve(root, 'packages/server/package.json'))('postgres');
const GARAGE = 'dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690';
const TEMPORAL = 'temporalio/temporal:1.9.1@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e';
const children = new Map();
let accepting = false;
let app, store, sql, state;

function write(path, text) { writeFileSync(path, text); if (readFileSync(path, 'utf8') !== text) throw new Error('Local state readback failed'); }
function saveState() { write(stateFile, JSON.stringify(state, null, 2)); }
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed`);
  return result.stdout.trim();
}
function inspect(name) {
  const [container] = JSON.parse(docker(['inspect', name]));
  if (container.Config.Labels['wb.video-acceptance'] !== state.runId) throw new Error('Acceptance container ownership mismatch');
  return container;
}
function publishedPort(name, port) { return inspect(name).NetworkSettings.Ports[`${port}/tcp`][0].HostPort; }
async function wait(check) {
  for (let i = 0; i < 120; i++) { try { if (await check()) return; } catch {} await delay(500); }
  throw new Error('Acceptance dependency did not become ready');
}
function provider() {
  const values = {};
  for (const name of ['apps/api/.env', 'deploy/.env']) if (existsSync(join(root, name))) Object.assign(values, parseEnv(readFileSync(join(root, name), 'utf8')));
  if (!values.ATLAS_API_KEY) throw new Error('Existing Atlas key missing');
  return { ATLAS_API_KEY: values.ATLAS_API_KEY, ATLAS_BASE_URL: values.ATLAS_BASE_URL || 'https://api.atlascloud.ai',
    ATLAS_MODEL: 'bytedance/seedance-2.0-mini/text-to-video', ATLAS_MODEL_FAST: values.ATLAS_MODEL_FAST || values.ATLAS_MODEL };
}
function baseEnv() {
  return { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE, API_NEXT_DATABASE_URL: state.databaseUrl, TEMPORAL_ADDRESS: state.temporalAddress,
    TEMPORAL_NAMESPACE: 'default', TEMPORAL_TASK_QUEUE: state.runId, TEMPORAL_MEDIA_TASK_QUEUE: `${state.runId}-media` };
}
async function launch(role, entry, env, readyMarker) {
  const child = spawn(process.execPath, [join(root, entry)], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = createWriteStream(join(directory, `${role}.log`), { flags: 'a' });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  children.set(role, child);
  child.once('exit', () => { log.end(); if (role === 'generation') accepting = false; });
  await new Promise((resolveReady, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`${role} did not start`)), 60000);
    child.once('error', () => { clearTimeout(timer); reject(new Error(`${role} failed to start`)); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`${role} exited before readiness`)); });
    child.stdout.on('data', chunk => { text = (text + chunk).slice(-8192); if (text.includes(readyMarker)) { clearTimeout(timer); resolveReady(); } });
  });
  state.pids[role] = child.pid; saveState();
}
async function switchProvider(mode) {
  if (!['mock', 'atlas'].includes(mode)) throw new Error('Invalid provider mode');
  accepting = false;
  const [active] = await sql`select count(*)::int as n from wb_next.generation_jobs where status='accepted'`;
  if (active.n !== 0) { accepting = true; throw new Error('Wait for existing jobs before switching provider'); }
  const previous = children.get('generation');
  if (previous && previous.exitCode === null && previous.signalCode === null) {
    const ended = new Promise(done => previous.once('exit', done)); previous.kill('SIGTERM'); await ended;
  }
  const env = { ...baseEnv(), WORKER_PROVIDER_MODE: mode, ...(mode === 'atlas' ? provider() : {}) };
  await launch('generation', 'apps/worker/dist/main.js', env, 'generation_worker_started');
  state.mode = mode; accepting = true; saveState();
}
async function main() {
  mkdirSync(directory, { recursive: true });
  let reuse = false;
  if (existsSync(stateFile)) {
    const old = JSON.parse(readFileSync(stateFile, 'utf8'));
    try {
      const info = await (await fetch(`${old.apiBase}/__acceptance`, { signal: AbortSignal.timeout(2000) })).json();
      if (info.runId === old.runId) { console.log(JSON.stringify({ event: 'acceptance_already_running', apiBase: old.apiBase, mode: info.mode })); return; }
    } catch {}
    if (!old.apiBase && old.containers?.length === 3 && Object.keys(old.pids ?? {}).length === 0) { state = old; reuse = true; }
    else throw new Error('Existing acceptance state preserved; recover it before starting another stack');
  }
  let pg, temporal, s3;
  if (!reuse) {
  state = { runId: `wb-video-${randomUUID()}`, pids: {}, mode: 'mock', supervisorKey: randomBytes(32).toString('hex'), pgPassword: randomBytes(24).toString('hex'),
    objectStore: { region: 'garage', bucket: 'videos', accessKeyId: `GK${randomBytes(16).toString('hex')}`, secretAccessKey: randomBytes(32).toString('hex') }, containers: [], volumes: [] };
  saveState();
  for (const role of ['pg', 'temporal', 's3']) {
    const volume = `${state.runId}-${role}-data`; docker(['volume', 'create', '--label', `wb.video-acceptance=${state.runId}`, volume]); state.volumes.push(volume);
  }
  const configPath = join(directory, 'garage.toml');
  write(configPath, `metadata_dir = "/data/meta"\ndata_dir = "/data/blocks"\ndb_engine = "sqlite"\nreplication_factor = 1\nrpc_bind_addr = "0.0.0.0:3901"\nrpc_public_addr = "127.0.0.1:3901"\nrpc_secret = "${randomBytes(32).toString('hex')}"\n[s3_api]\ns3_region = "garage"\napi_bind_addr = "0.0.0.0:3900"\nroot_domain = ".s3.garage.localhost"\n`);
  function container(role, args) {
    const name = `${state.runId}-${role}`;
    docker(['run', '-d', '--name', name, '--label', `wb.video-acceptance=${state.runId}`, ...args]); state.containers.push(name); saveState(); return name;
  }
  pg = container('pg', ['-p', '127.0.0.1::5432', '-v', `${state.volumes[0]}:/var/lib/postgresql/data`, '-e', 'POSTGRES_USER=wb', '-e', `POSTGRES_PASSWORD=${state.pgPassword}`, '-e', 'POSTGRES_DB=workbench_acceptance', 'postgres:16-alpine']);
  docker(['run', '--rm', '-v', `${state.volumes[1]}:/data`, 'alpine:3.22', 'chown', '1000:1000', '/data']);
  temporal = container('temporal', ['-p', '127.0.0.1::7233', '-v', `${state.volumes[1]}:/data`, TEMPORAL, 'server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/data/temporal.sqlite', '--headless', '--log-level', 'warn']);
  s3 = container('s3', ['-p', '127.0.0.1::3900', '-v', `${state.volumes[2]}:/data`, '--mount', `type=bind,source=${configPath},target=/etc/garage.toml,readonly`,
    '-e', `GARAGE_DEFAULT_ACCESS_KEY=${state.objectStore.accessKeyId}`, '-e', `GARAGE_DEFAULT_SECRET_KEY=${state.objectStore.secretAccessKey}`, '-e', 'GARAGE_DEFAULT_BUCKET=videos',
    GARAGE, '/garage', 'server', '--single-node', '--default-bucket']);
  } else {
    [pg, temporal, s3] = state.containers;
    for (const name of state.containers) inspect(name);
    const [volume] = JSON.parse(docker(['volume', 'inspect', state.volumes[1]]));
    if (volume.Labels['wb.video-acceptance'] !== state.runId) throw new Error('Acceptance volume ownership mismatch');
    docker(['run', '--rm', '-v', `${state.volumes[1]}:/data`, 'alpine:3.22', 'chown', '1000:1000', '/data']);
    for (const name of state.containers) if (inspect(name).State.Status !== 'running') docker(['start', name]);
  }
  await wait(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'wb', '-d', 'workbench_acceptance'], { windowsHide: true, stdio: 'ignore' }).status === 0);
  await wait(() => spawnSync('docker', ['exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], { windowsHide: true, stdio: 'ignore' }).status === 0);
  state.databaseUrl = `postgres://wb:${state.pgPassword}@127.0.0.1:${publishedPort(pg, 5432)}/workbench_acceptance`;
  state.temporalAddress = `127.0.0.1:${publishedPort(temporal, 7233)}`;
  state.objectStore.endpoint = `http://127.0.0.1:${publishedPort(s3, 3900)}`;
  saveState();
  const migration = spawnSync(process.execPath, ['packages/server/scripts/migrate.cjs'], { cwd: root, env: baseEnv(), windowsHide: true, encoding: 'utf8' });
  if (migration.status !== 0) throw new Error('Acceptance migration failed');
  sql = postgres(state.databaseUrl, { max: 2 });
  store = createObjectStore(state.objectStore);
  await wait(() => store.probe().then(() => true));
  const storageEnv = { S3_ENDPOINT: state.objectStore.endpoint, S3_REGION: 'garage', S3_BUCKET: 'videos', S3_ACCESS_KEY_ID: state.objectStore.accessKeyId, S3_SECRET_ACCESS_KEY: state.objectStore.secretAccessKey };
  await launch('media', 'apps/media-worker/dist/main.js', { ...baseEnv(), ...storageEnv, MEDIA_FONT_FILE: 'C:/Windows/Fonts/msyh.ttc' }, 'media_worker_started');
  await switchProvider('mock');
  app = await createApplication({ config: { databaseUrl: state.databaseUrl, port: 0, corsOrigins: ['http://127.0.0.1:4175', 'http://localhost:4175'] }, objectStore: store, generationAvailable: () => accepting });
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/__acceptance', async () => ({ runId: state.runId, mode: state.mode }));
  fastify.post('/__acceptance/provider', async (request, reply) => {
    const key = request.headers['x-acceptance-key'];
    if (typeof key !== 'string' || key.length !== state.supervisorKey.length || !timingSafeEqual(Buffer.from(key), Buffer.from(state.supervisorKey))) return reply.code(403).send({ error: 'Denied' });
    try { await switchProvider(request.body?.mode); return { mode: state.mode }; }
    catch { return reply.code(409).send({ error: 'Provider switch unavailable; inspect local worker logs' }); }
  });
  await app.listen(0, '127.0.0.1');
  state.apiBase = await app.getUrl(); saveState();
  console.log(JSON.stringify({ event: 'acceptance_ready', apiBase: state.apiBase, mode: state.mode, runId: state.runId }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    accepting = false;
    for (const child of children.values()) if (child.exitCode === null) child.kill('SIGTERM');
    void app.close().then(async () => { store.close(); await sql.end(); });
  });
}
main().catch(() => { accepting = false; console.error('Acceptance startup failed; local state and volumes preserved for recovery.'); process.exitCode = 1; });
