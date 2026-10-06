const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { renderVideo, createObjectStore } = require('../packages/media/dist');
async function main() {
  const state = JSON.parse(readFileSync(resolve(__dirname, '../.local/video-acceptance/state.json'), 'utf8'));
  const directory = mkdtempSync(join(tmpdir(), 'wb-storage-proof-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  const store = createObjectStore(state.objectStore);
  let objectKey;
  try {
    const made = spawnSync('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=0x665544:s=480x854:r=24:d=5', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', 'fixture.mp4'], { cwd: directory, windowsHide: true, stdio: 'ignore' });
    assert.equal(made.status, 0);
    const media = await renderVideo(join(directory, 'fixture.mp4'), { resolution: '480p', aspectRatio: '9:16', durationSec: 5 }, 'C:/Windows/Fonts/msyh.ttc', false);
    objectKey = `jobs/${randomUUID()}/${media.sha256}.mp4`;
    await store.put(objectKey, media.bytes, media.sha256);
    const anonymous = await fetch(`${state.objectStore.endpoint}/${state.objectStore.bucket}/${objectKey}`);
    assert.ok([401, 403].includes(anonymous.status));
    const signed = await store.access(objectKey, 30);
    const full = await fetch(signed);
    assert.equal(full.status, 200);
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), media.sha256);
    const range = await fetch(signed, { headers: { range: 'bytes=0-31' } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), media.bytes.subarray(0, 32));
    const short = await store.access(objectKey, 1);
    assert.equal((await fetch(short)).status, 200);
    await delay(2200);
    const expired = await fetch(short);
    assert.ok(expired.status >= 400 && expired.status < 500);
    assert.match(await expired.text(), /expired|too old/i);
    const report = { fixtureOnly: true, paidProviderCalls: 0, anonymousStatus: anonymous.status, signedStatus: full.status,
      rangeStatus: range.status, expiredStatus: expired.status, sha256: media.sha256, byteLength: bytes.length, result: 'passed' };
    const evidence = resolve(__dirname, '../docs/验收留档/VIDEO-2026-10-06');
    mkdirSync(evidence, { recursive: true });
    const path = join(evidence, 'storage-proof.json');
    const json = JSON.stringify(report, null, 2);
    writeFileSync(path, json); assert.equal(readFileSync(path, 'utf8'), json);
    console.log(JSON.stringify(report));
  } finally {
    if (objectKey) await store.remove(objectKey);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
