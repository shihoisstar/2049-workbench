import { createApplication } from './application';
import { readConfig } from './config';

async function main(): Promise<void> {
  const config = readConfig();
  const app = await createApplication({ config });
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    await app.listen(config.port, '0.0.0.0');
    console.info(JSON.stringify({ event: 'api_next_listening', port: config.port }));
  } catch (error) {
    await app.close();
    throw error;
  }
}

void main().catch(() => {
  console.error(JSON.stringify({ event: 'api_next_start_failed' }));
  process.exitCode = 1;
});
