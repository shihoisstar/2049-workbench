import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { downloadVideo } from './download';
import { runMediaTool } from './render';
import type { SubtitleCue } from './subtitles';
export type NativeCue = SubtitleCue;
export interface NativeRecognition { sourceSha256: string; transcript: string; cues: NativeCue[] }
export async function readNativeVideo(source: Buffer | string) {
  const directory = await mkdtemp(join(tmpdir(), 'wb-native-source-'));
  try {
    const file = join(directory, 'source.mp4');
    if (typeof source === 'string') await downloadVideo(source, file, 0, AbortSignal.timeout(60000), 64 * 1024 * 1024);
    else { if (!source.length || source.length > 64 * 1024 * 1024) throw new Error('Native video size rejected'); await writeFile(file, source); }
    const bytes = await readFile(file); const metadata = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-f', 'mov', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', 'source.mp4'], directory));
    const video = metadata.streams?.find((s: { codec_type: string }) => s.codec_type === 'video'); const durationMs = Math.round(Number(metadata.format?.duration) * 1000);
    if (!video || video.codec_name !== 'h264' || !Number.isInteger(durationMs) || durationMs < 9700 || durationMs > 10300 || video.width < 720 || video.height < 720 || video.width > 4096 || video.height > 4096 || Math.abs(video.width / video.height / (9 / 16) - 1) > 0.08 || !metadata.streams.some((s: { codec_type: string; codec_name: string }) => s.codec_type === 'audio' && s.codec_name === 'aac')) throw new Error('Native video geometry, duration or audio rejected');
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), width: video.width as number, height: video.height as number, durationMs };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export function nativeCaptionDraft(raw: { text: string; segments: { words: { text: string; start: number; end: number }[] }[] }, durationMs: number): NativeCue[] {
  if (typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 12000 || !Array.isArray(raw.segments)) throw new Error('No usable transcript');
  const cues: NativeCue[] = []; let group: NativeCue | null = null; let previousEnd = 0;
  for (const word of raw.segments.flatMap(s => s.words)) {
    const startMs = Math.round(word.start * 1000), endMs = Math.round(word.end * 1000); const text = typeof word.text === 'string' ? word.text.trim() : '';
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < previousEnd || endMs <= startMs || endMs > durationMs || !text || text.includes('\u0000')) throw new Error('Unreliable word timing');
    if (group && (Array.from(group.text + text).length > 12 || startMs - group.endMs > 350)) { cues.push(group); group = null; }
    if (!group) group = { startMs, endMs, text }; else { group.endMs = endMs; group.text += text; } previousEnd = endMs;
    if (/[。！？!?]$/.test(text)) { cues.push(group); group = null; }
  }
  if (group) cues.push(group);
  const normalize = (text: string) => text.replace(/\s/g, '');
  if (!cues.length || cues.length > 80 || cues.some(c => c.text.length > 160) || normalize(cues.map(c => c.text).join('')) !== normalize(raw.text)) throw new Error('Caption draft does not preserve transcript');
  return cues;
}
export function createLocalNativeTranscriber(config: { python: string; script: string; modelDirectory: string }) {
  return async (source: Buffer, durationMs: number): Promise<NativeRecognition> => {
    const directory = await mkdtemp(join(tmpdir(), 'wb-native-asr-'));
    try {
      await writeFile(join(directory, 'source.mp4'), source);
      await runMediaTool('ffmpeg', ['-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-enable_drefs', '0', '-i', 'source.mp4', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', 'audio.wav'], directory);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(config.python, [config.script, '--model-dir', config.modelDirectory, '--input', join(directory, 'audio.wav'), '--output', join(directory, 'transcript.json')], { cwd: directory, windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', HF_HUB_DISABLE_TELEMETRY: '1' } });
        const timer = setTimeout(() => child.kill('SIGKILL'), 300000); child.stdout.resume(); child.stderr.resume();
        child.on('error', () => { clearTimeout(timer); reject(new Error('Local transcription process unavailable')); });
        child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Local transcription failed')); });
      });
      const raw = await readFile(join(directory, 'transcript.json')); if (raw.length > 1024 * 1024) throw new Error('Transcript too large'); const result = JSON.parse(raw.toString('utf8'));
      const audio = await readFile(join(directory, 'audio.wav')); if (result.sourceSha256 !== createHash('sha256').update(audio).digest('hex')) throw new Error('Transcription source mismatch');
      return { sourceSha256: createHash('sha256').update(source).digest('hex'), transcript: result.text, cues: nativeCaptionDraft(result, durationMs) };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
