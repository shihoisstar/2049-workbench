import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/generate-api-client.mjs [--check]');
}
const schema = new URL('../packages/contracts/openapi.json', import.meta.url);
const output = new URL('../packages/api-client/src/generated/schema.ts', import.meta.url);
const generated = '// Generated from @wb/contracts OpenAPI. Do not edit.\n' + astToString(await openapiTS(schema));
if (args[0] === '--check') {
  const existing = await readFile(output, 'utf8').catch(() => '');
  if (existing.replace(/\r\n/g, '\n') !== generated) {
    console.error('Generated API client drift. Run pnpm client:generate and review the contract diff.');
    process.exitCode = 1;
  } else console.log('Generated API client matches OpenAPI.');
} else {
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, generated, 'utf8');
  console.log(`Generated ${fileURLToPath(output)}`);
}
