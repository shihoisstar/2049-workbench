export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const databaseUrl = required('API_NEXT_DATABASE_URL');
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error('API_NEXT_DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) throw new Error('Invalid API_NEXT_DATABASE_URL');
  const mode = required('WORKER_PROVIDER_MODE');
  if (mode !== 'mock' && mode !== 'atlas') throw new Error('WORKER_PROVIDER_MODE must be mock or atlas');
  const atlas = mode === 'atlas' ? {
    secret: required('ATLAS_API_KEY'), model: required('ATLAS_MODEL'), fastModel: required('ATLAS_MODEL_FAST'),
    baseUrl: env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai',
  } : null;
  if (atlas) {
    let base: URL;
    try { base = new URL(atlas.baseUrl); } catch { throw new Error('Invalid ATLAS_BASE_URL'); }
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('ATLAS_BASE_URL must be HTTPS without credentials or query');
  }
  return { databaseUrl, mode, atlas, address: required('TEMPORAL_ADDRESS'),
    namespace: env.TEMPORAL_NAMESPACE ?? 'default', taskQueue: required('TEMPORAL_TASK_QUEUE'), mediaTaskQueue: env.TEMPORAL_MEDIA_TASK_QUEUE };
}
