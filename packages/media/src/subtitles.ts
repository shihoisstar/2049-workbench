export interface SubtitleCue { startMs: number; endMs: number; text: string }
const assTime = (ms: number) => { const total = Math.floor(ms / 10); return `${Math.floor(total / 360000)}:${String(Math.floor(total / 6000) % 60).padStart(2, '0')}:${String(Math.floor(total / 100) % 60).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`; };
export function subtitleAss(cues: SubtitleCue[], durationMs: number, frame: { width: number; height: number }) {
  if (cues.length > 1000 || !Number.isSafeInteger(durationMs) || durationMs < 1) throw new Error('Invalid subtitle timeline');
  if (![frame.width, frame.height].every(value => Number.isSafeInteger(value) && value >= 16 && value <= 4096)) throw new Error('Invalid subtitle frame');
  const fontSize = Math.max(1, Math.round(Math.min(frame.width, frame.height) * 0.047)); const margin = Math.round(frame.width * 0.06);
  const lines = ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${frame.width}`, `PlayResY: ${frame.height}`, 'WrapStyle: 0', '[V4+ Styles]', 'Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV', `Style: Default,Arial,${fontSize},&H00FFFFFF,&H00000000,1,2,0,2,${margin},${margin},${Math.round(frame.height * 0.09)}`, '[Events]', 'Format: Layer,Start,End,Style,Text'];
  let priorEnd = 0;
  for (const cue of cues) {
    if (!Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs < priorEnd || cue.endMs <= cue.startMs || cue.endMs > durationMs || !cue.text.trim() || cue.text.length > 1000 || cue.text.includes('\u0000')) throw new Error('Subtitle timing rejected');
    lines.push(`Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,${cue.text.replaceAll('\\', '＼').replaceAll('{', '（').replaceAll('}', '）').replaceAll('\n', '\\N')}`);
    priorEnd = cue.endMs;
  }
  return lines.join('\n');
}
