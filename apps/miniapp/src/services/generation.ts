import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { GenerationList, GenerationQuote, GenerationSettings, GenerationView, GuestSession, MediaAccess, SubmitGeneration, WalletSummary } from '@wb/contracts';
import { createMiniappApiClient } from './taro-transport';

const client = createMiniappApiClient(process.env.TARO_APP_API_NEXT_BASE ?? '');
const SESSION = 'wb_v2_session';
const CREDENTIAL = 'wb_v2_guest_credential';
const PENDING = 'wb_v2_pending_video';
let sessionPromise: Promise<GuestSession> | null = null;
async function randomBytes(length: number) {
  if (process.env.TARO_ENV === 'weapp') return new Uint8Array((await Taro.getRandomValues({ length })).randomValues);
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
export async function newRequestKey() {
  const bytes = await randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
async function session(): Promise<GuestSession> {
  const saved = GuestSession.safeParse(Taro.getStorageSync(SESSION));
  if (saved.success) return saved.data;
  if (!sessionPromise) sessionPromise = (async () => {
    let credential: unknown = Taro.getStorageSync(CREDENTIAL);
    if (typeof credential !== 'string' || !/^[a-f0-9]{64}$/.test(credential)) {
      credential = hex(await randomBytes(32));
      await Taro.setStorage({ key: CREDENTIAL, data: credential });
    }
    const result = GuestSession.parse(await client.request('post', '/v2/auth/guest', { body: { credential: credential as string } }));
    await Taro.setStorage({ key: SESSION, data: result });
    return result;
  })().finally(() => { sessionPromise = null; });
  return sessionPromise;
}
async function authorized<T>(operation: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  const current = await session();
  try { return await operation({ authorization: `Bearer ${current.token}` }); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await Taro.removeStorage({ key: SESSION });
    sessionPromise = null;
    const renewed = await session();
    return operation({ authorization: `Bearer ${renewed.token}` });
  }
}
export function pendingGeneration(): SubmitGeneration | null {
  const pending = SubmitGeneration.safeParse(Taro.getStorageSync(PENDING));
  return pending.success ? pending.data : null;
}
export async function submitGeneration(input: SubmitGeneration): Promise<GenerationView> {
  const body = SubmitGeneration.parse(input);
  await Taro.setStorage({ key: PENDING, data: body });
  try {
    const job = GenerationView.parse(await authorized(headers => client.request('post', '/v2/generation', { body, headers })));
    await Taro.setStorage({ key: 'wb_v2_last_job', data: job.id });
    await Taro.removeStorage({ key: PENDING });
    return job;
  } catch (error) {
    if (error instanceof ApiError && [400, 402, 403, 409, 503].includes(error.status)) await Taro.removeStorage({ key: PENDING });
    throw error;
  }
}
export async function readGeneration(id: string) {
  return GenerationView.parse(await authorized(headers => client.request('get', '/v2/generation/{id}', { path: { id }, headers })));
}
export async function mediaAccess(id: string) {
  return MediaAccess.parse(await authorized(headers => client.request('get', '/v2/generation/{id}/media', { path: { id }, headers })));
}
export async function generationWallet() {
  return WalletSummary.parse(await authorized(headers => client.request('get', '/v2/wallet', { headers })));
}

export async function quoteGeneration(input: unknown): Promise<GenerationQuote> {
  return GenerationQuote.parse(await client.request('post', '/v2/generation/quote', {
    body: GenerationSettings.parse(input),
  }));
}

export async function listGenerations(cursor?: string) {
  return GenerationList.parse(await authorized(headers => client.request('get', '/v2/generation', { headers, query: cursor ? { cursor } : {} })));
}
