import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ipaddr from 'ipaddr.js';

export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export async function downloadVideo(source: string, target: string, redirects = 0, signal = AbortSignal.timeout(60000)): Promise<void> {
  signal.throwIfAborted();
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || source.length > 8000) throw new Error('Invalid media source');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Non-public media source rejected');
  const chosen = addresses.find(item => item.family === 4) ?? addresses[0];
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const req = request(url, { method: 'GET', family: chosen.family, signal, rejectUnauthorized: true,
      lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
    }, resolve);
    req.on('error', () => reject(new Error('Media download failed')));
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
    const location = response.headers.location;
    response.destroy();
    if (!location || redirects >= 3) throw new Error('Media redirect limit exceeded');
    return downloadVideo(new URL(location, url).href, target, redirects + 1, signal);
  }
  if (response.statusCode !== 200 || Number(response.headers['content-length'] ?? 0) > MAX_MEDIA_BYTES) {
    response.destroy(); throw new Error('Media response rejected');
  }
  let size = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    callback(size > MAX_MEDIA_BYTES ? new Error('Media size limit exceeded') : null, chunk);
  } });
  await pipeline(response, limit, createWriteStream(target, { flags: 'wx' }), { signal });
  if (size === 0) throw new Error('Empty media response');
}
