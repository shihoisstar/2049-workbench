#!/usr/bin/env node
// Temporary dependencies for a real, uncached gate. Never reuse a caller's database.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ownershipLabel = 'wb.verify-run';

export function parseArguments(args) {
  if (args.length === 0) return { walletAudit: false };
  if (args.length === 1 && args[0] === '--wallet-audit') return { walletAudit: true };
  throw new Error('Usage: node scripts/verify-isolated.mjs [--wallet-audit]');
}

export function ownedContainerId(container, runId) {
  if (typeof runId !== 'string' || !runId || container?.Config?.Labels?.[ownershipLabel] !== runId
      || !/^[a-f0-9]{64}$/.test(container?.Id ?? '')) {
    throw new Error('Container ownership mismatch; refusing cleanup');
  }
  return container.Id;
}

export function containerNames(id = randomUUID()) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid isolation ID');
  return [`wb-verify-${id}-pg`, `wb-verify-${id}-redis`];
}

export function isolatedEnvironment(pgPort, redisPort, inherited = process.env) {
  for (const port of [pgPort, redisPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid container port');
  }
  return {
    ...inherited,
    DATABASE_URL: `postgres://wb:wb_dev_only@127.0.0.1:${pgPort}/workbench_verify`,
    API_NEXT_DATABASE_URL: `postgres://wb:wb_dev_only@127.0.0.1:${pgPort}/workbench_verify`,
    WB_NEXT_TEST_DATABASE_URL: `postgres://wb:wb_dev_only@127.0.0.1:${pgPort}/workbench_verify`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
    TURBO_FORCE: 'true',
    TURBO_ENV_MODE: 'loose',
  };
}

export function failureCode(error) {
  return Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
}

function pnpmCommand() {
  if (process.platform !== 'win32') return ['pnpm'];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const executable = join(directory, 'pnpm.exe');
    if (existsSync(executable)) return [executable];
    // npm's Windows shim cannot be spawned without cmd.exe; invoke its JS entry instead.
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(entry)) return [process.execPath, entry];
  }
  throw new Error('Cannot find pnpm executable or npm-installed pnpm JS entry on PATH');
}

function run(command, args, { env = process.env, signal, capture = false, timeout = 120_000 } = {}) {
  return new Promise((resolveRun, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const child = spawn(command, args, {
      cwd: root, env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    let errorOutput = '';
    let stopped;
    let killTimer;
    child.stdout?.on('data', data => { output += data; });
    child.stderr?.on('data', data => { errorOutput += data; });
    const stop = (reason) => {
      if (stopped) return;
      stopped = reason;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10_000, stdio: 'ignore' });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
        killTimer = setTimeout(() => {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
        }, 2_000);
      }
    };
    const onAbort = () => stop(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop(new Error(`${command} timed out`)), timeout);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (stopped && process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* process group already exited */ }
      }
      signal?.removeEventListener('abort', onAbort);
      if (stopped) return reject(stopped);
      if (code !== 0) return reject(Object.assign(new Error(`${command} exited ${code}${errorOutput ? `: ${errorOutput.trim()}` : ''}`), { exitCode: code }));
      resolveRun(output.trim());
    });
  });
}

export { run as runCommand };

async function waitHealthy(name, signal) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const health = await run('docker', ['inspect', '--format', '{{.State.Health.Status}}', name], { capture: true, signal });
    if (health === 'healthy') return;
    if (health === 'unhealthy') throw new Error(`${name} is unhealthy`);
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`${name} health check timed out`);
}

async function publishedPort(name, port, signal) {
  const value = await run('docker', ['port', name, `${port}/tcp`], { capture: true, signal });
  const match = /^127\.0\.0\.1:(\d+)$/.exec(value);
  if (!match) throw new Error(`Unexpected port binding for ${name}`);
  return Number(match[1]);
}

export async function main(args = process.argv.slice(2)) {
  const runId = randomUUID();
  const names = containerNames(runId);
  const cleanup = [];
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(new Error('Verification interrupted'), { exitCode: 130 }));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const totalTimeout = setTimeout(() => controller.abort(Object.assign(new Error('Verification exceeded 35 minutes'), { exitCode: 124 })), 35 * 60_000);
  let exitCode = 0;
  try {
    const { walletAudit } = parseArguments(args);
    const [pnpm, ...prefix] = pnpmCommand();
    // Pull before reserving names so network failures cannot leave running services.
    for (const image of ['postgres:16-alpine', 'redis:7-alpine']) {
      await run('docker', ['image', 'inspect', image], { capture: true, signal: controller.signal }).catch(async error => {
        if (controller.signal.aborted) throw error;
        await run('docker', ['pull', image], { signal: controller.signal, timeout: 300_000 });
      });
    }
    for (const [index, image, port, health, extra] of [
      [0, 'postgres:16-alpine', 5432, 'pg_isready -U wb -d workbench_verify', ['-e', 'POSTGRES_USER=wb', '-e', 'POSTGRES_PASSWORD=wb_dev_only', '-e', 'POSTGRES_DB=workbench_verify']],
      [1, 'redis:7-alpine', 6379, 'redis-cli ping', []],
    ]) {
      cleanup.push(names[index]);
      await run('docker', ['run', '-d', '--name', names[index], '--label', `${ownershipLabel}=${runId}`, '-p', `127.0.0.1::${port}`, '--health-cmd', health, '--health-interval', '1s', '--health-timeout', '3s', '--health-retries', '60', ...extra, image], { capture: true, signal: controller.signal });
      await waitHealthy(names[index], controller.signal);
    }
    const pgPort = await publishedPort(names[0], 5432, controller.signal);
    const redisPort = await publishedPort(names[1], 6379, controller.signal);
    const env = isolatedEnvironment(pgPort, redisPort);
    console.log(`Isolated verification: ${names.join(', ')}; ports ${pgPort}, ${redisPort}`);
    await run(pnpm, [...prefix, '--filter', '@wb/api', 'db:migrate'], { env, signal: controller.signal });
    await run(pnpm, [...prefix, '--filter', '@wb/server', 'db:migrate'], { env, signal: controller.signal });
    await run(pnpm, [...prefix, 'gate'], { env, signal: controller.signal, timeout: 30 * 60_000 });
    await run(process.execPath, ['scripts/smoke-api-next.mjs'], {
      env: { ...env, API_NEXT_DATABASE_URL: env.DATABASE_URL }, signal: controller.signal,
    });
    if (walletAudit) {
      await run(process.execPath, ['scripts/audit-wallet.mjs'], {
        env: { ...env, WB_AUDIT_DATABASE_URL: env.DATABASE_URL }, signal: controller.signal,
      });
    }
  } catch (error) {
    console.error(error.message);
    exitCode = failureCode(error);
  } finally {
    clearTimeout(totalTimeout);
    // Verify this run's label, then delete immutable IDs to avoid name-replacement races.
    for (const name of cleanup.reverse()) {
      try {
        const inspection = JSON.parse(await run('docker', ['inspect', '--type', 'container', name], { capture: true, timeout: 30_000 }));
        const id = ownedContainerId(inspection[0], runId);
        await run('docker', ['rm', '-f', '-v', id], { capture: true, timeout: 30_000 });
      }
      catch (error) {
        if (!error.message.includes('No such container')) {
          console.error(`Cleanup failed for ${name}: ${error.message}`);
          exitCode ||= 1;
        }
      }
    }
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  return exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
