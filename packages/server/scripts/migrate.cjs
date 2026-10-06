const { resolve } = require('node:path');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

async function main() {
  const url = process.env.API_NEXT_DATABASE_URL;
  if (!url) throw new Error('API_NEXT_DATABASE_URL is required; migrations never read the old API .env');
  const client = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../migrations'),
      migrationsSchema: 'wb_next_migrations',
    });
    console.log('New identity/billing migrations applied.');
  } finally { await client.end(); }
}
main().catch(() => { console.error('New schema migration failed; check the explicitly configured database and migration files.'); process.exitCode = 1; });
