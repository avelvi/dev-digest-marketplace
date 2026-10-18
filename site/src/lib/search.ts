import { TYPE_ORDER, type Artifact, type ArtifactType } from '../types/catalog';

export interface SearchState {
  q: string;
  type: ArtifactType[];
  category: string;
  plugin: string;
}

export const EMPTY_SEARCH: SearchState = { q: '', type: [], category: '', plugin: '' };

type Field = 'name' | 'keywords' | 'description' | 'category' | 'plugin' | 'body';

const BOOST: Record<Field, number> = { name: 5, keywords: 4, description: 3, category: 2, plugin: 2, body: 1 };
const FIELDS = Object.keys(BOOST) as Field[];

const STOP = new Set(
  'i me my we our need needs want a an the for to how do does can could would should please find looking look something some that which with of and or in on at by is are be it this help use using'.split(
    ' ',
  ),
);

const TYPE_WORDS: Record<string, ArtifactType> = {
  skill: 'skill',
  skills: 'skill',
  agent: 'agent',
  agents: 'agent',
  plugin: 'plugin',
  plugins: 'plugin',
  hook: 'hook',
  hooks: 'hook',
  mcp: 'mcp-server',
  server: 'mcp-server',
  servers: 'mcp-server',
  command: 'command',
  commands: 'command',
};

const TYPE_BOOST = 1.5;

export const tokenize = (s: string | undefined): string[] =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

const plainText = (md: string) => md.replace(/```[\s\S]*?```/g, ' ').replace(/[#`*_>-]/g, ' ');

export interface IndexedArtifact {
  artifact: Artifact;
  fields: Record<Field, string[]>;
}

export function buildIndex(artifacts: readonly Artifact[]): IndexedArtifact[] {
  return artifacts.map((artifact) => ({
    artifact,
    fields: {
      name: tokenize(artifact.name),
      keywords: tokenize(artifact.keywords.join(' ')),
      description: tokenize(artifact.description),
      category: tokenize(artifact.category),
      plugin: tokenize(artifact.plugin),
      body: tokenize(plainText(artifact.bodyMarkdown)),
    },
  }));
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** 1 exact, 0.6 prefix, 0.4 fuzzy (about 20% of the term length), 0 no match. */
export function termMatch(term: string, word: string): number {
  if (word === term) return 1;
  if (term.length >= 2 && word.startsWith(term)) return 0.6;
  if (term.length >= 4) {
    const max = Math.max(1, Math.round(term.length * 0.2));
    if (Math.abs(term.length - word.length) <= max && editDistance(term, word) <= max) return 0.4;
  }
  return 0;
}

export interface ParsedQuery {
  terms: string[];
  typeHints: ArtifactType[];
}

export function parseQuery(q: string): ParsedQuery {
  const terms: string[] = [];
  const typeHints: ArtifactType[] = [];
  for (const word of tokenize(q)) {
    const hint = TYPE_WORDS[word];
    if (hint) typeHints.push(hint);
    else if (!STOP.has(word)) terms.push(word);
  }
  return { terms, typeHints };
}

export function scoreArtifact(entry: IndexedArtifact, terms: string[], typeHints: ArtifactType[]): number {
  let score = 0;
  for (const term of terms) {
    const perField = FIELDS.map((f) => Math.max(0, ...entry.fields[f].map((w) => termMatch(term, w))) * BOOST[f]);
    const max = Math.max(...perField);
    const sum = perField.reduce((x, y) => x + y, 0);
    if (max > 0) score += max + 0.1 * (sum - max);
  }
  if (score > 0 && typeHints.includes(entry.artifact.type)) score *= TYPE_BOOST;
  return score;
}

export const byTypeThenName = (a: Artifact, b: Artifact): number =>
  TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name);

export interface Segment {
  text: string;
  match: boolean;
}

/** Splits text into plain and matched runs for highlighting. */
export function highlight(text: string, terms: string[]): Segment[] {
  const out: Segment[] = [];
  for (const part of text.split(/([A-Za-z0-9]+)/)) {
    if (!part) continue;
    const match = terms.length > 0 && /^[A-Za-z0-9]+$/.test(part) && terms.some((t) => termMatch(t, part.toLowerCase()) > 0);
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += part;
    else out.push({ text: part, match });
  }
  return out;
}

export interface SearchResult {
  results: Artifact[];
  terms: string[];
  /** Counts per type with the category and plugin filters applied but not the type filter */
  typeCounts: Record<ArtifactType, number>;
}

export function runSearch(index: readonly IndexedArtifact[], state: SearchState): SearchResult {
  const { terms, typeHints } = parseQuery(state.q);
  const scored = index
    .map((entry) => ({ artifact: entry.artifact, score: terms.length ? scoreArtifact(entry, terms, typeHints) : 1 }))
    .filter((x) => x.score > 0);
  const base = scored.filter(
    (x) => (!state.category || x.artifact.category === state.category) && (!state.plugin || x.artifact.plugin === state.plugin),
  );
  const filtered = base.filter((x) => !state.type.length || state.type.includes(x.artifact.type));
  filtered.sort((x, y) => (terms.length ? y.score - x.score : 0) || byTypeThenName(x.artifact, y.artifact));

  const typeCounts = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0])) as Record<ArtifactType, number>;
  for (const x of base) typeCounts[x.artifact.type] += 1;
  return { results: filtered.map((x) => x.artifact), terms, typeCounts };
}

export function popularKeywords(artifacts: readonly Artifact[], limit = 6): string[] {
  const count = new Map<string, number>();
  for (const a of artifacts) for (const k of a.keywords) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.keys()].sort((x, y) => count.get(y)! - count.get(x)! || x.localeCompare(y)).slice(0, limit);
}
