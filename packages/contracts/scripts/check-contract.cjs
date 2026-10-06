const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { canonicalJson, contractSnapshot } = require('../dist/contract-document.js');
const { buildOpenApiDocument } = require('../dist/openapi.js');
const snapshotPath = join(__dirname, '..', 'contract-snapshot.json');

if (process.argv[2] === '--write') {
  writeFileSync(snapshotPath, contractSnapshot(), 'utf8');
  console.log('Full contract snapshot written; review schema changes before committing.');
} else {
  for (const [path, actual] of [
    [snapshotPath, contractSnapshot()],
    [join(__dirname, '..', 'openapi.json'), canonicalJson(buildOpenApiDocument())],
  ]) {
    let expected;
    try { expected = canonicalJson(JSON.parse(readFileSync(path, 'utf8'))); }
    catch { console.error(`Missing or invalid contract artifact: ${path}`); process.exit(1); }
    if (expected !== actual) {
      console.error(`Contract artifact drift: ${path}. Regenerate intentionally and review the diff.`);
      process.exit(1);
    }
  }
  console.log('Full schema snapshot and OpenAPI artifact match.');
}
