# Releases

## How Claude Code picks a version

1. `version` in the plugin's `plugin.json`
2. `version` in the marketplace entry
3. Otherwise the first 12 characters of the commit SHA (for git-based and relative-path sources)

A pinned `version` keeps users on the cached copy until it changes, even if you push new commits. That is the most common "my update never arrives" cause.

## Policy

- Plugins use **SemVer** (`MAJOR.MINOR.PATCH`), set **only in `plugin.json`**. Never in both `plugin.json` and the marketplace entry (`plugin.json` silently wins and the validator flags it).
- Every user-visible change bumps the version in the same PR:
  - MAJOR: breaking change (removed or renamed skill, changed hook behavior, new required config)
  - MINOR: backward-compatible feature
  - PATCH: fix
- A plugin that is still experimental may omit `version`; users then get every commit.
- Tag releases `<plugin>--v<version>` (e.g. `dev-digest--v1.2.0`). This is the convention used for dependency resolution.
- Keep a `CHANGELOG.md` per plugin. There is no official convention for it; this is our own.

## Publishing

Two scripts do the mechanical work (Node 20+, no dependencies, relative-path plugins only):

1. On a branch, prepare the release. This sets `version` in `plugin.json` only, adds a `## [X.Y.Z] - date` section to the plugin's `CHANGELOG.md`, and runs the strict validator (changes are reverted if it fails):
   ```
   node scripts/release.mjs bump <plugin> <major|minor|patch|X.Y.Z> [--note "text"]...
   ```
   Without `--note`, the changelog lists commit subjects that touched the plugin since its last tag. Edit the text if needed. A plugin's first release needs an explicit version such as `1.0.0`. The script refuses a version that is not above the highest one declared or tagged, so a number is never reused.
2. Commit and merge the PR; CI must be green.
3. On `main`, tag the merge commit and push the tag:
   ```
   node scripts/release.mjs tag <plugin> --push
   ```
   It creates the annotated tag `<plugin>--v<version>` with the changelog section as the message. It refuses if the tree is dirty, `HEAD` is not `origin/main`, the tag exists locally or on the remote, or the changelog section is missing. Add `--dry-run` to either command to preview.
4. Users get it with `/plugin marketplace update dev-digest-marketplace` (or automatically if they enabled auto-update), then `/reload-plugins` or a new session.

## Update

Users update with `claude plugin update <plugin>@dev-digest-marketplace`. The running session keeps the old version until `/reload-plugins` or restart.

## Rollback

- Fast: publish the last good content as a new, higher PATCH version. Do not reuse a version number: clients that already cached it will not refetch.
  ```
  node scripts/rollback.mjs restore <plugin> --to <good-version> [--note "why"]...
  ```
  This restores the plugin directory from tag `<plugin>--v<good-version>`, sets the next patch version above the highest one ever released, and appends a rollback entry to `CHANGELOG.md` (history is kept). The changes are left unstaged. Commit, open a PR, merge, then run `release.mjs tag` as usual. Use `--dry-run` to preview the target version.
- Pin: users can install a specific revision by adding the marketplace with `#<ref>`, e.g. `/plugin marketplace add avelvi/dev-digest-marketplace#<tag>`.
- Emergency: take the plugin out of the catalog.
  ```
  node scripts/rollback.mjs remove <plugin> [--force-uninstall]
  ```
  This deletes the marketplace entry and the plugin directory and adds the name to `renames` as `null`. With `--force-uninstall` it also sets `forceRemoveDeletedPlugins: true`, which uninstalls removed plugins for everyone, including plugins removed later; remove that flag again once the incident is over if you do not want this permanently. Delete the plugin's line in `.github/CODEOWNERS` by hand. The files stay in git history. `renames` is append-only; the script refuses to add a name that is already in it.

## Renames and removals

`renames` in `marketplace.json` is append-only. There is no deprecation state. Without `renames`/`forceRemoveDeletedPlugins`, removed plugins stay installed and report `not found in marketplace`.

## Channels

There are no release channels. If needed, create a second marketplace with a different `name` that points at a different `ref`, and give the refs different versions.
