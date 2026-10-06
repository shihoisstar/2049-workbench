import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertTestEnvironment(env) {
  for (const name of ['DATABASE_URL', 'WB_NEXT_TEST_DATABASE_URL', 'API_NEXT_DATABASE_URL']) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} must explicitly identify the isolated test database; run pnpm verify:isolated`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !/^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/.test(url.pathname)
      || url.search || url.hash) {
      throw new Error(`${name} is not an allowed isolated test database`);
    }
  }
  if (env.DATABASE_URL !== env.WB_NEXT_TEST_DATABASE_URL || env.DATABASE_URL !== env.API_NEXT_DATABASE_URL) {
    throw new Error('Old API, new API and integration tests must use the same explicitly isolated database');
  }
  let redis;
  try { redis = new URL(env.REDIS_URL); } catch { throw new Error('REDIS_URL must explicitly identify the isolated test Redis'); }
  if (redis.protocol !== 'redis:' || !['127.0.0.1', 'localhost', '[::1]'].includes(redis.hostname)
    || !/^\/\d+$/.test(redis.pathname) || redis.search || redis.hash) {
    throw new Error('REDIS_URL is not an allowed local test Redis');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertTestEnvironment(process.env); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
