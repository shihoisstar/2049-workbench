import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { AI_METADATA, runMediaTool } from './render';
import { subtitleAss } from './subtitles';
import type { SubtitleCue } from './subtitles';

export type { SubtitleCue } from './subtitles';
export interface DramaExportSource { bytes: Buffer; sha256: string; subtitle: string; captions?: SubtitleCue[]; voice?: { bytes: Buffer; sha256: string } }
export interface DramaExportMedia { bytes: Buffer; sha256: string; width: number; height: number; durationMs: number }

async function probe(file: string, cwd: string) {
  const parsed = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-f', 'mov', '-show_entries',
    'format=duration:format_tags=comment:stream=codec_type,width,height', '-of', 'json', file], cwd));
  const video = parsed.streams?.find((stream: { codec_type: string }) => stream.codec_type === 'video');
  const durationMs = Math.round(Number(parsed.format?.duration) * 1000);
  if (!video || !Number.isInteger(durationMs) || durationMs < 500 || durationMs > 7200000 ||
      !Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width < 16 || video.height < 16 || video.width > 4096 || video.height > 4096) {
    throw new Error('Media dimensions or duration rejected');
  }
  return { width: video.width as number, height: video.height as number, durationMs, hasAudio: parsed.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'), comment: parsed.format.tags?.comment };
}

/** Sources are already owner-authorized and hash-verified by the caller before FFmpeg sees local files. */
export async function composeDramaExport(sources: DramaExportSource[], fontFile: string): Promise<DramaExportMedia> {
  if (sources.length === 0 || sources.length > 120) throw new Error('Invalid export source count');
  const directory = await mkdtemp(join(tmpdir(), 'wb-drama-export-'));
  const parent = resolve(tmpdir()) + sep;
  if (!resolve(directory).startsWith(parent) || !directory.includes('wb-drama-export-')) throw new Error('Temporary media path mismatch');
  try {
    const metadata = [] as { durationMs: number; width: number; height: number; hasAudio: boolean }[];
    const voiceInputs: { sourceIndex: number; inputIndex: number }[] = [];
    for (const [index, source] of sources.entries()) {
      if (!/^[a-f0-9]{64}$/.test(source.sha256) || createHash('sha256').update(source.bytes).digest('hex') !== source.sha256 ||
        source.bytes.length === 0 || source.bytes.length > 64 * 1024 * 1024 || source.subtitle.length > 1000 || source.subtitle.includes('\u0000')) {
        throw new Error('Invalid export source');
      }
      const file = `source-${index}.mp4`;
      await writeFile(join(directory, file), source.bytes);
      metadata.push(await probe(file, directory));
      if (source.voice) {
        if (source.voice.bytes.length === 0 || source.voice.bytes.length > 16 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(source.voice.sha256) || createHash('sha256').update(source.voice.bytes).digest('hex') !== source.voice.sha256) throw new Error('Invalid voice source');
        await writeFile(join(directory, `voice-${index}.wav`), source.voice.bytes);
        const audio = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-f', 'wav', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', `voice-${index}.wav`], directory));
        const voiceDurationMs = Math.round(Number(audio.format?.duration) * 1000);
        if (audio.streams?.length !== 1 || audio.streams[0].codec_type !== 'audio' || audio.streams[0].codec_name !== 'pcm_s16le' || !Number.isSafeInteger(voiceDurationMs) || voiceDurationMs < 1 || voiceDurationMs > metadata[index].durationMs + 30) throw new Error('Voice duration or format rejected');
        voiceInputs.push({ sourceIndex: index, inputIndex: sources.length + voiceInputs.length });
      }
    }
    const { width, height } = metadata[0];
    const durationMs = metadata.reduce((sum, source) => sum + source.durationMs, 0);
    if (durationMs > 7200000) throw new Error('Export duration rejected');
    const timeline: SubtitleCue[] = [];
    let offset = 0;
    for (const [index, source] of sources.entries()) {
      const cues = source.captions ?? (source.subtitle ? [{ startMs: 0, endMs: metadata[index].durationMs, text: source.subtitle }] : []);
      if (cues.length > 100) throw new Error('Too many subtitle cues');
      subtitleAss(cues, metadata[index].durationMs, { width, height });
      timeline.push(...cues.map(cue => ({ ...cue, startMs: offset + cue.startMs, endMs: offset + cue.endMs })));
      offset += metadata[index].durationMs;
    }
    await writeFile(join(directory, 'subtitles.ass'), subtitleAss(timeline, durationMs, { width, height }), 'utf8');
    await copyFile(fontFile, join(directory, 'font.ttf'));
    const inputs = sources.flatMap((_, index) => ['-f', 'mov', '-enable_drefs', '0', '-i', `source-${index}.mp4`]);
    inputs.push(...voiceInputs.flatMap(({ sourceIndex }) => ['-f', 'wav', '-i', `voice-${sourceIndex}.wav`]));
    const normalized = sources.map((_, index) => `[${index}:v]scale=${width}:${height},setsar=1[v${index}]`).join(';');
    const audio = sources.map((_, index) => {
      const voice = voiceInputs.find(item => item.sourceIndex === index); const input = voice ? `[${voice.inputIndex}:a]` : metadata[index].hasAudio ? `[${index}:a]` : 'anullsrc=r=48000:cl=stereo,';
      return `${input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${metadata[index].durationMs / 1000},asetpts=PTS-STARTPTS[a${index}]`;
    }).join(';');
    const concat = sources.map((_, index) => `[v${index}][a${index}]`).join('') + `concat=n=${sources.length}:v=1:a=1[concat][audio]`;
    await runMediaTool('ffmpeg', ['-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-threads', '1', ...inputs,
      '-filter_complex', `${normalized};${audio};${concat};[concat]subtitles=subtitles.ass,drawtext=fontfile=font.ttf:text=AI生成 · 2049出片:expansion=none:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=6:x=w-tw-12:y=12[out]`,
      '-map', '[out]', '-map', '[audio]', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', `comment=${AI_METADATA}`, '-movflags', '+faststart+use_metadata_tags', '-fs', String(64 * 1024 * 1024), 'output.mp4'], directory);
    const output = await probe('output.mp4', directory);
    if (output.comment !== AI_METADATA || Math.abs(output.durationMs - durationMs) > 300) throw new Error('Export output verification failed');
    const bytes = await readFile(join(directory, 'output.mp4'));
    if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) throw new Error('Export output size rejected');
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), width: output.width, height: output.height, durationMs: output.durationMs };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
