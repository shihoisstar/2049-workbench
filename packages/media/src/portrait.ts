import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { imageSize } from 'image-size';
import { downloadVideo } from './download';
import { runMediaTool } from './render';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Validate/decode a single PNG using the existing bounded downloader and media executables. */
export async function readPortraitImage(source: string | Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'wb-portrait-'));
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.includes('wb-portrait-')) throw new Error('Temporary portrait path mismatch');
  try {
    const path = join(directory, 'source.png');
    if (typeof source === 'string') await downloadVideo(source, path, 0, AbortSignal.timeout(60000), MAX_IMAGE_BYTES);
    else { if (!source.length || source.length > MAX_IMAGE_BYTES) throw new Error('Image size rejected'); await writeFile(path, source); }
    const bytes = await readFile(path);
    if (bytes.length > MAX_IMAGE_BYTES || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG image required');
    const header = imageSize(bytes);
    if (header.type !== 'png' || !header.width || !header.height || header.width < 16 || header.height < 16 || header.width > 8192 || header.height > 8192) throw new Error('Portrait dimensions rejected');
    const info = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-max_pixels', '67108864', '-protocol_whitelist', 'file,pipe', '-f', 'png_pipe', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', 'source.png'], directory));
    const stream = info.streams?.[0];
    if (stream?.codec_name !== 'png' || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width < 16 || stream.height < 16 || stream.width > 8192 || stream.height > 8192) throw new Error('Portrait dimensions rejected');
    if (stream.width !== header.width || stream.height !== header.height) throw new Error('Portrait header mismatch');
    const decoded = await runMediaTool('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', '-max_pixels', '67108864', '-protocol_whitelist', 'file,pipe', '-threads', '1', '-f', 'png_pipe', '-i', 'source.png', '-frames:v', '1', '-progress', 'pipe:1', '-f', 'null', '-'], directory);
    if (!/^frame=1\r?$/m.test(decoded)) throw new Error('Portrait frame missing');
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), width: stream.width as number, height: stream.height as number };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
