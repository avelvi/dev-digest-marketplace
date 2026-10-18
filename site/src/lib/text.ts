export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface InlineSegment {
  text: string;
  code: boolean;
}

/** Splits text on `backtick` spans. */
export function splitInlineCode(text: string): InlineSegment[] {
  return text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((p) => (p.length > 1 && p.startsWith('`') && p.endsWith('`') ? { text: p.slice(1, -1), code: true } : { text: p, code: false }));
}
