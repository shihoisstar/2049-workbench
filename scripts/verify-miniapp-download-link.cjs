const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict'); const { createRequire } = require('node:module'); const { Script } = require('node:vm');
const req = createRequire(path.resolve(__dirname, '../apps/miniapp/package.json')); const ts = req('typescript');
const file = path.resolve(__dirname, '../apps/miniapp/src/services/download-link.ts'); const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleObject = { exports: {} }; new Script(`(function(module,exports){${compiled}\n})`, { filename: file }).runInThisContext()(moduleObject, moduleObject.exports);
(async () => {
  const url = 'https://fixture.invalid/temporary-video'; const copy = moduleObject.exports.copyDownloadLink;
  assert.equal(await copy(url, undefined), false);
  let passed; let complete; let settled = false;
  const result = copy(url, { writeText: value => { passed = value; return new Promise(done => { complete = done; }); } }).then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(passed, url); assert.equal(settled, false); complete(); assert.equal(await result, true);
  assert.equal(await copy(url, { writeText: async () => { throw new Error('Clipboard permission denied'); } }), false);
  console.log('Download link: 5 assertions; unavailable/denied clipboard never claims success; async copy waits for completion; no network');
})().catch(error => { console.error(error); process.exitCode = 1; });
