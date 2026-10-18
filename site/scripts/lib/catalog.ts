import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
import { basename, join, posix, resolve, sep } from 'node:path';
import matter from 'gray-matter';
import {
  SCHEMA_VERSION,
  type Artifact,
  type Catalog,
  type ChildType,
  type FrontmatterDetails,
  type HookDetails,
  type McpServerDetails,
} from '../../src/types/catalog';

export class CatalogError extends Error {}

export interface SiteConfig {
  installNote?: string;
  defaultBranch?: string;
  repoSlug?: string;
}

export interface BuildOptions {
  /** Marketplace root (the directory that contains `.claude-plugin/marketplace.json`) */
  root: string;
  config: SiteConfig;
  generatedAt?: string;
  /** Receives non-fatal problems; defaults to console.warn */
  warn?: (message: string) => void;
}

type Json = Record<string, unknown>;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TREE_LIMIT = 300;
const TREE_SKIP = new Set(['.git', 'node_modules', '.DS_Store']);

const asRecord = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
const asString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asStringList = (v: unknown): string[] => {
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((s) => s.trim()) : [];
};
/** Dependencies are plain names or `{ name, version }` objects. */
const asDependencies = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).flatMap((d) => {
    const name = asString(d) ?? asString(asRecord(d)?.name);
    const version = asString(asRecord(d)?.version);
    return name ? [version ? `${name} (${version})` : name] : [];
  });
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const unique = (list: string[]) => [...new Set(list)];
const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// ---------------------------------------------------------------- files

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Resolves `rel` inside `dir`; returns null when it escapes `dir`. */
export function resolveInside(dir: string, rel: string): string | null {
  const full = resolve(dir, rel);
  return full === dir || full.startsWith(dir + sep) ? full : null;
}

function readJson(path: string, label: string): Json {
  try {
    const value = asRecord(JSON.parse(readFileSync(path, 'utf8')));
    if (!value) throw new Error('expected a JSON object');
    return value;
  } catch (e) {
    throw new CatalogError(`${label}: invalid JSON (${(e as Error).message})`);
  }
}

function sortedDirents(dir: string): Dirent[] {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name));
}

// Front matter in `---js` blocks would be executed by gray-matter; refuse it.
const refuse = () => {
  throw new Error('executable front matter is not allowed');
};
const MATTER_OPTIONS = { engines: { js: refuse, javascript: refuse, coffee: refuse } };

/**
 * Claude Code accepts unquoted values that strict YAML rejects (for example a description
 * containing ": "). When strict parsing fails, quote simple top-level values and retry.
 */
function quoteLooseValues(source: string): string {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!block?.[1]) return source;
  const fixed = block[1]
    .split(/\r?\n/)
    .map((line) => {
      const kv = /^([A-Za-z0-9_-]+):[ \t]+(.+?)[ \t]*$/.exec(line);
      if (!kv || /^["'[{|>&*!%@`]/.test(kv[2]!)) return line;
      return `${kv[1]}: ${JSON.stringify(kv[2])}`;
    })
    .join('\n');
  return source.replace(block[1], () => fixed);
}

export function parseMarkdown(source: string, label: string): { data: Json; content: string } {
  const parse = (text: string) => {
    const parsed = matter(text, MATTER_OPTIONS as never);
    return { data: asRecord(parsed.data) ?? {}, content: parsed.content.trim() };
  };
  try {
    return parse(source);
  } catch (strictError) {
    try {
      return parse(quoteLooseValues(source));
    } catch {
      throw new CatalogError(`${label}: malformed front matter (${(strictError as Error).message.split('\n')[0]})`);
    }
  }
}

function readMarkdown(root: string, repoPath: string): { data: Json; content: string } {
  return parseMarkdown(readFileSync(join(root, repoPath), 'utf8'), repoPath);
}

// ---------------------------------------------------------------- links

export interface RewriteOptions {
  repoSlug: string;
  branch: string;
  /** Repo-relative directory of the markdown file */
  fileDir: string;
  isDir?: (repoPath: string) => boolean;
}

const INLINE_LINK = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g;
const REF_LINK = /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/;

function rewriteTarget(url: string, image: boolean, o: RewriteOptions): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return url;
  const hashAt = url.search(/[?#]/);
  const path = hashAt === -1 ? url : url.slice(0, hashAt);
  const suffix = hashAt === -1 ? '' : url.slice(hashAt);
  if (!path) return url;
  const repoPath = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(o.fileDir, path)).replace(/\/$/, '');
  if (repoPath === '..' || repoPath.startsWith('../')) return url;
  if (image) return `https://raw.githubusercontent.com/${o.repoSlug}/${o.branch}/${repoPath}${suffix}`;
  const kind = o.isDir?.(repoPath) ? 'tree' : 'blob';
  return `https://github.com/${o.repoSlug}/${kind}/${o.branch}/${repoPath}${suffix}`;
}

/** Rewrites relative links and images to absolute GitHub URLs. Code is left untouched. */
export function rewriteRelativeLinks(markdown: string, o: RewriteOptions): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1];
      if (marker) {
        fence = fence === null ? marker : fence === marker ? null : fence;
        return line;
      }
      if (fence !== null) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) => {
          if (i % 2 === 1) return part;
          const ref = REF_LINK.exec(part);
          const text = ref ? part.replace(REF_LINK, (_m, head: string, url: string) => head + rewriteTarget(url, false, o)) : part;
          return text.replace(INLINE_LINK, (_m, bang: string, label: string, url: string, title: string) =>
            `${bang}[${label}](${rewriteTarget(url, bang === '!', o)}${title})`,
          );
        })
        .join('');
    })
    .join('\n');
}

