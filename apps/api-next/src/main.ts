import { createApplication } from './application';
import { readConfig } from './config';
import { createObjectStore, readObjectStoreConfig } from '@wb/media';

async function main(): Promise<void> {
  const config = readConfig();
  const store = createObjectStore(readObjectStoreConfig());
  try {
    await store.probe();
    const app = await createApplication({ config, objectStore: store,
      dramaScriptMockAvailable: process.env.NODE_ENV === 'development' && process.env.DRAMA_SCRIPT_MOCK_ENABLED === '1',
      marketingCopyMockAvailable: process.env.NODE_ENV === 'development' && process.env.MARKETING_COPY_MOCK_ENABLED === '1' });
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    try {
      await app.listen(config.port, '0.0.0.0');
      console.info(JSON.stringify({ event: 'api_next_listening', port: config.port }));
    } catch (error) {
      await app.close();
      throw error;
    }
  } catch (error) {
    store.close();
    throw error;
  }
}

void main().catch(() => {
  console.error(JSON.stringify({ event: 'api_next_start_failed' }));
  process.exitCode = 1;
});
