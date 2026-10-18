#!/usr/bin/env node
// Structural linter for the marketplace. Covers what `claude plugin validate` misses
// (e.g. a relative `source` that points at a missing directory only fails at install time).
// Usage: node scripts/validate-marketplace.mjs [--strict] [root]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = resolve(args.find((a) => !a.startsWith('--')) ?? '.');

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED = new Set([
  'claude-plugins-official', 'anthropic-marketplace', 'anthropic-plugins', 'agent-skills',
  'knowledge-work-plugins', 'claude-community', 'claude-code-marketplace',
  'inline', 'builtin', 'skills-dir', 'synced', 'npm', 'pip', 'uv', 'cargo', 'github', 'gh',
]); // partial list; the full one is in the official marketplace-reference docs
const SOURCE_TYPES = new Set(['github', 'url', 'git-subdir', 'npm', 'archive', 'command']);
const COMPONENT_DIRS = ['skills', 'agents', 'commands', 'hooks', 'output-styles', 'themes', 'monitors', 'workflows'];
const COMPONENT_FILES = ['.mcp.json', '.lsp.json', 'hooks.json'];

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(`${label}: ${e.code === 'ENOENT' ? 'file not found' : `invalid JSON (${e.message})`}`);
    return null;
  }
}

function checkName(name, label) {
  if (typeof name !== 'string' || !name) return err(`${label}: "name" is required`);
  if (!NAME_RE.test(name) || name.includes('..')) {
    err(`${label}: name "${name}" must use letters, digits, ".", "_", "-" and start with a letter or digit`);
  }
}

const mpPath = join(root, '.claude-plugin', 'marketplace.json');
const mp = readJson(mpPath, '.claude-plugin/marketplace.json');

if (mp) {
  checkName(mp.name, 'marketplace');
  if (typeof mp.name === 'string') {
    if (RESERVED.has(mp.name) || mp.name.startsWith('claudeai-')) err(`marketplace: name "${mp.name}" is reserved`);
    if (/^(claude|anthropic)-/.test(mp.name)) warn(`marketplace: name "${mp.name}" may be rejected (claude-/anthropic- prefix)`);
  }
  if (!mp.owner || typeof mp.owner.name !== 'string' || !mp.owner.name) err('marketplace: "owner.name" is required');
  if (!mp.description) warn('marketplace: "description" is missing');
  if (!Array.isArray(mp.plugins)) err('marketplace: "plugins" must be an array');
}

const listed = new Set();
const seen = new Set();

for (const [i, entry] of (Array.isArray(mp?.plugins) ? mp.plugins : []).entries()) {
  const label = `plugins[${i}]${entry?.name ? ` (${entry.name})` : ''}`;
  if (!entry || typeof entry !== 'object') {
    err(`${label}: must be an object`);
    continue;
  }
  checkName(entry.name, label);
  if (seen.has(entry.name)) err(`${label}: duplicate plugin name`);
  seen.add(entry.name);

  if (entry.source === undefined) {
    err(`${label}: "source" is required`);
    continue;
  }
  if (entry.hooks !== undefined && (typeof entry.hooks === 'string' || Array.isArray(entry.hooks))) {
    err(`${label}: entry-level "hooks" as a path or array is silently ignored by Claude Code`);
  }

  if (typeof entry.source === 'object' && entry.source !== null) {
    const { source: type, sha } = entry.source;
    if (!SOURCE_TYPES.has(type)) err(`${label}: unknown source type "${type}"`);
    if (sha !== undefined && !/^[0-9a-f]{40}$/.test(sha)) err(`${label}: source.sha must be a full 40-character commit SHA`);
    if (['github', 'url', 'git-subdir'].includes(type) && !sha) warn(`${label}: remote source is not pinned to a sha`);
    if (type === 'archive' && !entry.source.sha256) warn(`${label}: archive source has no sha256`);
    continue;
  }

  if (typeof entry.source !== 'string') {
    err(`${label}: "source" must be a string or an object`);
    continue;
  }
  const src = entry.source;
  if (!src.startsWith('./')) err(`${label}: relative source "${src}" must start with "./"`);
  if (src.split('/').includes('..') || src.includes('\\')) err(`${label}: source "${src}" must not contain ".." or backslashes`);

  const dir = resolve(root, src);
  const rel = relative(root, dir);
  if (rel.startsWith('..') || resolve(rel) === rel) {
    err(`${label}: source "${src}" escapes the marketplace root`);
    continue;
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    err(`${label}: source directory "${src}" does not exist`);
    continue;
  }
  listed.add(rel.split(sep).join('/'));

  const manifestDir = join(dir, '.claude-plugin');
  const manifestPath = join(manifestDir, 'plugin.json');
  if (existsSync(manifestDir)) {
    for (const f of readdirSync(manifestDir)) {
      if (f !== 'plugin.json') err(`${label}: ".claude-plugin/${f}" must live at the plugin root, not inside .claude-plugin/`);
    }
  }
  for (const d of COMPONENT_DIRS) {
    if (existsSync(join(manifestDir, d))) err(`${label}: "${d}" must be at the plugin root, not inside .claude-plugin/`);
  }
  for (const f of COMPONENT_FILES) {
    if (existsSync(join(manifestDir, f))) err(`${label}: "${f}" must be at the plugin root, not inside .claude-plugin/`);
  }

  if (!existsSync(manifestPath)) {
    if (entry.strict === false) continue;
    warn(`${label}: no plugin.json (the marketplace entry acts as the manifest)`);
    continue;
  }
  const pj = readJson(manifestPath, `${label} plugin.json`);
  if (!pj) continue;
  if (pj.name !== entry.name) err(`${label}: entry name "${entry.name}" differs from plugin.json name "${pj.name}"`);
  if (pj.version !== undefined && entry.version !== undefined) err(`${label}: "version" is set in both plugin.json and the marketplace entry`);
  if (!pj.description) warn(`${label}: plugin.json has no "description"`);
  if (!pj.author) warn(`${label}: plugin.json has no "author"`);
  if (!pj.license) warn(`${label}: plugin.json has no "license"`);
  if (entry.strict === false) {
    for (const k of ['commands', 'agents', 'skills', 'hooks', 'outputStyles', 'themes']) {
      if (entry[k] !== undefined) err(`${label}: strict:false entry declares "${k}" alongside plugin.json (conflicting manifests)`);
    }
  }
}

const pluginsDir = join(root, 'plugins');
if (existsSync(pluginsDir)) {
  for (const d of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (d.isDirectory() && !listed.has(`plugins/${d.name}`)) warn(`plugins/${d.name} is not listed in marketplace.json`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' (strict)' : ''}`);
process.exit(failed ? 1 : 0);
