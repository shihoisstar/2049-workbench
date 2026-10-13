import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { loadServerEnv } = require('../apps/api/dist/env.js');

loadServerEnv();
if (!process.env.ATLAS_API_KEY) throw new Error('ATLAS_API_KEY is unavailable through the application configuration');
const source = process.env.ROLE_SPIKE_REFERENCE_FILE;
if (!source) throw new Error('ROLE_SPIKE_REFERENCE_FILE is required');
const reference = JSON.parse(await readFile(source, 'utf8')).reference;
const response = await fetch(`${process.env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai'}/v1/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.ATLAS_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'bytedance/doubao-seed-character-260628',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Using this reference image, generate the same original adult woman with the same face, long black hair, pale blue raincoat, and silver umbrella pin in a warm old bookstore at night. Cinematic 2D animation. No text, no logos.' },
      { type: 'image_url', image_url: { url: reference.imageUrl } },
    ] }],
    max_tokens: 1024,
    temperature: 0.2,
    stream: false,
  }),
});
const payload = await response.json().catch(() => ({}));
const outputPath = join(tmpdir(), `role-consistency-chat-spike-${Date.now()}.json`);
await writeFile(outputPath, JSON.stringify({ status: response.status, payload }, null, 2));
const choices = Array.isArray(payload.choices) ? payload.choices : [];
const content = choices[0]?.message?.content;
console.log(JSON.stringify({ outputPath, status: response.status, responseKeys: Object.keys(payload), contentType: Array.isArray(content) ? 'array' : typeof content }));
if (!response.ok) process.exit(1);
