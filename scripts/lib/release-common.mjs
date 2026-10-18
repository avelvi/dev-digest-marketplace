// Shared helpers for scripts/release.mjs and scripts/rollback.mjs. Node only, no dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const VALIDATOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'validate-marketplace.mjs');

export class UserError extends Error {}
export const fail = (msg) => {
  throw new UserError(msg);
};

export function runCli(main) {
  try {
    main();
  } catch (e) {
    if (e instanceof UserError) {
      console.error(`error: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

export function git(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (allowFail) return null;
    return fail(`git ${args.join(' ')} failed: ${String(e.stderr || e.message).trim()}`);
  }
}

export function repoRoot() {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return fail('not inside a git repository');
  }
  if (!existsSync(join(root, '.claude-plugin', 'marketplace.json'))) {
    fail(`${root} has no .claude-plugin/marketplace.json`);
  }
  return root;
}

export function requireCleanTree(root) {
  const status = git(root, ['status', '--porcelain']);
  if (status) fail(`working tree is not clean; commit or stash first:\n${status}`);
}

// ---- JSON files (keeps the file's indentation) ----

export function readJsonFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return fail(`cannot read ${path}: ${e.code ?? e.message}`);
  }
  try {
    return { path, data: JSON.parse(text), indent: /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ' };
  } catch (e) {
    return fail(`invalid JSON in ${path}: ${e.message}`);
  }
}

export function writeJsonFile(file) {
  writeFileSync(file.path, `${JSON.stringify(file.data, null, file.indent)}\n`);
}

export function loadMarketplace(root) {
  return readJsonFile(join(root, '.claude-plugin', 'marketplace.json'));
}

// Resolves a plugin that uses a relative-path source. Remote sources are pinned by sha and have no local files to release.
export function findPlugin(root, marketplace, name) {
  const plugins = Array.isArray(marketplace.data.plugins) ? marketplace.data.plugins : [];
  const entry = plugins.find((p) => p?.name === name);
  if (!entry) return fail(`plugin "${name}" is not listed in marketplace.json`);
  return { entry, ...localPluginPaths(root, entry) };
}

export function localPluginPaths(root, entry) {
  if (typeof entry.source !== 'string') {
    return fail(`plugin "${entry.name}" has a remote source; only relative-path plugins are supported by these scripts`);
  }
  const dir = resolve(root, entry.source);
  const rel = relative(root, dir);
  if (!entry.source.startsWith('./') || rel === '' || rel.startsWith('..')) {
    fail(`plugin "${entry.name}": source "${entry.source}" must be a "./" path inside the repository`);
  }
  return { dir, relDir: rel.split('\\').join('/'), manifestPath: join(dir, '.claude-plugin', 'plugin.json') };
}

export function loadPluginManifest(plugin) {
  if (!existsSync(plugin.manifestPath)) fail(`${plugin.relDir}/.claude-plugin/plugin.json not found`);
  const manifest = readJsonFile(plugin.manifestPath);
  if (plugin.entry.version !== undefined) {
    fail(`"version" is set in the marketplace entry of "${plugin.entry.name}"; keep it only in plugin.json (docs/RELEASES.md)`);
  }
  if (manifest.data.version !== undefined && !SEMVER_RE.test(manifest.data.version)) {
    fail(`plugin.json version "${manifest.data.version}" is not MAJOR.MINOR.PATCH`);
  }
  return manifest;
}

// Edits only the "version" line (inserting it after "name" when absent) so the diff stays minimal.
// Falls back to re-serializing the file if the text edit does not produce the expected JSON.
export function writeManifestVersion(manifest, version) {
  const text = readFileSync(manifest.path, 'utf8');
  const expected = { ...manifest.data, version };
  const edited =
    manifest.data.version !== undefined
      ? text.replace(new RegExp(`^(${manifest.indent}"version"\\s*:\\s*)"[^"\\n]*"`, 'm'), `$1"${version}"`)
      : text.replace(
          /^([ \t]+)("name"\s*:\s*"[^"\n]*")(,?)[ \t]*$/m,
          (_, ind, name, comma) => `${ind}${name},\n${ind}"version": "${version}"${comma}`,
        );
  try {
    if (isDeepStrictEqual(JSON.parse(edited), expected)) return writeFileSync(manifest.path, edited);
  } catch {
    // fall through to the full rewrite
  }
  manifest.data = expected;
  writeJsonFile(manifest);
}

// ---- SemVer (plain MAJOR.MINOR.PATCH only) ----

const parts = (v) => SEMVER_RE.exec(v).slice(1).map(Number);

export function compareVersions(a, b) {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

export function bumpVersion(version, kind) {
  const [major, minor, patch] = parts(version);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ---- Tags: <plugin>--v<version> ----

export const tagName = (plugin, version) => `${plugin}--v${version}`;

export function pluginTags(root, plugin) {
  const prefix = `${plugin}--v`;
  const out = git(root, ['tag', '--list', `${prefix}*`], { allowFail: true }) ?? '';
  return out
    .split('\n')
    .filter((t) => t.startsWith(prefix) && SEMVER_RE.test(t.slice(prefix.length)))
    .map((tag) => ({ tag, version: tag.slice(prefix.length) }))
    .sort((a, b) => compareVersions(a.version, b.version));
}

// Highest version ever published or currently declared; new versions must be above it.
export function highestVersion(current, tags) {
  const all = [...tags.map((t) => t.version), ...(current ? [current] : [])];
  return all.sort(compareVersions).at(-1) ?? null;
}

// ---- CHANGELOG.md ----

export function addChangelogEntry(text, version, date, notes) {
  if (new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`, 'm').test(text ?? '')) {
    fail(`CHANGELOG.md already has a section for ${version}`);
  }
  const section = `## [${version}] - ${date}\n\n${notes.map((n) => `- ${n}`).join('\n')}\n\n`;
  if (!text) return `# Changelog\n\n${section}`.trimEnd() + '\n';
  const m = /^## /m.exec(text);
  if (!m) return `${text.trimEnd()}\n\n${section}`.trimEnd() + '\n';
  return text.slice(0, m.index) + section + text.slice(m.index);
}

export function changelogSection(text, version) {
  const start = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\].*$`, 'm').exec(text ?? '');
  if (!start) return null;
  const rest = text.slice(start.index + start[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export const today = () => new Date().toISOString().slice(0, 10);

// ---- Validation ----

export function runValidator(root) {
  try {
    execFileSync(process.execPath, [VALIDATOR, '--strict', root], { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

export const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
