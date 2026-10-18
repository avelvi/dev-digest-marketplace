import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CatalogError,
  buildCatalog,
  describeExternalSource,
  parseMarkdown,
  parseRepoSlug,
  resolveInside,
  rewriteRelativeLinks,
  sanitizeUrl,
  stableStringify,
} from '../scripts/lib/catalog';
import { FIXTURES, TEST_CONFIG, fixtureCatalog } from './helpers';

describe('buildCatalog (full fixture)', () => {
  const catalog = fixtureCatalog();
  const ids = catalog.artifacts.map((a) => a.id);

  it('emits one artifact per plugin, skill, agent, command, hook and MCP server', () => {
    expect(ids).toEqual([
      'code-quality',
      'code-quality/command/review-pr',
      'code-quality/hook/PostToolUse',
      'code-quality/skill/code-review',
      'github-tools',
      'github-tools/mcp-server/github',
      'qa-toolkit',
      'qa-toolkit/agent/test-writer',
      'release-notes',
    ]);
    expect(catalog.plugins).toEqual(['code-quality', 'github-tools', 'qa-toolkit', 'release-notes']);
  });

  it('takes marketplace info from marketplace.json and config', () => {
    expect(catalog.marketplace).toMatchObject({
      name: 'dev-digest-marketplace',
      ownerName: 'Dev Digest',
      repoSlug: 'acme/market',
      repoUrl: 'https://github.com/acme/market',
      defaultBranch: 'main',
    });
    expect(catalog.installNote).toContain('private');
  });

  it('copies plugin metadata to children and counts them', () => {
    const skill = catalog.artifacts.find((a) => a.id === 'code-quality/skill/code-review')!;
    expect(skill).toMatchObject({ plugin: 'code-quality', version: '1.2.0', license: 'MIT', category: 'quality' });
    expect(skill.keywords).toContain('pull request');
    const plugin = catalog.artifacts.find((a) => a.id === 'code-quality')!;
    expect(plugin.type === 'plugin' && plugin.details.counts).toEqual({ skill: 1, command: 1, hook: 1 });
  });

  it('reads dependencies given as names or {name, version} objects', () => {
    const qa = catalog.artifacts.find((a) => a.id === 'qa-toolkit')!;
    expect(qa.type === 'plugin' && qa.details.dependencies).toEqual(['code-quality (^1.0.0)', 'github-tools']);
  });

  it('keeps frontmatter fields as details without name and description', () => {
    const skill = catalog.artifacts.find((a) => a.type === 'skill')!;
    expect(skill.details).toEqual({ 'allowed-tools': 'Read, Grep, Glob, Bash(git diff:*)', 'argument-hint': '[branch | PR number]' });
    expect(skill.bodyMarkdown.startsWith('## When to use')).toBe(true);
  });

  it('extracts hooks and MCP servers', () => {
    const hook = catalog.artifacts.find((a) => a.type === 'hook')!;
    expect(hook.details).toEqual({ event: 'PostToolUse', matcher: 'Edit|Write', hookType: 'command', command: 'npx prettier --write "$CLAUDE_FILE_PATHS"' });
    const mcp = catalog.artifacts.find((a) => a.type === 'mcp-server')!;
    expect(mcp.details).toEqual({
      server: 'github',
      transport: 'stdio',
      command: 'npx -y @modelcontextprotocol/server-github',
      env: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    });
  });

  it('never publishes environment values', () => {
    expect(JSON.stringify(catalog)).not.toContain('ghp_fixture_secret_value');
  });

  it('leaves hidden plugins out completely', () => {
    expect(JSON.stringify(catalog)).not.toContain('internal-tools');
    expect(JSON.stringify(catalog)).not.toContain('secret-skill');
  });

  it('represents an external plugin from its marketplace entry only', () => {
    const ext = catalog.artifacts.find((a) => a.id === 'release-notes')!;
    expect(ext.type === 'plugin' && ext.details).toMatchObject({
      external: true,
      source: 'github: acme-tools/release-notes',
      sourceUrl: 'https://github.com/acme-tools/release-notes',
    });
    expect(ext.bodyMarkdown).toBe('');
  });

  it('rewrites relative links and images in README bodies', () => {
    const body = catalog.artifacts.find((a) => a.id === 'code-quality')!.bodyMarkdown;
    expect(body).toContain('(https://github.com/acme/market/blob/main/plugins/code-quality/hooks/hooks.json)');
    expect(body).toContain('(https://github.com/acme/market/blob/main/CONTRIBUTING.md)');
    expect(body).toContain('(https://raw.githubusercontent.com/acme/market/main/plugins/code-quality/docs/diagram.png)');
  });

  it('is deterministic', () => {
    expect(stableStringify(fixtureCatalog())).toBe(stableStringify(fixtureCatalog()));
  });
});

