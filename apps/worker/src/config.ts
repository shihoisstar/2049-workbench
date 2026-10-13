import { nativeMarketingBinding } from '@wb/server';
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
  const scriptMode = env.DRAMA_SCRIPT_PROVIDER_MODE?.trim() || 'disabled';
  if (scriptMode !== 'disabled' && scriptMode !== 'atlas') throw new Error('DRAMA_SCRIPT_PROVIDER_MODE must be disabled or atlas');
  const script = scriptMode === 'atlas' ? { secret: required('ATLAS_API_KEY'), model: required('ATLAS_CHAT_MODEL'), baseUrl: env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai' } : null;
  if (script) {
    const base = new URL(script.baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || script.model.length > 200) throw new Error('Invalid script provider configuration');
  }
  const portraitMode = env.DRAMA_PORTRAIT_PROVIDER_MODE?.trim() || 'disabled';
  if (!['disabled', 'mock', 'atlas'].includes(portraitMode)) throw new Error('Invalid portrait provider mode');
  const portrait = portraitMode === 'disabled' ? null : { mode: portraitMode as 'mock' | 'atlas', secret: portraitMode === 'atlas' ? required('ATLAS_API_KEY') : 'mock-only', baseUrl: env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai' };
  if (portrait) { const base = new URL(portrait.baseUrl); if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid portrait base URL'); }
  const copyMode = env.MARKETING_COPY_PROVIDER_MODE?.trim() || 'disabled';
  if (!['disabled', 'atlas'].includes(copyMode)) throw new Error('Invalid copy provider mode');
  const copy = copyMode === 'atlas' ? { secret: required('ATLAS_API_KEY'), model: required('ATLAS_CHAT_MODEL'), baseUrl: env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai' } : null;
  if (copy) { const base = new URL(copy.baseUrl); if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || copy.model.length > 200) throw new Error('Invalid copy provider configuration'); }
  const nativeMode = env.NATIVE_MARKETING_PROVIDER_MODE ?? 'disabled';
  if (!['disabled', 'atlas'].includes(nativeMode)) throw new Error('Invalid native marketing provider mode');
  const nativeMarketing = nativeMode === 'atlas' ? { secret: required('ATLAS_API_KEY'), baseUrl: (env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai').replace(/\/$/, ''), binding: nativeMarketingBinding(env.ATLAS_BASE_URL) } : null;
  if (nativeMarketing) required('TEMPORAL_MEDIA_TASK_QUEUE');
  return { databaseUrl, mode, atlas, script, portrait, copy, nativeMarketing, address: required('TEMPORAL_ADDRESS'),
    namespace: env.TEMPORAL_NAMESPACE ?? 'default', taskQueue: required('TEMPORAL_TASK_QUEUE'), mediaTaskQueue: env.TEMPORAL_MEDIA_TASK_QUEUE };
}
