import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/miniapp/dist/studio/h5/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  let path;
  try {
    path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) throw new Error('outside static root');
  } catch { response.writeHead(400).end(); return; }
  // Only the public, read-only quote operation is proxied during UI integration.
  // Authenticated/paid operations are never forwarded by this preview server.
  if (request.url === '/v2/generation/quote' && request.method === 'POST') {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const upstream = await fetch('http://127.0.0.1:3011/v2/generation/quote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: Buffer.concat(chunks), signal: AbortSignal.timeout(5000),
      });
      response.writeHead(upstream.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(await upstream.text());
    } catch { response.writeHead(503, { 'content-type': 'application/json' }).end('{}'); }
    return;
  }
  if (!extname(path)) path = resolve(root, 'index.html');
  try {
    const data = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
server.listen(4175, '127.0.0.1', () => console.log('Studio preview: http://127.0.0.1:4175/#/pages/studio-preview/index'));
