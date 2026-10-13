// Disposable loopback-only stack for the actual WeChat creation flow.
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '..');
const workerRequire = createRequire(join(root, 'apps/worker/package.json'));
const { createServices, portraitBinding } = workerRequire('@wb/server');
const { createObjectStore } = workerRequire('@wb/media');
const { createApplication } = require('../apps/api-next/dist/application');
const runId = `wb-miniapp-drama-${randomUUID()}`;
const directory = join(root, '.local', runId);
const containers = [];
let app, worker, mediaWorker;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed`);
  return result.stdout.trim();
}
function start(suffix, args) {
  const name = `${runId}-${suffix}`;
  docker(['run', '-d', '--name', name, '--label', `wb.miniapp-drama=${runId}`, ...args]);
  containers.push(name); return name;
}
function save(name, value) {
  const content = JSON.stringify(value, null, 2) + '\n'; const path = join(directory, name);
  writeFileSync(path, content); if (readFileSync(path, 'utf8') !== content) throw new Error('Readback mismatch');
}
async function eventually(operation) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await operation()) return;
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error('Isolated dependency unavailable');
}
async function main() {
  mkdirSync(directory, { recursive: true });
  try {
    const pg = start('pg', ['-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_USER=wb', '-e', 'POSTGRES_PASSWORD=wb_dev_only', '-e', 'POSTGRES_DB=workbench_verify', 'postgres:16-alpine']);
    const temporal = start('temporal', ['-p', '127.0.0.1::7233', '--cpus', '2', '--memory', '1g', 'temporalio/temporal:1.9.1@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e', 'server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/tmp/miniapp.sqlite', '--headless', '--log-level', 'warn']);
    await eventually(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'wb', '-d', 'workbench_verify'], { stdio: 'ignore', windowsHide: true }).status === 0);
    await eventually(() => spawnSync('docker', ['exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], { stdio: 'ignore', windowsHide: true }).status === 0);
    const port = (name, internal) => JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports[`${internal}/tcp`][0].HostPort;
    const databaseUrl = `postgres://wb:wb_dev_only@127.0.0.1:${port(pg, 5432)}/workbench_verify`;
    const env = { ...process.env, API_NEXT_DATABASE_URL: databaseUrl, WORKER_PROVIDER_MODE: 'mock', NATIVE_MARKETING_PROVIDER_MODE: 'disabled', DRAMA_SCRIPT_PROVIDER_MODE: 'disabled', MARKETING_COPY_PROVIDER_MODE: 'disabled', DRAMA_PORTRAIT_PROVIDER_MODE: 'mock', TEMPORAL_ADDRESS: `127.0.0.1:${port(temporal, 7233)}`, TEMPORAL_NAMESPACE: 'default', TEMPORAL_TASK_QUEUE: runId };
    for (const key of Object.keys(env)) if (/^(S3_|ATLAS_|TEMPORAL_MEDIA_)/.test(key)) delete env[key];
    env.TEMPORAL_MEDIA_TASK_QUEUE = `${runId}-media`; env.MEDIA_FONT_FILE = process.platform === 'win32' ? 'C:/Windows/Fonts/msyh.ttc' : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
    if (process.env.WB_NATIVE_CAPTION_REVIEW === '1') Object.assign(env, {
      NATIVE_ASR_PYTHON: join(root, '.local/voice-analysis-env/Scripts/python.exe'), NATIVE_ASR_SCRIPT: join(root, 'scripts/local-speech-transcribe.py'), NATIVE_ASR_MODEL_DIR: join(root, '.local/voice-models/faster-whisper-small'),
      NATIVE_MOCK_COMMERCE_FILE: join(root, '.local/native-commerce-2026-10-11/source.mp4'), NATIVE_MOCK_STORE_FILE: join(root, '.local/native-visit-2026-10-11/source.mp4'),
    });
    const migrated = spawnSync(process.execPath, ['packages/server/scripts/migrate.cjs'], { cwd: root, env, windowsHide: true, encoding: 'utf8' });
    if (migrated.status !== 0) throw new Error('Isolated migration failed');
    const accessKeyId = `GK${randomBytes(16).toString('hex')}`; const secretAccessKey = randomBytes(32).toString('hex');
    const garageConfig = join(directory, 'garage.toml');
    const content = `metadata_dir = "/tmp/garage/meta"\ndata_dir = "/tmp/garage/blocks"\ndb_engine = "sqlite"\nreplication_factor = 1\nrpc_bind_addr = "0.0.0.0:3901"\nrpc_public_addr = "127.0.0.1:3901"\nrpc_secret = "${randomBytes(32).toString('hex')}"\n[s3_api]\ns3_region = "garage"\napi_bind_addr = "0.0.0.0:3900"\nroot_domain = ".s3.garage.localhost"\n`;
    writeFileSync(garageConfig, content); if (readFileSync(garageConfig, 'utf8') !== content) throw new Error('Readback mismatch');
    const garage = start('s3', ['-p', '127.0.0.1::3900', '--mount', `type=bind,source=${garageConfig.replaceAll('\\', '/')},target=/etc/garage.toml,readonly`,
      '-e', `GARAGE_DEFAULT_ACCESS_KEY=${accessKeyId}`, '-e', `GARAGE_DEFAULT_SECRET_KEY=${secretAccessKey}`, '-e', 'GARAGE_DEFAULT_BUCKET=media',
      'dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690', '/garage', 'server', '--single-node', '--default-bucket']);
    const endpoint = `http://127.0.0.1:${port(garage, 3900)}`;
    const objectStore = createObjectStore({ endpoint, region: 'garage', bucket: 'media', accessKeyId, secretAccessKey });
    await eventually(() => objectStore.probe().then(() => true, () => false));
    Object.assign(env, { S3_ENDPOINT: endpoint, S3_REGION: 'garage', S3_BUCKET: 'media', S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey, ATLAS_BASE_URL: 'https://api.atlascloud.ai' });
    app = await createApplication({ config: { databaseUrl, port: 3027, portraitOffer: { binding: portraitBinding('mock'), credits: 7 } }, services: createServices(databaseUrl), dramaScriptMockAvailable: true, marketingCopyMockAvailable: true, nativeMarketingMockAvailable: true, planImageMockAvailable: true, objectStore });
    await app.listen(3027, '127.0.0.1');
    worker = spawn(process.execPath, ['apps/worker/dist/main.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    worker.stdout.on('data', bytes => { output += bytes; });
    worker.stderr.on('data', bytes => { output += bytes; });
    mediaWorker = spawn(process.execPath, ['apps/media-worker/dist/main.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    mediaWorker.stdout.on('data', bytes => { output += bytes; }); mediaWorker.stderr.on('data', bytes => { output += bytes; });
    save('state.json', { runId, databaseUrl, apiBase: 'http://127.0.0.1:3027', temporalAddress: env.TEMPORAL_ADDRESS, taskQueue: runId, mediaTaskQueue: env.TEMPORAL_MEDIA_TASK_QUEUE, workerPid: worker.pid, mediaWorkerPid: mediaWorker.pid });
    console.log(`Ready: ${directory}`);
    while (!existsSync(join(directory, 'stop'))) {
      if (worker.exitCode !== null) throw new Error('Mock worker exited');
      if (mediaWorker.exitCode !== null) throw new Error('Media worker exited');
      await new Promise(done => setTimeout(done, 500));
    }
    writeFileSync(join(directory, 'worker.log'), output);
  } finally {
    if (worker && worker.exitCode === null) { worker.kill('SIGKILL'); await new Promise(done => worker.once('exit', done)); }
    if (mediaWorker && mediaWorker.exitCode === null) { mediaWorker.kill('SIGKILL'); await new Promise(done => mediaWorker.once('exit', done)); }
    await app?.close();
    for (const name of containers.reverse()) {
      const [owned] = JSON.parse(docker(['inspect', name]));
      if (owned.Config.Labels['wb.miniapp-drama'] !== runId) throw new Error('Ownership mismatch');
      docker(['rm', '-f', '-v', owned.Id]);
    }
    save('cleanup.json', { remainingContainers: docker(['ps', '-a', '--filter', `label=wb.miniapp-drama=${runId}`, '--format', '{{.Names}}']).split('\n').filter(Boolean) });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
