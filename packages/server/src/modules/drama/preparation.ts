import type { DramaPreparationValue } from '@wb/contracts';
import { parseDramaScript, parseSpokenLine } from './parser';

export function derivePreparation(content: string): Pick<DramaPreparationValue, 'roles' | 'scenes'> {
  const parsed = parseDramaScript(content);
  const speakers = new Map<string, { visible: boolean; evidence: string[] }>();
  let directionEnd: string | null = null;
  for (const source of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = source.trim();
    if (directionEnd) { if (line.endsWith(directionEnd)) directionEnd = null; continue; }
    if (line.startsWith('（') || line.startsWith('(')) {
      const closing = line.startsWith('（') ? '）' : ')';
      if (!line.endsWith(closing)) directionEnd = closing;
      continue;
    }
    if (line.startsWith('##') || line.startsWith('**场景')) continue;
    const spoken = parseSpokenLine(source);
    if (!spoken || !parsed.roles.includes(spoken.name)) continue;
    const entry = speakers.get(spoken.name) ?? { visible: false, evidence: [] };
    entry.visible ||= !spoken.voiceOver;
    if (entry.evidence.length < 2) entry.evidence.push(line.slice(0, 180));
    speakers.set(spoken.name, entry);
  }
  return {
    roles: [...speakers].map(([name, entry], index) => ({ key: `speaker-${index}`, name,
      usage: !entry.visible || /^(旁白|画外音|广播(?:声)?|系统(?:音|提示音)|解说|报幕)$/.test(name) ? 'voice_only' : 'visual', description: '', referenceMaterialId: null, selection: null, evidence: entry.evidence })),
    scenes: parsed.episodes.flatMap(episode => episode.scenes.map(scene => ({ key: `${episode.number}:${scene.number}`, episodeNumber: episode.number, sceneNumber: scene.number, heading: scene.heading, description: '' }))),
  };
}
