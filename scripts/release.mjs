#!/usr/bin/env node
// Release helper. Run from anywhere inside the repository.
//
//   node scripts/release.mjs bump <plugin> <major|minor|patch|X.Y.Z> [--note "text"]... [--dry-run]
//       Sets the version in plugin.json, adds a CHANGELOG.md section, runs the strict validator.
//       Commit the result in a pull request. Does not touch git history.
//
//   node scripts/release.mjs tag <plugin> [--push] [--remote origin] [--branch main] [--dry-run]
//       After the PR is merged: creates the annotated tag <plugin>--v<version> on the merge commit.
//       Refuses unless the tree is clean, HEAD equals <remote>/<branch>, and the version is new.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  SEMVER_RE, addChangelogEntry, bumpVersion, changelogSection, compareVersions, fail, findPlugin, git,
  highestVersion, loadMarketplace, loadPluginManifest, pluginTags, repoRoot, requireCleanTree, runCli,
  runValidator, tagName, today, writeManifestVersion,
} from './lib/release-common.mjs';

const USAGE = `Usage:
  node scripts/release.mjs bump <plugin> <major|minor|patch|X.Y.Z> [--note "text"]... [--dry-run]
  node scripts/release.mjs tag <plugin> [--push] [--remote origin] [--branch main] [--dry-run]`;

function parse(argv, options) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options });
  return { values, positionals };
}

function bump(argv) {
  const { values, positionals } = parse(argv, {
    note: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean' },
  });
  const [name, kind] = positionals;
  if (!name || !kind) fail(USAGE);

  const root = repoRoot();
  const plugin = findPlugin(root, loadMarketplace(root), name);
  const manifest = loadPluginManifest(plugin);
  const tags = pluginTags(root, name);
  const highest = highestVersion(manifest.data.version, tags);

  let next;
  if (SEMVER_RE.test(kind)) {
    next = kind;
    if (highest && compareVersions(next, highest) <= 0) {
      fail(`${next} is not above ${highest}; a published version number must never be reused`);
    }
  } else if (['major', 'minor', 'patch'].includes(kind)) {
    if (!highest) fail(`"${name}" has no version yet; pass an explicit version such as 1.0.0`);
    next = bumpVersion(highest, kind);
  } else {
    return fail(`"${kind}" is neither major, minor, patch nor X.Y.Z`);
  }

  let notes = values.note ?? [];
  if (notes.length === 0) {
    const range = tags.length ? [`${tags.at(-1).tag}..HEAD`] : [];
    const log = git(root, ['log', '--format=%s', ...range, '--', plugin.relDir], { allowFail: true }) ?? '';
    notes = log.split('\n').filter(Boolean);
    if (notes.length === 0) notes = ['No notable changes.'];
  }

  const changelogPath = join(plugin.dir, 'CHANGELOG.md');
  const changelogBefore = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : null;
  const changelogAfter = addChangelogEntry(changelogBefore, next, today(), notes);

  console.log(`${name}: ${manifest.data.version ?? '(none)'} -> ${next}${highest && highest !== manifest.data.version ? ` (highest published: ${highest})` : ''}`);
  console.log(notes.map((n) => `  - ${n}`).join('\n'));
  if (values['dry-run']) return console.log('dry run: nothing written');

  const manifestBefore = readFileSync(manifest.path, 'utf8');
  writeManifestVersion(manifest, next);
  writeFileSync(changelogPath, changelogAfter);

  if (!runValidator(root)) {
    writeFileSync(manifest.path, manifestBefore);
    if (changelogBefore === null) rmSync(changelogPath, { force: true });
    else writeFileSync(changelogPath, changelogBefore);
    fail('validation failed; changes were reverted');
  }
  console.log(`\nUpdated ${plugin.relDir}/.claude-plugin/plugin.json and ${plugin.relDir}/CHANGELOG.md.`);
  console.log(`Review the changelog text, commit, open a PR. After merge: node scripts/release.mjs tag ${name} --push`);
}

function tag(argv) {
  const { values, positionals } = parse(argv, {
    push: { type: 'boolean' },
    remote: { type: 'string', default: 'origin' },
    branch: { type: 'string', default: 'main' },
    'dry-run': { type: 'boolean' },
  });
  const [name] = positionals;
  if (!name) fail(USAGE);
  const { remote, branch } = values;

  const root = repoRoot();
  const plugin = findPlugin(root, loadMarketplace(root), name);
  const manifest = loadPluginManifest(plugin);
  const version = manifest.data.version;
  if (!version) fail(`${name} has no version in plugin.json; run "bump" first`);

  requireCleanTree(root);
  const current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current !== branch) fail(`on "${current}"; check out ${branch} (or pass --branch)`);
  git(root, ['fetch', '--quiet', remote, branch]);
  const [head, upstream] = [git(root, ['rev-parse', 'HEAD']), git(root, ['rev-parse', `refs/remotes/${remote}/${branch}`])];
  if (head !== upstream) fail(`HEAD is not ${remote}/${branch}; pull (or push) first so the tag lands on the merged commit`);

  const releaseTag = tagName(name, version);
  const existing = pluginTags(root, name);
  if (existing.some((t) => t.version === version)) fail(`tag ${releaseTag} already exists`);
  const above = existing.find((t) => compareVersions(t.version, version) > 0);
  if (above) fail(`version ${version} is below the published ${above.version}`);
  if (git(root, ['ls-remote', '--tags', remote, `refs/tags/${releaseTag}`])) fail(`tag ${releaseTag} already exists on ${remote}`);

  const changelog = existsSync(join(plugin.dir, 'CHANGELOG.md')) ? readFileSync(join(plugin.dir, 'CHANGELOG.md'), 'utf8') : null;
  const section = changelogSection(changelog, version);
  if (!section) fail(`${plugin.relDir}/CHANGELOG.md has no "## [${version}]" section`);

  console.log(`tag ${releaseTag} -> ${head.slice(0, 12)}`);
  if (values['dry-run']) return console.log('dry run: nothing created');
  git(root, ['tag', '-a', releaseTag, '-m', `${name} ${version}\n\n${section}`]);
  if (values.push) {
    git(root, ['push', remote, `refs/tags/${releaseTag}`]);
    console.log(`pushed ${releaseTag} to ${remote}`);
  } else {
    console.log(`created locally; publish with: git push ${remote} ${releaseTag}`);
  }
  console.log(`Users receive it after: /plugin marketplace update ${loadMarketplace(root).data.name}`);
}

runCli(() => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'bump') return bump(rest);
  if (cmd === 'tag') return tag(rest);
  return fail(USAGE);
});
