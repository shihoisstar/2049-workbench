import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>['db'];

/** 事务句柄类型,从 Db 推导(避免手写泛型与实际 schema 漂移)。 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
