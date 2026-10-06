import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerNames, isolatedEnvironment, failureCode, runCommand, parseArguments, ownedContainerId } from './verify-isolated.mjs';
import { assertTestEnvironment } from './assert-test-environment.mjs';

test('gate refuses missing, remote, mismatched or ordinary development database targets before tests run', () => {
  const valid = isolatedEnvironment(49101, 49102, {});
  assert.doesNotThrow(() => assertTestEnvironment(valid));
  assert.throws(() => assertTestEnvironment({}), /explicitly/);
  assert.throws(() => assertTestEnvironment({ ...valid, DATABASE_URL: 'postgres://localhost/workbench' }), /allowed/);
  assert.throws(() => assertTestEnvironment({ ...valid, WB_NEXT_TEST_DATABASE_URL: 'postgres://remote/workbench_verify' }), /allowed/);
  assert.throws(() => assertTestEnvironment({ ...valid, API_NEXT_DATABASE_URL: 'postgres://localhost/workbench_audit' }), /same/);
  assert.throws(() => assertTestEnvironment({ ...valid, REDIS_URL: 'redis://remote/1' }), /allowed/);
});

test('only the optional wallet audit mode is accepted', () => {
  assert.deepEqual(parseArguments([]), { walletAudit: false });
  assert.deepEqual(parseArguments(['--wallet-audit']), { walletAudit: true });
  for (const args of [['--unknown'], ['--wallet-audit', '--wallet-audit'], ['--wallet-audit', 'extra']]) {
    assert.throws(() => parseArguments(args), /Usage/);
  }
});

test('cleanup requires this run label and removes by immutable container ID', () => {
  const id = 'a'.repeat(64);
  const container = { Id: id, Config: { Labels: { 'wb.verify-run': 'current-run' } } };
  assert.equal(ownedContainerId(container, 'current-run'), id);
  assert.throws(() => ownedContainerId(container, 'other-run'), /ownership mismatch/);
  assert.throws(() => ownedContainerId({ Id: id }, 'current-run'), /ownership mismatch/);
  assert.throws(() => ownedContainerId(undefined, undefined), /ownership mismatch/);
  assert.throws(() => ownedContainerId({ ...container, Id: 'shared-name' }, 'current-run'), /ownership mismatch/);
});

test('each run owns unique, Docker-safe container names', () => {
  const first = containerNames();
  const second = containerNames();
  assert.equal(new Set([...first, ...second]).size, 4);
  for (const name of first) assert.match(name, /^wb-verify-[a-f0-9-]{36}-(pg|redis)$/);
  assert.throws(() => containerNames('shared-production'), /Invalid/);
});

test('isolated connections override inherited service URLs and force uncached execution', () => {
  const inherited = { DATABASE_URL: 'postgres://production/real', REDIS_URL: 'redis://production/0', TURBO_FORCE: 'false', TURBO_ENV_MODE: 'strict', PATH: 'preserved' };
  const env = isolatedEnvironment(49101, 49102, inherited);
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(env.DATABASE_URL).port, '49101');
  assert.equal(new URL(env.DATABASE_URL).pathname, '/workbench_verify');
  assert.equal(env.REDIS_URL, 'redis://127.0.0.1:49102/0');
  assert.equal(env.TURBO_FORCE, 'true');
  assert.equal(env.TURBO_ENV_MODE, 'loose');
  assert.equal(env.PATH, 'preserved');
  assert.equal(inherited.DATABASE_URL, 'postgres://production/real');
  for (const port of [0, -1, 65536, '5432', NaN]) assert.throws(() => isolatedEnvironment(port, 6379), /Invalid/);
});

test('failed commands and interruptions cannot become successful exit codes', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], { capture: true }), error => failureCode(error) === 7);
  assert.equal(failureCode({ exitCode: 7 }), 7);
  assert.equal(failureCode({ exitCode: 130 }), 130);
  assert.equal(failureCode({ exitCode: 124 }), 124);
  assert.equal(failureCode(new Error('spawn failed')), 1);
  assert.equal(failureCode({ exitCode: null }), 1);
  assert.equal(failureCode({ exitCode: 0 }), 1);
});

test('a stalled subprocess is terminated and reported as a failure', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { capture: true, timeout: 100 }), /timed out/);
});
