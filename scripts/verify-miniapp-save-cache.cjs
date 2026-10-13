// Run the actual save service with local storage/files and injected transport. No network or paid calls.
let assertions = 0;
const assert = new Proxy(require('node:assert/strict'), { get: (target, key) => typeof target[key] === 'function' ? (...args) => { assertions++; return target[key](...args); } : target[key] }); const fs = require('node:fs'); const path = require('node:path');
const { createRequire } = require('node:module'); const { Script } = require('node:vm');
const req = createRequire(path.resolve(__dirname, '../apps/miniapp/package.json')); const ts = req('typescript');
function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, '../apps/miniapp/src/services', relative);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInThisContext()(name => mocks[name] ?? req(name), module, module.exports);
  return module.exports;
}
const service = load('saved-media.ts');
const access = { assetId: 'asset-a', sha256: 'a'.repeat(64), byteLength: 10, url: 'https://fixture.invalid/a' };
async function main() {
  let rows = [], downloads = 0, saves = 0; const files = new Map();
  const io = { read: () => rows, write: value => { rows = value; }, info: async name => { assert.ok(files.has(name), 'file exists'); return files.get(name); },
    download: async () => { downloads++; files.set('temp', { size: 10, digest: 'original' }); return { statusCode: 200, tempFilePath: 'temp' }; },
    persist: async temp => { const name = 'saved-' + ++saves; files.set(name, { ...files.get(temp) }); return name; }, remove: async name => { files.delete(name); } };
  const first = await service.saveLocalMedia(access, io);
  assert.equal((await service.saveLocalMedia({ ...access, url: 'https://fixture.invalid/resigned' }, io)).filePath, first.filePath);
  assert.equal(downloads, 1); assert.equal(saves, 1);
  await service.saveLocalMedia({ ...access, assetId: 'asset-b' }, io); assert.equal(rows.length, 2);
  files.set(first.filePath, { size: 10, digest: 'corrupted' });
  const repaired = await service.saveLocalMedia(access, io); assert.notEqual(repaired.filePath, first.filePath);
  assert.equal((await service.saveLocalMedia(access, io)).filePath, repaired.filePath); assert.equal(downloads, 3);
  await service.saveLocalMedia({ ...access, sha256: 'b'.repeat(64) }, io); assert.equal(downloads, 4);
  await assert.rejects(service.saveLocalMedia({ ...access, assetId: 'bad' }, { ...io, download: async () => ({ statusCode: 403 }) }), e => e.stage === 'download');
  await assert.rejects(service.saveLocalMedia({ ...access, assetId: 'bad' }, { ...io, info: async () => ({ size: 9, digest: 'wrong' }) }), e => e.stage === 'verify');
  const quota = new service.VideoSaveError('storage', { errMsg: 'saveFile:fail the maximum size of the file storage limit is exceeded' });
  assert.match(service.videoSaveMessage(quota), /空间不足/); assert.doesNotMatch(service.videoSaveMessage(quota), /相册权限/);
  assert.match(service.videoSaveMessage(new service.VideoSaveError('album', { errMsg: 'auth deny' })), /相册权限/);
  const storage = new Map();
  const taro = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), getFileSystemManager: () => ({}) };
  const adapter = load('taro-video-save.ts', { '@tarojs/taro': taro });
  adapter.savedMediaIO('owner-a').write(rows); assert.equal(adapter.savedMediaIO('owner-b').read().length, 0);
  files.set('unknown-legacy', { size: 10, digest: 'legacy' });
  assert.equal(await service.clearSavedMedia(io), 0); assert.equal(rows.length, 0); assert.ok(files.has('unknown-legacy'));
  rows = [{ filePath: 'locked' }]; assert.equal(await service.clearSavedMedia({ ...io, remove: async () => { throw new Error('locked'); } }), 1);
  console.log(`Save cache: ${assertions} assertions; repeat/version/account/corruption/errors/scoped cleanup; paid calls 0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
