export interface ApiConfig {
  port: number;
  databaseUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const rawPort = env.API_NEXT_PORT ?? '3011';
  if (!/^[1-9]\d*$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error('API_NEXT_PORT must be an integer between 1 and 65535');
  }
  const databaseUrl = env.API_NEXT_DATABASE_URL;
  if (!databaseUrl) throw new Error('API_NEXT_DATABASE_URL is required');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('API_NEXT_DATABASE_URL must be a PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.pathname.length < 2 || parsed.hash) {
    throw new Error('API_NEXT_DATABASE_URL must identify a PostgreSQL host and database');
  }
  return { port: Number(rawPort), databaseUrl };
}
