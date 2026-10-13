import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { loadServerEnv } = require('../apps/api/dist/env.js');
const { atlasImageAdapter } = require('../packages/model-gateway/dist/index.js');

loadServerEnv();
if (!process.env.ATLAS_API_KEY) throw new Error('ATLAS_API_KEY is unavailable through the application configuration');

const overrideModel = process.env.ROLE_SPIKE_IMAGE_MODEL;
const channel = {
  id: 0,
  providerName: 'atlas',
  name: 'role-consistency-spike',
  baseUrl: process.env.ATLAS_BASE_URL ?? 'https://api.atlascloud.ai',
  secretRef: 'atlas-key',
  weight: 1,
  rpmLimit: null,
  status: 'active',
  health: 'ok',
  config: {
    modelImageT2i: process.env.ATLAS_MODEL_IMAGE_T2I ?? 'bytedance/seedream-v4.7/text-to-image',
    modelImageEdit: overrideModel ?? process.env.ATLAS_MODEL_IMAGE_EDIT ?? 'bytedance/seedream-v4.7/edit',
    ...(overrideModel?.includes('/reference-to-image') ? { imageReferenceField: 'images' } : {}),
  },
};
const context = { secret: process.env.ATLAS_API_KEY, fetchImpl: fetch, timeoutMs: 30_000 };

async function generate(request) {
  const startedAt = Date.now();
  const { providerTaskId } = await atlasImageAdapter.submitImage(context, channel, request);
  for (let attempt = 0; attempt < 45; attempt++) {
    const result = await atlasImageAdapter.pollImage(context, channel, providerTaskId);
    if (result.status === 'succeeded' && result.imageUrls?.[0]) {
      return { imageUrl: result.imageUrls[0], providerTaskId, elapsedMs: Date.now() - startedAt };
    }
    if (result.status === 'failed') throw new Error(`provider task failed: ${providerTaskId}`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`provider task timed out: ${providerTaskId}`);
}

const character = 'Original adult Chinese woman, 24 years old, long black hair, pale blue raincoat, small silver umbrella pin, calm observant expression, cinematic 2D animation, no text, no logos.';
const previous = process.env.ROLE_SPIKE_REFERENCE_FILE ? JSON.parse(await readFile(process.env.ROLE_SPIKE_REFERENCE_FILE, 'utf8')) : null;
const reference = previous?.reference ?? await generate({ modelName: 'role-spike', prompt: `Character reference portrait. ${character}`, aspectRatio: '9:16' });
const scenes = [
  'Rainy city street at night, walking beneath neon reflections.',
  'Warm old bookstore interior at night, examining a handwritten letter.',
  'Rainy city street at night, close-up while holding the same umbrella.',
  'Episode 2: dawn at a rain-soaked train station, carrying the same handwritten letter.',
];
const results = [];
const sceneLimit = Number(process.env.ROLE_SPIKE_SCENE_LIMIT ?? scenes.length);
const sceneOffset = Number(process.env.ROLE_SPIKE_SCENE_OFFSET ?? 0);
const validLimit = Number.isInteger(sceneLimit) && sceneLimit > 0 ? sceneLimit : scenes.length;
const validOffset = Number.isInteger(sceneOffset) && sceneOffset >= 0 ? sceneOffset : 0;
for (const scene of scenes.slice(validOffset, validOffset + validLimit)) {
  results.push(await generate({
    modelName: 'role-spike',
    prompt: `Use the supplied reference image. Preserve the same adult character identity, face, hair, raincoat, silver umbrella pin, and cinematic 2D animation style. Scene: ${scene} No text, no logos.`,
    imageUrls: [reference.imageUrl],
    aspectRatio: '9:16',
  }));
}
const submissions = results.length + (previous ? 0 : 1);
const outputPath = join(tmpdir(), `role-consistency-spike-${Date.now()}.json`);
await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  submissions,
  billing: 'Provider response does not include a cost; reconcile the four task IDs in the provider console.',
  reference,
  results,
}, null, 2));
console.log(JSON.stringify({ outputPath, submissions, elapsedMs: results.map(item => item.elapsedMs) }));
