import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isPublicAddress, downloadVideo } from './download';
import { renderVideo, runMediaTool, AI_METADATA } from './render';

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
