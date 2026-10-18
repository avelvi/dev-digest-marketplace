#!/usr/bin/env node
// Rollback helper. Run from anywhere inside the repository. Needs a clean working tree.
//
//   node scripts/rollback.mjs restore <plugin> --to <version> [--note "text"]... [--dry-run]
//       Fast rollback. Puts the plugin files back to the state of tag <plugin>--v<version>, but publishes
//       them as a NEW patch version above the highest one ever released (clients that cached a version
//       never refetch it, so a number must not be reused). CHANGELOG.md keeps its full history.
//       Leaves the changes unstaged; commit them in a PR, merge, then run "release.mjs tag".
//
//   node scripts/rollback.mjs remove <plugin> [--force-uninstall] [--dry-run]
//       Emergency removal. Deletes the marketplace entry and the plugin directory and records the name
//       in the append-only "renames" map as null. --force-uninstall also sets
//       forceRemoveDeletedPlugins, which uninstalls removed plugins on every user's machine.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  SEMVER_RE, addChangelogEntry, bumpVersion, fail, findPlugin, git, highestVersion, loadMarketplace,
  loadPluginManifest, localPluginPaths, pluginTags, readJsonFile, repoRoot, requireCleanTree, runCli,
  runValidator, tagName, today, writeJsonFile, writeManifestVersion,
} from './lib/release-common.mjs';

const USAGE = `Usage:
  node scripts/rollback.mjs restore <plugin> --to <version> [--note "text"]... [--dry-run]
  node scripts/rollback.mjs remove <plugin> [--force-uninstall] [--dry-run]`;

function parse(argv, options) {
  return parseArgs({ args: argv, allowPositionals: true, options });
}

function restore(argv) {
  const { values, positionals } = parse(argv, {
    to: { type: 'string' },
    note: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean' },
  });
  const [name] = positionals;
  if (!name || !values.to) fail(USAGE);

  const root = repoRoot();
  const plugin = findPlugin(root, loadMarketplace(root), name);
  const manifest = loadPluginManifest(plugin);
  requireCleanTree(root);

  const target = values.to.replace(new RegExp(`^(${name}--)?v`), '');
  if (!SEMVER_RE.test(target)) fail(`"${values.to}" is not a version like 1.2.0 or ${name}--v1.2.0`);
  const targetTag = tagName(name, target);
  if (git(root, ['rev-parse', '--verify', '--quiet', `refs/tags/${targetTag}`], { allowFail: true }) === null) {
    fail(`tag ${targetTag} does not exist`);
  }

  const tags = pluginTags(root, name);
  const highest = highestVersion(manifest.data.version, tags);
  if (target === highest) fail(`${target} is already the highest version; nothing to roll back to`);
  const next = bumpVersion(highest, 'patch');

  console.log(`${name}: restore files of ${targetTag}, publish as ${next} (highest so far: ${highest})`);
  if (values['dry-run']) return console.log('dry run: nothing written');

  const changelogPath = join(plugin.dir, 'CHANGELOG.md');
  const changelogBefore = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : null;

  rmSync(plugin.dir, { recursive: true, force: true });
  git(root, ['checkout', targetTag, '--', plugin.relDir]);
  git(root, ['reset', '--quiet', '--', plugin.relDir]);

  const restored = readJsonFile(plugin.manifestPath);
  writeManifestVersion(restored, next);
  const notes = [`Rolled back to the content of ${target}.`, ...(values.note ?? [])];
  writeFileSync(changelogPath, addChangelogEntry(changelogBefore, next, today(), notes));

  if (!runValidator(root)) {
    git(root, ['checkout', 'HEAD', '--', plugin.relDir]);
    git(root, ['clean', '--force', '--quiet', '--', plugin.relDir]);
    fail('validation failed; changes were reverted');
  }
  console.log(`\nRestored ${plugin.relDir} to ${target} as version ${next}. Review with: git status && git diff`);
  console.log(`Commit, open a PR, merge, then: node scripts/release.mjs tag ${name} --push`);
}

function remove(argv) {
  const { values, positionals } = parse(argv, {
    'force-uninstall': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  });
  const [name] = positionals;
  if (!name) fail(USAGE);

  const root = repoRoot();
  const marketplace = loadMarketplace(root);
  const entries = Array.isArray(marketplace.data.plugins) ? marketplace.data.plugins : [];
  const entry = entries.find((p) => p?.name === name);
  if (!entry) fail(`plugin "${name}" is not listed in marketplace.json`);
  if (marketplace.data.renames && name in marketplace.data.renames) fail(`"${name}" is already in "renames"`);
  requireCleanTree(root);

  const dir = typeof entry.source === 'string' ? localPluginPaths(root, entry) : null;
  console.log(`${name}: remove entry${dir ? ` and ${dir.relDir}/` : ''}, record in "renames" as null${values['force-uninstall'] ? ', set forceRemoveDeletedPlugins' : ''}`);
  if (values['force-uninstall']) {
    console.log('warning: forceRemoveDeletedPlugins applies to every plugin removed from this catalog, now and later.');
  }
  if (values['dry-run']) return console.log('dry run: nothing written');

  marketplace.data.plugins = entries.filter((p) => p !== entry);
  marketplace.data.renames = { ...marketplace.data.renames, [name]: null };
  if (values['force-uninstall']) marketplace.data.forceRemoveDeletedPlugins = true;
  writeJsonFile(marketplace);
  if (dir) rmSync(dir.dir, { recursive: true, force: true });

  if (!runValidator(root)) {
    git(root, ['checkout', 'HEAD', '--', '.']);
    fail('validation failed; changes were reverted');
  }
  console.log(`\nRemoved ${name}. Also delete its line in .github/CODEOWNERS, then commit and open a PR.`);
  console.log('Users get the removal after: /plugin marketplace update <marketplace-name>');
}

runCli(() => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'restore') return restore(rest);
  if (cmd === 'remove') return remove(rest);
  return fail(USAGE);
});
