import postgres from 'postgres';

export interface DatabaseConnection {
  probe(): Promise<void>;
  close(): Promise<void>;
}

export function connectDatabase(databaseUrl: string): DatabaseConnection {
  const sql = postgres(databaseUrl, {
    max: 5,
    connect_timeout: 3,
    idle_timeout: 20,
    connection: { statement_timeout: 3000 },
  });
  return {
    async probe() { await sql`select 1`; },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
