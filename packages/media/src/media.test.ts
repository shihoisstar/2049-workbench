import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isPublicAddress, downloadVideo } from './download';
import { isObjectStoreKey, readOptionalObjectStoreConfig } from './object-store';
import { renderVideo, runMediaTool, AI_METADATA } from './render';
import { composeDramaExport } from './drama-export';

const S3_ENV = {
  S3_ENDPOINT: 'https://objects.example.com',
  S3_REGION: 'auto',
  S3_BUCKET: 'wb-dev',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
} as const;

test('optional object store config: all unset degrades to null, partial config throws, full config parses', () => {
  assert.equal(readOptionalObjectStoreConfig({}), null);
  assert.throws(() => readOptionalObjectStoreConfig({ S3_ENDPOINT: S3_ENV.S3_ENDPOINT }));
  assert.deepEqual(readOptionalObjectStoreConfig({ ...S3_ENV }), {
    endpoint: S3_ENV.S3_ENDPOINT, region: 'auto', bucket: 'wb-dev', accessKeyId: 'key', secretAccessKey: 'secret',
  });
});
test('shared composition preserves original audio, mixes a verified voice track and rejects clipping', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wb-media-test-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('wb-media-test-'));
  const font = process.env.MEDIA_FONT_FILE ?? (process.platform === 'win32' ? 'C:/Windows/Fonts/msyh.ttc' : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');
  try {
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=240x426:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'native.mp4'], directory);
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.9', '-c:a', 'pcm_s16le', 'voice.wav'], directory);
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-c:a', 'pcm_s16le', 'long.wav'], directory);
    const bytes = await readFile(join(directory, 'native.mp4')); const sha256 = createHash('sha256').update(bytes).digest('hex'); const voiceBytes = await readFile(join(directory, 'voice.wav'));
    const voice = { bytes: voiceBytes, sha256: createHash('sha256').update(voiceBytes).digest('hex') };
    const composed = await composeDramaExport([{ bytes, sha256, subtitle: '原音轨' }, { bytes, sha256, subtitle: '', voice, captions: [{ startMs: 0, endMs: 900, text: '配音测试' }] }], font);
    await writeFile(join(directory, 'composed.mp4'), composed.bytes);
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-i', 'composed.mp4', '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', 'audio.pcm'], directory);
    const pcm = await readFile(join(directory, 'audio.pcm'));
    for (const startSec of [0.1, 1.1]) { const start = Math.floor(startSec * 48000) * 2; let sum = 0; for (let offset = start; offset < start + 20000; offset += 2) sum += Math.abs(pcm.readInt16LE(offset)); assert.ok(sum / 10000 > 100, 'both input audio and supplied voice must remain audible'); }
    const longBytes = await readFile(join(directory, 'long.wav'));
    await assert.rejects(composeDramaExport([{ bytes, sha256, subtitle: '', voice: { bytes: longBytes, sha256: createHash('sha256').update(longBytes).digest('hex') } }], font), /duration/);
    await assert.rejects(composeDramaExport([{ bytes, sha256, subtitle: '', voice: { ...voice, sha256: 'a'.repeat(64) } }], font), /voice source/);
    const marketing = await renderVideo(join(directory, 'native.mp4'), { resolution: '480p', aspectRatio: '9:16', durationSec: 5, captionText: '走进咖啡馆。' }, font, false);
    assert.notEqual(marketing.sha256, composed.sha256); assert.ok(marketing.bytes.length > 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('object storage allows only owned video, material and candidate image keys', () => {
  const id = '00000000-0000-4000-8000-000000000000';
  const sha256 = 'a'.repeat(64);
  assert.equal(isObjectStoreKey(`jobs/${id}/${sha256}.mp4`), true);
  assert.equal(isObjectStoreKey(`materials/${id}/${sha256}.webp`), true);
  assert.equal(isObjectStoreKey(`drama-image-jobs/${id}/${sha256}.png`), true);
  assert.equal(isObjectStoreKey(`drama-shot-video-jobs/${id}/${sha256}.mp4`), true);
  assert.equal(isObjectStoreKey(`drama-export-jobs/${id}/${sha256}.mp4`), true);
  for (const key of [`drama-image-jobs/${id}/${sha256}.jpg`, `drama-image-jobs/${id}/not-a-hash.png`, `drama-image-jobs/${id}/${sha256}.png/extra`,
    `drama-shot-video-jobs/${id}/${sha256}.png`, `drama-shot-video-jobs/${id}/not-a-hash.mp4`, `drama-export-jobs/${id}/${sha256}.png`]) { 
    assert.equal(isObjectStoreKey(key), false);
  }
});

test('media downloader rejects loopback, private, mapped, link-local and non-HTTPS sources', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
  await assert.rejects(downloadVideo('http://example.com/video.mp4', 'unused.mp4'));
  await assert.rejects(downloadVideo('https://127.0.0.1/video.mp4', 'unused.mp4'));
  await assert.rejects(downloadVideo('https://name:password@example.com/video.mp4', 'unused.mp4'));
});

test('real FFmpeg adds AI metadata, returns a verified MP4 and rejects corrupt input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wb-media-test-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('wb-media-test-'));
  try {
    const font = process.env.MEDIA_FONT_FILE ?? (process.platform === 'win32' ? 'C:/Windows/Fonts/msyh.ttc' : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=0x445566:s=480x854:r=24:d=5', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', 'fixture.mp4'], directory);
    const result = await renderVideo(join(directory, 'fixture.mp4'), { resolution: '480p', aspectRatio: '9:16', durationSec: 5 }, font, false);
    assert.equal(result.width, 480);
    assert.equal(result.height, 854);
    assert.ok(result.durationMs >= 4900 && result.durationMs <= 5100);
    assert.equal(createHash('sha256').update(result.bytes).digest('hex'), result.sha256);
    await writeFile(join(directory, 'result.mp4'), result.bytes);
    const probe = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', 'result.mp4'], directory));
    assert.equal(probe.format.tags.comment, AI_METADATA);
    assert.notDeepEqual(result.bytes, await readFile(join(directory, 'fixture.mp4')));
    await writeFile(join(directory, 'bad.mp4'), 'not a video');
    await assert.rejects(renderVideo(join(directory, 'bad.mp4'), { resolution: '480p', aspectRatio: '9:16', durationSec: 5 }, font, false));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
