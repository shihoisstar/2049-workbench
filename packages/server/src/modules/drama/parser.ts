import type { DramaDiagnostic, DramaParsedEpisode, DramaParseResult } from './public';

const episodeHeader = /^##\s*第\s*([0-9一二三四五六七八九十]+)\s*集(?:\s*[：:]\s*.+)?\s*$/;
const sceneHeader = /^\*\*场景\s*([0-9一二三四五六七八九十]+)\s*[：:]\s*(.+?)\*\*\s*$/;
const dialogue = /^(.{1,100}?)\s*[：:]\s*(.+)$/;
export function parseSpokenLine(line: string) {
  const spoken = dialogue.exec(line);
  if (!spoken) return null;
  const prefix = spoken[1].trim();
  const voiceOver = /[（(](?:OS|VO|画外音)[）)]$/i.test(prefix);
  const name = prefix.replace(/[（(](?:OS|VO|画外音)[）)]$/i, '').trim();
  return name ? { name, content: spoken[2], voiceOver } : null;
}
const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function ordinal(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  if (digits[value]) return digits[value];
  const parts = value.split('十');
  if (parts.length !== 2) return null;
  const tens = parts[0] ? digits[parts[0]] : 1;
  const ones = parts[1] ? digits[parts[1]] : 0;
  return tens && Number.isInteger(ones) ? tens * 10 + ones : null;
}

export function parseDramaScript(content: string): DramaParseResult {
  const diagnostics: DramaDiagnostic[] = [];
  const episodes: DramaParsedEpisode[] = [];
  const roles = new Set<string>();
  let current: DramaParsedEpisode | undefined;
  let scene: DramaParsedEpisode['scenes'][number] | undefined;
  let previousEpisode = 0;
  let previousScene = 0;
  let directionEnd: string | null = null;
  let directionLine = 0;
  for (const [index, line] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (directionEnd) {
      if (trimmed.endsWith(directionEnd)) directionEnd = null;
      continue;
    }
    const episodeMatch = episodeHeader.exec(line);
    if (episodeMatch) {
      const number = ordinal(episodeMatch[1]);
      if (!number) { diagnostics.push({ line: lineNumber, message: '集标题序号无效' }); continue; }
      if (number <= previousEpisode) diagnostics.push({ line: lineNumber, message: '集数必须递增' });
      previousEpisode = number;
      current = { number, scenes: [] };
      episodes.push(current);
      scene = undefined;
      previousScene = 0;
      continue;
    }
    if (line.startsWith('##')) { diagnostics.push({ line: lineNumber, message: '集标题格式无效' }); continue; }
    const sceneMatch = sceneHeader.exec(line);
    if (sceneMatch) {
      const number = ordinal(sceneMatch[1]);
      if (!number) { diagnostics.push({ line: lineNumber, message: '场景序号无效' }); continue; }
      if (!current) { diagnostics.push({ line: lineNumber, message: '场景必须位于集标题之后' }); continue; }
      if (number <= previousScene) diagnostics.push({ line: lineNumber, message: '场景序号必须递增' });
      previousScene = number;
      scene = { number, heading: sceneMatch[2].trim(), dialogueCount: 0 };
      current.scenes.push(scene);
      continue;
    }
    if (line.startsWith('**场景')) { diagnostics.push({ line: lineNumber, message: '场景标题格式无效' }); continue; }
    if (trimmed.startsWith('（') || trimmed.startsWith('(')) {
      const closing = trimmed.startsWith('（') ? '）' : ')';
      if (!trimmed.endsWith(closing)) { directionEnd = closing; directionLine = lineNumber; }
      continue;
    }
    const spoken = parseSpokenLine(line);
    if (spoken) {
      if (!scene) diagnostics.push({ line: lineNumber, message: '台词必须位于场景之后' });
      else { scene.dialogueCount++; roles.add(spoken.name); }
    }
  }
  if (episodes.length === 0) diagnostics.push({ line: 1, message: '缺少“## 第X集”标题' });
  if (directionEnd) diagnostics.push({ line: directionLine, message: '动作说明缺少右括号，请检查正文是否完整' });
  for (const episode of episodes) if (episode.scenes.length === 0) diagnostics.push({ line: 1, message: `第${episode.number}集缺少场景` });
  return { status: diagnostics.length ? 'needs_repair' : 'parsed', roles: [...roles], episodes, diagnostics };
}

/** Source blocks for an editable storyboard draft; no camera or cast inference. */
export function scriptSceneBlocks(content: string) {
  const scenes: { episodeNumber: number; sceneNumber: number; heading: string; sourceLine: number; blocks: { sourceLine: number; text: string }[] }[] = [];
  const unassigned: { sourceLine: number; text: string }[] = [];
  let episodeNumber = 0; let current: typeof scenes[number] | undefined; let closing: string | null = null;
  for (const [index, source] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = source.trim();
    if (closing && current) { current.blocks[current.blocks.length - 1].text += '\n' + source; if (line.endsWith(closing)) closing = null; continue; }
    const episode = episodeHeader.exec(source); if (episode) { episodeNumber = ordinal(episode[1])!; current = undefined; continue; }
    const scene = sceneHeader.exec(source);
    if (scene) { current = { episodeNumber, sceneNumber: ordinal(scene[1])!, heading: scene[2].trim(), sourceLine: index + 1, blocks: [] }; scenes.push(current); continue; }
    if (!line) continue;
    if (!current) { unassigned.push({ sourceLine: index + 1, text: source }); continue; }
    current.blocks.push({ sourceLine: index + 1, text: source });
    if (line.startsWith('（') || line.startsWith('(')) { const end = line.startsWith('（') ? '）' : ')'; if (!line.endsWith(end)) closing = end; }
  }
  return { scenes, unassigned };
}
