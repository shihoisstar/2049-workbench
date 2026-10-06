import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../../bin/dependency-cruiser.mjs', import.meta.resolve('dependency-cruiser')));
const config = fileURLToPath(new URL('../.dependency-cruiser.cjs', import.meta.url));

function cruise(files, setup) {
  const cwd = mkdtempSync(join(tmpdir(), 'wb-boundaries-'));
  try {
    const write = (path, content) => {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), content);
    };
    write('tsconfig.base.json', JSON.stringify({ compilerOptions: {
      baseUrl: '.', paths: { '@server/*': ['packages/server/src/*'] },
    } }));
    write('package.json', '{"private":true}');
    mkdirSync(join(cwd, 'apps'));
    mkdirSync(join(cwd, 'packages'));
    copyFileSync(config, join(cwd, '.dependency-cruiser.cjs'));
    for (const [path, content] of Object.entries(files)) write(path, content);
    setup?.(cwd, write);
    const result = spawnSync(process.execPath, [cli, '--config', '.dependency-cruiser.cjs', '--output-type', 'err', 'apps', 'packages'], { cwd, encoding: 'utf8' });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    // Only this function's freshly allocated temp directory is removed.
    rmSync(cwd, { recursive: true, force: true });
  }
}

function rejects(files, rule, setup) {
  const result = cruise(files, setup);
  // dependency-cruiser may return the number of violations; overlapping rules are still failures.
  assert.ok(result.status !== null && result.status > 0, result.output);
  assert.ok(result.output.includes(rule), result.output);
  return result;
}

test('frontend importing backend through a TypeScript alias fails', () => {
  const result = rejects({
    'apps/miniapp/src/index.ts': "import { secret } from '@server/secret'; export { secret };",
    'packages/server/src/secret.ts': 'export const secret = 1;',
  }, 'no-client-to-server');
  assert.ok(result.output.includes('packages/server/src/secret.ts'), result.output);
});

test('cross-module repository import fails', () => {
  rejects({
    'packages/server/src/modules/drama/use-case.ts': "export { reserve } from '../billing/repository';",
    'packages/server/src/modules/billing/repository.ts': 'export const reserve = 1;',
  }, 'server-module-public-only');
});

test('pure domain importing Node IO fails', () => {
  rejects({ 'packages/domain/src/wallet.ts': "export { readFileSync } from 'node:fs';" }, 'portable-no-node');
});

test('applications cannot import another application', () => {
  rejects({
    'apps/api/src/index.ts': "export { worker } from '../../worker/src/index';",
    'apps/worker/src/index.ts': 'export const worker = 1;',
  }, 'no-app-to-app');
});

test('API cannot bypass module ownership through compiled private repositories', () => {
  rejects({
    'apps/api-next/src/index.ts': "export { tx } from '../../../packages/server/dist/modules/billing/repository.js';",
    'packages/server/dist/modules/billing/repository.js': 'exports.tx = 1;',
  }, 'app-server-public-only');
});

test('contracts and generated client cannot import platform runtimes', () => {
  for (const name of ['contracts', 'api-client', 'domain']) {
    rejects({ [`packages/${name}/src/index.ts`]: "export { request } from 'undici';" }, 'portable-no-platform-runtime');
  }
});

test('contract tooling must live outside portable source', () => {
  rejects({
    'packages/contracts/src/index.ts': "export * from './contract-diff';",
    'packages/contracts/src/contract-diff.ts': "export { readFileSync } from 'node:fs';",
  }, 'portable-no-node');
});

test('public entrypoints, internal imports, test IO and external CLI are allowed', () => {
  const result = cruise({
    'apps/api/src/index.ts': "export { reserve } from '@server/modules/billing/public';",
    'packages/server/src/modules/drama/use-case.ts': "export { reserve } from '../billing/public';",
    'packages/server/src/modules/billing/public.ts': "export { reserve } from './repository';",
    'packages/server/src/modules/billing/repository.ts': 'export const reserve = 1;',
    'packages/domain/src/wallet.ts': 'export const balance = 0;',
    'packages/domain/src/wallet.test.ts': "import { test } from 'node:test'; test('wallet', () => {});",
    'packages/contracts/scripts/contract-diff.ts': "export { readFileSync } from 'node:fs';",
  });
  assert.equal(result.status, 0, result.output);
});

test('generated client cannot reach the replacement API application', () => {
  rejects({
    'packages/api-client/src/index.ts': "export { secret } from '../../../apps/api-next/src/index';",
    'apps/api-next/src/index.ts': 'export const secret = 1;',
  }, 'no-client-to-server');
});

test('workspace package exports resolve to server source and cannot bypass the boundary', () => {
  const result = rejects({
    'apps/miniapp/src/index.ts': "export { secret } from '@wb/server';",
    'packages/server/package.json': '{"name":"@wb/server","exports":{".":"./src/index.ts"}}',
    'packages/server/src/index.ts': 'export const secret = 1;',
  }, 'no-client-to-server', (cwd) => {
    mkdirSync(join(cwd, 'node_modules/@wb'), { recursive: true });
    symlinkSync(join(cwd, 'packages/server'), join(cwd, 'node_modules/@wb/server'), process.platform === 'win32' ? 'junction' : 'dir');
  });
  assert.ok(result.output.includes('packages/server/src/index.ts'), result.output);
});