// ---------------------------------------------------------------- redaction

/** Env and header values are secrets: publish the names only. */
export function envNames(value: unknown): string[] {
  return Object.keys(asRecord(value) ?? {}).sort(byCodeUnit);
}

/** Drops credentials, query string and fragment from a URL. */
export function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return raw.split(/[?#]/)[0] ?? raw;
  }
}

// ---------------------------------------------------------------- plugin parts

interface PluginContext {
  root: string;
  name: string;
  dir: string; // absolute
  repoDir: string; // repo-relative, posix
  base: {
    plugin: string;
    keywords: string[];
    category?: string;
    version?: string;
    author?: string;
    license?: string;
  };
  manifest: Json;
  rewrite: (md: string, repoFile: string) => string;
}

const join2 = (a: string, b: string) => (a ? posix.join(a, b) : b);

function checkName(name: string, label: string): void {
  if (!NAME_RE.test(name)) {
    throw new CatalogError(`${label}: name "${name}" must use letters, digits, ".", "_", "-" and start with a letter or digit`);
  }
}

function child<T extends ChildType>(
  ctx: PluginContext,
  type: T,
  name: string,
  sourcePath: string,
  fields: { description: string; keywords?: string[]; bodyMarkdown?: string },
) {
  checkName(name, sourcePath);
  return {
    id: `${ctx.name}/${type}/${name}`,
    type,
    name,
    plugin: ctx.name,
    description: fields.description,
    keywords: fields.keywords?.length ? unique(fields.keywords) : ctx.base.keywords,
    ...(ctx.base.category ? { category: ctx.base.category } : {}),
    ...(ctx.base.version ? { version: ctx.base.version } : {}),
    ...(ctx.base.author ? { author: ctx.base.author } : {}),
    ...(ctx.base.license ? { license: ctx.base.license } : {}),
    sourcePath,
    bodyMarkdown: fields.bodyMarkdown ?? '',
  };
}