describe('buildCatalog (edge cases)', () => {
  it('builds an empty catalog from an empty marketplace', () => {
    const c = fixtureCatalog('empty');
    expect(c.artifacts).toEqual([]);
    expect(c.plugins).toEqual([]);
  });

  it('fails on a malformed SKILL.md and names the file', () => {
    expect(() =>
      buildCatalog({ root: resolve(FIXTURES, 'malformed'), config: TEST_CONFIG, warn: () => {} }),
    ).toThrowError(/plugins\/broken\/skills\/bad\/SKILL\.md: malformed front matter/);
  });

  it('fails on duplicate artifact ids', () => {
    const root = mkdtempSync(join(tmpdir(), 'catalog-dup-'));
    try {
      mkdirSync(join(root, '.claude-plugin'));
      writeFileSync(
        join(root, '.claude-plugin/marketplace.json'),
        JSON.stringify({ name: 'm', plugins: [{ name: 'a', source: './a' }, { name: 'a', source: './b' }] }),
      );
      mkdirSync(join(root, 'a'));
      mkdirSync(join(root, 'b'));
      expect(() => buildCatalog({ root, config: TEST_CONFIG, warn: () => {} })).toThrowError(CatalogError);
      expect(() => buildCatalog({ root, config: TEST_CONFIG, warn: () => {} })).toThrowError(/duplicate artifact id "a"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a source that escapes the repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'catalog-escape-'));
    try {
      mkdirSync(join(root, '.claude-plugin'));
      writeFileSync(join(root, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'm', plugins: [{ name: 'a', source: '../outside' }] }));
      expect(() => buildCatalog({ root, config: TEST_CONFIG, warn: () => {} })).toThrowError(/not a directory inside the repository/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not warn about hidden plugins', () => {
    const warnings: string[] = [];
    buildCatalog({ root: resolve(FIXTURES, 'full'), config: TEST_CONFIG, warn: (m) => warnings.push(m) });
    expect(warnings).toEqual([]);
  });
});

describe('helpers', () => {
  it('refuses executable front matter', () => {
    expect(() => parseMarkdown('---js\n({ name: "x" })\n---\nbody', 'x.md')).toThrowError(/x\.md: malformed front matter/);
  });

  it('accepts unquoted values with colons, like Claude Code does', () => {
    const md = '---\nname: a\ndescription: Use when asked to "research": anything, e.g. this\ntools: Read, Grep\n---\nbody';
    expect(parseMarkdown(md, 'x.md').data).toEqual({
      name: 'a',
      description: 'Use when asked to "research": anything, e.g. this',
      tools: 'Read, Grep',
    });
  });

  it('still rejects genuinely broken front matter', () => {
    expect(() => parseMarkdown('---\nname: a\ndescription: "unterminated\n---\nbody', 'x.md')).toThrowError(/x\.md: malformed front matter/);
  });

  it('parses regular front matter', () => {
    expect(parseMarkdown('---\nname: a\n---\n\nbody\n', 'x.md')).toEqual({ data: { name: 'a' }, content: 'body' });
  });

  it('resolveInside rejects paths that escape the directory', () => {
    expect(resolveInside('/a/b', 'c/d')).toBe('/a/b/c/d');
    expect(resolveInside('/a/b', '../x')).toBeNull();
    expect(resolveInside('/a/b', '../b-evil')).toBeNull();
  });

  it('parses GitHub remotes', () => {
    expect(parseRepoSlug('git@github.com:owner/repo.git\n')).toBe('owner/repo');
    expect(parseRepoSlug('https://github.com/owner/repo')).toBe('owner/repo');
    expect(parseRepoSlug('https://example.com/owner/repo')).toBeUndefined();
  });

  it('strips credentials and query strings from URLs', () => {
    expect(sanitizeUrl('https://user:pw@example.com/mcp?token=abc#x')).toBe('https://example.com/mcp');
  });

  it('describes external sources', () => {
    expect(describeExternalSource({ source: 'npm', package: '@acme/tool' })).toEqual({
      source: 'npm: @acme/tool',
      sourceUrl: 'https://www.npmjs.com/package/@acme/tool',
    });
    expect(describeExternalSource({ source: 'git-subdir', url: 'https://github.com/acme/mono.git', path: 'tools/x' })).toEqual({
      source: 'git-subdir: https://github.com/acme/mono.git (tools/x)',
      sourceUrl: 'https://github.com/acme/mono',
    });
  });
});

describe('rewriteRelativeLinks', () => {
  const o = { repoSlug: 'o/r', branch: 'main', fileDir: 'plugins/p', isDir: (p: string) => p === 'plugins/p/docs' };

  it('rewrites links, directories, images and reference definitions', () => {
    const md = ['[a](./a.md#top)', '[d](docs)', '![i](img/x.png "t")', '[ref]: ../q.md'].join('\n');
    expect(rewriteRelativeLinks(md, o)).toBe(
      [
        '[a](https://github.com/o/r/blob/main/plugins/p/a.md#top)',
        '[d](https://github.com/o/r/tree/main/plugins/p/docs)',
        '![i](https://raw.githubusercontent.com/o/r/main/plugins/p/img/x.png "t")',
        '[ref]: https://github.com/o/r/blob/main/plugins/q.md',
      ].join('\n'),
    );
  });

  it('leaves absolute URLs, anchors and mailto alone', () => {
    const md = '[a](https://x.dev/a) [b](#b) [c](mailto:a@b.c) [d](//cdn/x)';
    expect(rewriteRelativeLinks(md, o)).toBe(md);
  });

  it('does not touch fenced code or inline code', () => {
    const md = '```\n[a](./a.md)\n```\n`[b](./b.md)` and [c](./c.md)';
    expect(rewriteRelativeLinks(md, o)).toBe('```\n[a](./a.md)\n```\n`[b](./b.md)` and [c](https://github.com/o/r/blob/main/plugins/p/c.md)');
  });

  it('keeps links that escape the repository unchanged', () => {
    expect(rewriteRelativeLinks('[x](../../../../etc/passwd)', o)).toBe('[x](../../../../etc/passwd)');
  });
});
