import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { runMediaTool } from './render';
import { readPortraitImage } from './portrait';
import { isObjectStoreKey } from './object-store';
test('portrait decodes a real PNG, preserves original hash and rejects header-only or oversized images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wb-portrait-test-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('wb-portrait-test-'));
  try {
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=orange:s=768x1024', '-frames:v', '1', '-threads', '1', 'fixture.png'], directory);
    const bytes = await readFile(join(directory, 'fixture.png')); const result = await readPortraitImage(bytes);
    assert.equal(result.width, 768); assert.equal(result.height, 1024); assert.deepEqual(result.bytes, bytes);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(readPortraitImage(bytes.subarray(0, 33)));
    const huge = Buffer.from(bytes); huge.writeUInt32BE(100000, 16);
    await assert.rejects(readPortraitImage(huge), /dimensions/);
    await assert.rejects(readPortraitImage(Buffer.from('not PNG')));
    await assert.rejects(readPortraitImage(Buffer.alloc(10 * 1024 * 1024 + 1)), /size/);
    await assert.rejects(readPortraitImage('https://127.0.0.1/private.png'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('generated portrait references have isolated PNG object keys', () => {
  const id = '00000000-0000-4000-8000-000000000000'; const hash = 'a'.repeat(64);
  assert.equal(isObjectStoreKey(`materials/${id}/generated/${id}/${hash}.png`), true);
  assert.equal(isObjectStoreKey(`materials/${id}/generated/${id}/${hash}.jpg`), false);
  assert.equal(isObjectStoreKey(`materials/${id}/generated/../../${hash}.png`), false);
});
