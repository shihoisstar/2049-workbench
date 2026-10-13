import { parseSpokenLine } from './parser';
export function spokenLines(source: string) {
  return source.split(/\r?\n\s*\r?\n/).flatMap(block => /^[（(]/.test(block.trim()) ? [] : block.split(/\r?\n/).flatMap(line => {
    if (/^[（(]/.test(line.trim())) return [];
    const spoken = parseSpokenLine(line.trim()); if (!spoken) return [];
    const text = spoken.content.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
    return text ? [{ speaker: spoken.name, text, voiceOver: spoken.voiceOver }] : [];
  }));
}