function frontmatterDetails(data: Json): FrontmatterDetails {
  const out: FrontmatterDetails = {};
  for (const key of Object.keys(data).sort(byCodeUnit)) {
    if (key === 'name' || key === 'description' || key === 'keywords') continue;
    const v = data[key];
    if (v === undefined || v === null) continue;
    out[key] = Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

function skillsOf(ctx: PluginContext): Artifact[] {
  const dir = join(ctx.dir, 'skills');
  if (!isDirectory(dir)) return [];
  const out: Artifact[] = [];
  for (const entry of sortedDirents(dir)) {
    if (!entry.isDirectory()) continue;
    const repoPath = join2(ctx.repoDir, `skills/${entry.name}/SKILL.md`);
    if (!isRegularFile(join(ctx.root, repoPath))) continue;
    const { data, content } = readMarkdown(ctx.root, repoPath);
    out.push({
      ...child(ctx, 'skill', asString(data.name) ?? entry.name, repoPath, {
        description: asString(data.description) ?? '',
        keywords: asStringList(data.keywords),
        bodyMarkdown: ctx.rewrite(content, repoPath),
      }),
      type: 'skill',
      details: frontmatterDetails(data),
    });
  }
  return out;
}

function markdownFilesOf(ctx: PluginContext, folder: 'agents' | 'commands', type: 'agent' | 'command'): Artifact[] {
  const dir = join(ctx.dir, folder);
  if (!isDirectory(dir)) return [];
  const out: Artifact[] = [];
  for (const entry of sortedDirents(dir)) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const repoPath = join2(ctx.repoDir, `${folder}/${entry.name}`);
    const { data, content } = readMarkdown(ctx.root, repoPath);
    out.push({
      ...child(ctx, type, asString(data.name) ?? basename(entry.name, '.md'), repoPath, {
        description: asString(data.description) ?? '',
        keywords: asStringList(data.keywords),
        bodyMarkdown: ctx.rewrite(content, repoPath),
      }),
      type,
      details: frontmatterDetails(data),
    });
  }
  return out;
}

/** The manifest may point to a file or inline the config; the default file is `fallback`. */
function configOf(ctx: PluginContext, key: string, fallback: string): { value: Json; repoPath: string } | null {
  const declared = ctx.manifest[key];
  const inline = asRecord(declared);
  if (inline) return { value: inline, repoPath: join2(ctx.repoDir, '.claude-plugin/plugin.json') };
  const rel = typeof declared === 'string' ? declared : fallback;
  const full = resolveInside(ctx.dir, rel);
  if (!full || !isRegularFile(full)) return null;
  const repoPath = join2(ctx.repoDir, posix.normalize(rel));
  return { value: readJson(full, repoPath), repoPath };
}

function hooksOf(ctx: PluginContext): Artifact[] {
  const cfg = configOf(ctx, 'hooks', 'hooks/hooks.json');
  if (!cfg) return [];
  const events = asRecord(cfg.value.hooks) ?? cfg.value;
  const out: Artifact[] = [];
  for (const event of Object.keys(events).sort(byCodeUnit)) {
    const groups = events[event];
    if (!Array.isArray(groups)) continue;
    let n = 0;
    for (const group of groups) {
      const g = asRecord(group);
      if (!g) continue;
      const matcher = asString(g.matcher) ?? '';
      for (const hook of Array.isArray(g.hooks) ? g.hooks : []) {
        const h = asRecord(hook);
        if (!h) continue;
        n += 1;
        const details: HookDetails = {
          event,
          matcher,
          hookType: asString(h.type) ?? 'command',
          command: asString(h.command) ?? asString(h.prompt) ?? '',
        };
        out.push({
          ...child(ctx, 'hook', n === 1 ? event : `${event}-${n}`, cfg.repoPath, {
            description: truncate(`Runs on ${event}${matcher ? ` for ${matcher}` : ''}${details.command ? `: ${details.command}` : '.'}`, 200),
            keywords: unique([event.toLowerCase(), 'hook', ...ctx.base.keywords]),
          }),
          type: 'hook',
          details,
        });
      }
    }
  }
  return out;
}

function mcpServersOf(ctx: PluginContext): Artifact[] {
  const cfg = configOf(ctx, 'mcpServers', '.mcp.json');
  if (!cfg) return [];
  const servers = asRecord(cfg.value.mcpServers) ?? cfg.value;
  const out: Artifact[] = [];
  for (const server of Object.keys(servers).sort(byCodeUnit)) {
    const s = asRecord(servers[server]);
    if (!s) continue;
    const url = asString(s.url);
    const command = asString(s.command);
    const args = Array.isArray(s.args) ? s.args.map(String) : [];
    const details: McpServerDetails = {
      server,
      transport: asString(s.type) ?? (url ? 'http' : 'stdio'),
      ...(command ? { command: [command, ...args].join(' ') } : {}),
      ...(url ? { url: sanitizeUrl(url) } : {}),
      env: unique([...envNames(s.env), ...envNames(s.headers)]).sort(byCodeUnit),
    };
    out.push({
      ...child(ctx, 'mcp-server', server, cfg.repoPath, {
        description: asString(s.description) ?? `MCP server "${server}" (${details.transport}).`,
        keywords: unique(['mcp', ...ctx.base.keywords]),
      }),
      type: 'mcp-server',
      details,
    });
  }
  return out;
}

export function fileTree(dir: string, rootLabel: string): string {
  const lines: string[] = [`${rootLabel}/`];
  let truncated = false;
  const walk = (current: string, prefix: string) => {
    const entries = sortedDirents(current)
      .filter((e) => !TREE_SKIP.has(e.name) && (e.isDirectory() || e.isFile()))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || byCodeUnit(a.name, b.name));
    entries.forEach((entry, i) => {
      if (lines.length >= TREE_LIMIT) {
        truncated = true;
        return;
      }
      const last = i === entries.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}`);
      if (entry.isDirectory()) walk(join(current, entry.name), prefix + (last ? '    ' : '│   '));
    });
  };
  walk(dir, '');
  if (truncated) lines.push('…');
  return lines.join('\n');
}

// ---------------------------------------------------------------- external plugins

export function describeExternalSource(source: Json): { source: string; sourceUrl?: string } {
  const type = asString(source.source) ?? 'unknown';
  const repo = asString(source.repo);
  const url = asString(source.url);
  const pkg = asString(source.package);
  if (type === 'github' && repo) return { source: `github: ${repo}`, sourceUrl: `https://github.com/${repo}` };
  if (type === 'npm' && pkg) return { source: `npm: ${pkg}`, sourceUrl: `https://www.npmjs.com/package/${pkg}` };
  const path = asString(source.path);
  const label = `${type}: ${url ? sanitizeUrl(url) : (pkg ?? '?')}${path ? ` (${path})` : ''}`;
  const gh = url ? /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(sanitizeUrl(url)) : null;
  return { source: label, ...(gh ? { sourceUrl: `https://github.com/${gh[1]}` } : {}) };
}

// ---------------------------------------------------------------- repository info

export function parseRepoSlug(remote: string): string | undefined {
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m?.[1];
}

function resolveRepoSlug(root: string, config: SiteConfig): string {
  const fromGit = () => {
    try {
      const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return parseRepoSlug(remote);
    } catch {
      return undefined;
    }
  };
  const slug = config.repoSlug ?? process.env.GITHUB_REPOSITORY ?? fromGit();
  if (!slug || !/^[^/\s]+\/[^/\s]+$/.test(slug)) {
    throw new CatalogError('cannot determine the repository: set "repoSlug" in catalog.config.json or GITHUB_REPOSITORY');
  }
  return slug;
}

function resolveGeneratedAt(root: string): string {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return new Date(out).toISOString();
  } catch {
    // not a git checkout
  }
  return new Date().toISOString();
}

// ---------------------------------------------------------------- build

function authorName(v: unknown): string | undefined {
  return asString(v) ?? asString(asRecord(v)?.name);
}

export function buildCatalog(options: BuildOptions): Catalog {
  const root = resolve(options.root);
  const warn = options.warn ?? ((m: string) => console.warn(`warning: ${m}`));
  const mpFile = '.claude-plugin/marketplace.json';
  if (!isRegularFile(join(root, mpFile))) throw new CatalogError(`${mpFile}: file not found in ${root}`);
  const mp = readJson(join(root, mpFile), mpFile);
  const mpName = asString(mp.name);
  if (!mpName) throw new CatalogError(`${mpFile}: "name" is required`);
  if (!Array.isArray(mp.plugins)) throw new CatalogError(`${mpFile}: "plugins" must be an array`);

  const repoSlug = resolveRepoSlug(root, options.config);
  const branch = options.config.defaultBranch ?? 'main';
  const artifacts: Artifact[] = [];
  const catalogPlugins: string[] = [];
  const listedDirs = new Set<string>();

  for (const [i, raw] of mp.plugins.entries()) {
    const entry = asRecord(raw);
    const name = asString(entry?.name);
    if (!entry || !name) throw new CatalogError(`${mpFile}: plugins[${i}] needs a "name"`);
    checkName(name, `${mpFile} plugins[${i}]`);
    if (asRecord(entry['x-catalog'])?.hidden === true) {
      if (typeof entry.source === 'string') listedDirs.add(posix.normalize(entry.source).replace(/\/$/, ''));
      continue;
    }

    const common = {
      category: asString(entry.category),
      license: asString(entry.license),
    };
    const entryKeywords = [...asStringList(entry.keywords), ...asStringList(entry.tags)];
    catalogPlugins.push(name);

    // External source: only the marketplace entry is available.
    if (typeof entry.source !== 'string') {
      const src = asRecord(entry.source);
      if (!src) throw new CatalogError(`${mpFile}: plugin "${name}" has no usable "source"`);
      const ext = describeExternalSource(src);
      artifacts.push({
        id: name,
        type: 'plugin',
        name,
        plugin: name,
        description: asString(entry.description) ?? '',
        keywords: unique(entryKeywords),
        ...(common.category ? { category: common.category } : {}),
        ...(asString(entry.version) ? { version: asString(entry.version) } : {}),
        ...(authorName(entry.author) ? { author: authorName(entry.author) } : {}),
        ...(common.license ? { license: common.license } : {}),
        sourcePath: '',
        bodyMarkdown: '',
        details: { counts: {}, dependencies: asDependencies(entry.dependencies), external: true, ...ext },
      });
      continue;
    }

    const dir = resolveInside(root, entry.source);
    if (!dir || dir === root || !isDirectory(dir)) {
      throw new CatalogError(`${mpFile}: source "${entry.source}" of plugin "${name}" is not a directory inside the repository`);
    }
    const repoDir = posix.normalize(entry.source).replace(/\/$/, '');
    listedDirs.add(repoDir);

    const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
    const manifest = isRegularFile(manifestPath) ? readJson(manifestPath, join2(repoDir, '.claude-plugin/plugin.json')) : {};
    const version = asString(manifest.version) ?? asString(entry.version);
    const author = authorName(manifest.author) ?? authorName(entry.author);
    const license = asString(manifest.license) ?? common.license;
    const keywords = unique([...asStringList(manifest.keywords), ...entryKeywords]);

    const rewrite = (md: string, repoFile: string) =>
      rewriteRelativeLinks(md, {
        repoSlug,
        branch,
        fileDir: posix.dirname(repoFile),
        isDir: (p) => isDirectory(join(root, p)),
      });

    const ctx: PluginContext = {
      root,
      name,
      dir,
      repoDir,
      base: {
        plugin: name,
        keywords,
        ...(common.category ? { category: common.category } : {}),
        ...(version ? { version } : {}),
        ...(author ? { author } : {}),
        ...(license ? { license } : {}),
      },
      manifest,
      rewrite,
    };

    const children = [
      ...skillsOf(ctx),
      ...markdownFilesOf(ctx, 'agents', 'agent'),
      ...markdownFilesOf(ctx, 'commands', 'command'),
      ...hooksOf(ctx),
      ...mcpServersOf(ctx),
    ];
    const counts: Partial<Record<ChildType, number>> = {};
    for (const c of children) if (c.type !== 'plugin') counts[c.type] = (counts[c.type] ?? 0) + 1;

    const readmePath = join2(repoDir, 'README.md');
    const readme = isRegularFile(join(root, readmePath)) ? parseMarkdown(readFileSync(join(root, readmePath), 'utf8'), readmePath).content : '';

    artifacts.push({
      id: name,
      type: 'plugin',
      name,
      plugin: name,
      description: asString(manifest.description) ?? asString(entry.description) ?? '',
      keywords,
      ...(common.category ? { category: common.category } : {}),
      ...(version ? { version } : {}),
      ...(author ? { author } : {}),
      ...(license ? { license } : {}),
      sourcePath: repoDir,
      isDir: true,
      bodyMarkdown: rewrite(readme, readmePath),
      details: {
        counts,
        dependencies: asDependencies(manifest.dependencies ?? entry.dependencies),
        tree: fileTree(dir, basename(dir)),
      },
    });
    artifacts.push(...children);
  }

  const pluginsDir = join(root, 'plugins');
  if (isDirectory(pluginsDir)) {
    for (const d of sortedDirents(pluginsDir)) {
      if (d.isDirectory() && !listedDirs.has(`plugins/${d.name}`)) warn(`plugins/${d.name} is not listed in marketplace.json and was skipped`);
    }
  }

  const seen = new Map<string, Artifact>();
  for (const a of artifacts) {
    const prev = seen.get(a.id);
    if (prev) throw new CatalogError(`duplicate artifact id "${a.id}" (${prev.sourcePath} and ${a.sourcePath})`);
    seen.set(a.id, a);
  }
  artifacts.sort((a, b) => byCodeUnit(a.id, b.id));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? resolveGeneratedAt(root),
    marketplace: {
      name: mpName,
      description: asString(mp.description) ?? '',
      ownerName: asString(asRecord(mp.owner)?.name) ?? '',
      repoSlug,
      repoUrl: `https://github.com/${repoSlug}`,
      defaultBranch: branch,
    },
    installNote: options.config.installNote ?? '',
    plugins: [...catalogPlugins].sort(byCodeUnit),
    artifacts,
  };
}

/** JSON with sorted keys so unchanged content produces identical bytes. */
export function stableStringify(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Json)
          .sort(byCodeUnit)
          .map((k) => [k, sort((v as Json)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value)) + '\n';
}
