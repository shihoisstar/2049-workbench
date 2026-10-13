import { portraitBinding, scriptProviderBinding, seriesScriptProviderBinding, marketingCopyBinding } from '@wb/server';
import type { PortraitOffer, ScriptOffer } from '@wb/server';
import { nativeMarketingBinding } from '@wb/server';
import type { NativeMarketingOffer } from '@wb/server';

export interface ApiConfig {
  port: number;
  databaseUrl: string;
  corsOrigins?: string[];
  opsToken?: string;
  scriptOffer?: ScriptOffer;
  batchOffer?: ScriptOffer;
  copyOffer?: ScriptOffer;
  portraitOffer?: PortraitOffer;
  nativeMarketingOffer?: NativeMarketingOffer;
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
  const opsToken = env.API_OPS_TOKEN;
  let nativeMarketingOffer: NativeMarketingOffer | undefined;
  if (env.API_NATIVE_MARKETING_ENABLED === '1') {
    const credits = Number(env.NATIVE_MARKETING_CREDITS);
    if (!Number.isSafeInteger(credits) || credits < 1) throw new Error('Explicit native marketing price required');
    nativeMarketingOffer = { credits, binding: nativeMarketingBinding(env.ATLAS_BASE_URL) };
  }
  let scriptOffer: ScriptOffer | undefined;
  if (env.API_DRAMA_SCRIPT_ENABLED === '1') {
    const credits = Number(env.DRAMA_SCRIPT_CREDITS);
    const model = env.ATLAS_CHAT_MODEL?.trim();
    const baseUrl = env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai';
    const base = new URL(baseUrl);
    if (!Number.isSafeInteger(credits) || credits < 1 || !model || model.length > 200 || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Explicit script model and positive pricing are required');
    scriptOffer = { binding: scriptProviderBinding({ model, baseUrl }), credits, estimatedCostCents: null };
  }
  let portraitOffer: PortraitOffer | undefined;
  let copyOffer: ScriptOffer | undefined;
  if (env.API_MARKETING_COPY_ENABLED === '1') {
    const credits = Number(env.MARKETING_COPY_CREDITS); const model = env.ATLAS_CHAT_MODEL?.trim();
    const baseUrl = env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai'; const base = new URL(baseUrl);
    if (!Number.isSafeInteger(credits) || credits < 1 || !model || model.length > 200 || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Explicit copy model and pricing required');
    copyOffer = { binding: marketingCopyBinding({ model, baseUrl }), credits, estimatedCostCents: null };
  }
  let batchOffer: ScriptOffer | undefined;
  if (env.API_DRAMA_BATCH_ENABLED === '1') {
    const credits = Number(env.DRAMA_BATCH_EPISODE_CREDITS); const model = env.ATLAS_CHAT_MODEL?.trim();
    const baseUrl = env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai'; const base = new URL(baseUrl);
    if (!Number.isSafeInteger(credits) || credits < 1 || !model || model.length > 200 || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Explicit batch model and per-episode pricing required');
    batchOffer = { binding: seriesScriptProviderBinding({ model, baseUrl }), credits, estimatedCostCents: null };
  }
  if (env.API_DRAMA_PORTRAIT_ENABLED === '1') {
    const credits = Number(env.DRAMA_PORTRAIT_CREDITS); const baseUrl = env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai'; const base = new URL(baseUrl);
    if (!Number.isSafeInteger(credits) || credits < 1 || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Explicit portrait pricing and HTTPS provider required');
    portraitOffer = { credits, binding: portraitBinding('atlas', baseUrl) };
  }
  return { port: Number(rawPort), databaseUrl, ...(opsToken ? { opsToken } : {}), ...(scriptOffer ? { scriptOffer } : {}), ...(batchOffer ? { batchOffer } : {}), ...(copyOffer ? { copyOffer } : {}), ...(portraitOffer ? { portraitOffer } : {}), ...(nativeMarketingOffer ? { nativeMarketingOffer } : {}) };
}
