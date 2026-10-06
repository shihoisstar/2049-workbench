// Disposable local API for UI integration. Never loads the old .env/database.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../apps/api-next/dist/application.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `wb-ui-${randomUUID()}`;
let app;
let created = false;
let stopping = false;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) throw new Error(`Docker operation failed: ${args[0]}`);
  return result.stdout.trim();
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (app) await app.close();
  if (created) {
    const [container] = JSON.parse(docker(['inspect', name]));
    if (container.Config.Labels['wb.ui-run'] !== name) throw new Error('Container ownership mismatch');
    docker(['rm', '-f', '-v', container.Id]);
    created = false;
  }
}
try {
  docker(['run', '-d', '--name', name, '--label', `wb.ui-run=${name}`,
    '-e', 'POSTGRES_USER=wb', '-e', 'POSTGRES_PASSWORD=wb_dev_only', '-e', 'POSTGRES_DB=workbench_ui',
    '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data', 'postgres:16-alpine']);
  created = true;
  const [container] = JSON.parse(docker(['inspect', name]));
  const port = container.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'wb'], { windowsHide: true, stdio: 'ignore' }).status === 0) {
      ready = true; break;
    }
    await setTimeout(250);
  }
  if (!ready) throw new Error('Development database did not become ready');
  const databaseUrl = `postgres://wb:wb_dev_only@127.0.0.1:${port}/workbench_ui`;
  const migration = spawnSync(process.execPath, ['packages/server/scripts/migrate.cjs'], {
    cwd: root, env: { ...process.env, API_NEXT_DATABASE_URL: databaseUrl }, windowsHide: true, stdio: 'inherit',
  });
  if (migration.status !== 0) throw new Error('Development migration failed');
  app = await createApplication({ config: { port: 3011, databaseUrl } });
  await app.listen(3011, '127.0.0.1');
  console.info(`UI integration API: http://127.0.0.1:3011; owned database ${name}; generation disabled.`);
  console.info('Ctrl+C closes API and deletes this disposable database. Existing databases are untouched.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void cleanup().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development API failed');
  await cleanup();
  process.exitCode = 1;
}
