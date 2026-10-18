import { describe, expect, it } from 'vitest';
import { artifactHref, buildHash, parseHash } from '../src/lib/route';
import { EMPTY_SEARCH, buildIndex, editDistance, highlight, parseQuery, popularKeywords, runSearch, termMatch } from '../src/lib/search';
import { fixtureCatalog } from './helpers';

const catalog = fixtureCatalog();
const index = buildIndex(catalog.artifacts);
const find = (q: string, extra: Partial<typeof EMPTY_SEARCH> = {}) => runSearch(index, { ...EMPTY_SEARCH, q, ...extra });

describe('parseQuery', () => {
  it('drops stop words and filler', () => {
    expect(parseQuery('I need a skill for code review').terms).toEqual(['code', 'review']);
  });

  it('turns type words into soft hints, including plurals', () => {
    expect(parseQuery('agents for testing')).toEqual({ terms: ['testing'], typeHints: ['agent'] });
    expect(parseQuery('mcp servers').typeHints).toEqual(['mcp-server', 'mcp-server']);
  });

  it('strips punctuation and case', () => {
    expect(parseQuery('Code-Review!!!').terms).toEqual(['code', 'review']);
  });
});

describe('matching', () => {
  it('computes edit distance with transpositions', () => {
    expect(editDistance('reveiw', 'review')).toBe(1);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('ranks exact above prefix above fuzzy', () => {
    expect(termMatch('review', 'review')).toBe(1);
    expect(termMatch('rev', 'review')).toBe(0.6);
    expect(termMatch('reveiw', 'review')).toBe(0.4);
    expect(termMatch('xyz', 'review')).toBe(0);
  });

  it('does not fuzzy match short terms', () => {
    expect(termMatch('cod', 'cog')).toBe(0);
  });
});

describe('runSearch', () => {
  it('returns everything for an empty query, sorted by type then name', () => {
    const r = find('');
    expect(r.results).toHaveLength(9);
    expect(r.results.map((a) => a.type).slice(0, 4)).toEqual(['plugin', 'plugin', 'plugin', 'plugin']);
    expect(r.results.map((a) => a.name).slice(0, 4)).toEqual(['code-quality', 'github-tools', 'qa-toolkit', 'release-notes']);
  });

  it('puts the code-review skill first for "review code"', () => {
    expect(find('review code').results[0]?.id).toBe('code-quality/skill/code-review');
  });

  it('finds a misspelled word', () => {
    expect(find('reveiw').results[0]?.id).toBe('code-quality/skill/code-review');
  });

  it('boosts but does not filter by the type hint', () => {
    const r = find('agents for testing').results;
    expect(r[0]?.type).toBe('agent');
    expect(r.length).toBeGreaterThan(1);
    expect(r.some((a) => a.type !== 'agent')).toBe(true);
  });

  it('applies the hard type filter', () => {
    const r = find('', { type: ['skill'] }).results;
    expect(r.map((a) => a.id)).toEqual(['code-quality/skill/code-review']);
  });

  it('applies category and plugin filters', () => {
    expect(find('', { category: 'testing' }).results.every((a) => a.category === 'testing')).toBe(true);
    expect(find('', { plugin: 'github-tools' }).results).toHaveLength(2);
  });

  it('counts types without the type filter applied', () => {
    const r = find('', { type: ['skill'], plugin: 'code-quality' });
    expect(r.typeCounts).toMatchObject({ plugin: 1, skill: 1, command: 1, hook: 1, agent: 0, 'mcp-server': 0 });
  });

  it('returns nothing for gibberish', () => {
    expect(find('zzzzqqq').results).toEqual([]);
  });

  it('finds words that only occur in the body', () => {
    expect(find('prettier').results.map((a) => a.id)).toContain('code-quality');
  });
});

describe('highlight', () => {
  it('marks matching words including prefix and fuzzy matches', () => {
    expect(highlight('Code review for a diff', ['review'])).toEqual([
      { text: 'Code ', match: false },
      { text: 'review', match: true },
      { text: ' for a diff', match: false },
    ]);
    expect(highlight('review-pr', ['reveiw']).some((s) => s.match)).toBe(true);
  });

  it('returns a single plain segment without terms', () => {
    expect(highlight('plain text', [])).toEqual([{ text: 'plain text', match: false }]);
  });
});

describe('popularKeywords', () => {
  it('orders by frequency then alphabetically', () => {
    const k = popularKeywords(catalog.artifacts, 3);
    expect(k).toHaveLength(3);
    expect(new Set(k).size).toBe(3);
  });
});

describe('routing', () => {
  it('parses the search page and its state', () => {
    expect(parseHash('')).toEqual({ name: 'search', state: EMPTY_SEARCH });
    expect(parseHash('#/?q=review&type=skill,bogus&category=quality&plugin=code-quality')).toEqual({
      name: 'search',
      state: { q: 'review', type: ['skill'], category: 'quality', plugin: 'code-quality' },
    });
  });

  it('round-trips artifact ids', () => {
    const id = 'code-quality/skill/code-review';
    expect(artifactHref(id)).toBe('#/a/code-quality%2Fskill%2Fcode-review');
    expect(parseHash(artifactHref(id))).toEqual({ name: 'artifact', id });
  });

  it('tolerates a broken escape sequence', () => {
    expect(parseHash('#/a/%E0%A4%A')).toEqual({ name: 'artifact', id: '%E0%A4%A' });
  });

  it('reports unknown routes', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'notfound', path: '/nope' });
  });

  it('builds a compact hash', () => {
    expect(buildHash({})).toBe('#/');
    expect(buildHash({ q: 'a b', type: ['skill', 'agent'], category: 'x' })).toBe('#/?q=a+b&type=skill%2Cagent&category=x');
  });
});
