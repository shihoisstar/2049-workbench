import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL } from '@wb/server';

interface Approval { approved: boolean; approvalId: string; chatModel: string; maxVideoCalls: number; maxTextCalls: number; maximumUsdEstimate: number }
interface Attempt { kind: 'video' | 'text'; hash: string; startedAt: string; state: 'pending' | 'received' | 'rejected' | 'unknown'; providerId?: string }
interface Journal { approvalId: string; attempts: Attempt[] }
const denied = () => Object.assign(new Error('Pilot allowance is unavailable; no provider request sent'), { status: 403 });
function approval(path: string): Approval {
  const value: Approval = JSON.parse(readFileSync(path, 'utf8'));
  if (value.approved !== true || !value.approvalId?.trim() || !value.chatModel?.trim() || !Number.isInteger(value.maxVideoCalls) || value.maxVideoCalls < 0 || value.maxVideoCalls > 2 || !Number.isInteger(value.maxTextCalls) || value.maxTextCalls < 0 || value.maxTextCalls > 2 || !Number.isFinite(value.maximumUsdEstimate) || value.maximumUsdEstimate <= 0 || value.maximumUsdEstimate > 2.1) throw denied();
  return value;
}
function read(path: string, id: string): Journal {
  if (!existsSync(path)) return { approvalId: id, attempts: [] };
  const value: Journal = JSON.parse(readFileSync(path, 'utf8'));
  if (value.approvalId !== id || !Array.isArray(value.attempts) || value.attempts.length > 4 || value.attempts.some(row => !['video', 'text'].includes(row.kind) || !['pending', 'received', 'rejected', 'unknown'].includes(row.state))) throw denied();
  return value;
}
function paths(file: string) { return { journal: join(dirname(file), 'spending.json'), lock: join(dirname(file), 'spending.lock') }; }
function allowed(scope: Approval, state: Journal, kind: Attempt['kind']) {
  const estimate = state.attempts.reduce((sum, item) => sum + (item.kind === 'video' ? 1 : 0.05), 0) + (kind === 'video' ? 1 : 0.05);
  return state.attempts.every(item => item.state === 'received') && state.attempts.filter(item => item.kind === kind).length < (kind === 'video' ? scope.maxVideoCalls : scope.maxTextCalls) && estimate <= scope.maximumUsdEstimate + 1e-9;
}
function save(path: string, value: Journal) {
  const text = JSON.stringify(value, null, 2) + '\n'; const temporary = `${path}.next`;
  writeFileSync(temporary, text, { flag: 'wx' }); if (readFileSync(temporary, 'utf8') !== text) throw denied();
  renameSync(temporary, path); if (readFileSync(path, 'utf8') !== text) throw denied();
}
export function pilotAllowance(file: string, kind: Attempt['kind']): boolean {
  try {
    const scope = approval(file); const files = paths(file); if (existsSync(files.lock)) return false;
    const state = read(files.journal, scope.approvalId);
    return allowed(scope, state, kind);
  } catch { return false; }
}
/** Local pilot only: serial paid POSTs, durable reservation before networking, stop on uncertain results. */
export function createPilotFetch(file: string, network: typeof fetch = fetch, paidCallsEnabled = true): typeof fetch {
  let sequence: Promise<unknown> = Promise.resolve();
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== 'https://api.atlascloud.ai' || url.search || url.hash || url.username || url.password) throw denied();
    const method = (init.method ?? 'GET').toUpperCase();
    if (method === 'GET' && /^\/api\/v1\/model\/prediction\/[^/]+$/.test(url.pathname)) return network(input, { ...init, redirect: 'error' });
    if (!paidCallsEnabled) throw denied();
    if (method !== 'POST' || typeof init.body !== 'string') throw denied();
    const payload = JSON.parse(init.body) as Record<string, unknown>;
    let kind: Attempt['kind']; const scope = approval(file);
    if (url.pathname === '/api/v1/model/generateVideo') {
      kind = 'video';
      if (![NATIVE_VIDEO_TEXT_MODEL, NATIVE_VIDEO_REFERENCE_MODEL].includes(String(payload.model)) || payload.duration !== 10 || payload.resolution !== '720p' || payload.ratio !== '9:16' || payload.generate_audio !== true || payload.bitrate_mode !== 'high') throw denied();
    } else if (url.pathname === '/v1/chat/completions' && payload.model === scope.chatModel && Number(payload.max_tokens) > 0 && Number(payload.max_tokens) <= 1000) kind = 'text';
    else throw denied();
    const operation = sequence.then(async () => {
      if (init.signal?.aborted || !pilotAllowance(file, kind)) throw denied();
      const files = paths(file); let lock: number;
      try { lock = openSync(files.lock, 'wx'); } catch { throw denied(); }
      try {
        const state = read(files.journal, scope.approvalId);
        // Recheck after the cross-process lock without calling the lock-aware public check.
        if (!allowed(scope, state, kind)) throw denied();
        const row: Attempt = { kind, hash: createHash('sha256').update(String(init.body)).digest('hex'), startedAt: new Date().toISOString(), state: 'pending' };
        state.attempts.push(row); save(files.journal, state);
        try {
          const response = await network(input, { ...init, redirect: 'error' });
          const body = await response.clone().json().catch(() => null) as { id?: unknown; data?: { id?: unknown } } | null;
          const id = body?.data?.id ?? body?.id;
          if (response.ok && typeof id === 'string' && id.trim() && id.length <= 500) { row.state = 'received'; row.providerId = id; }
          else row.state = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : 'unknown';
          save(files.journal, state); return response;
        } catch (error) { row.state = 'unknown'; save(files.journal, state); throw error; }
      } finally { closeSync(lock); unlinkSync(files.lock); }
    });
    sequence = operation.catch(() => undefined); return operation;
  }) as typeof fetch;
}
