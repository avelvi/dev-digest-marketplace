# Research: how to build a Claude Code plugin marketplace repository

Date: 2026-10-17

**Verification status.** The data was gathered by two subagents (they read the official documentation and GitHub). I did not re-read the sources myself. Before relying on a specific field or version, check it against the documentation. **[unverified]** means the agent found no source for the claim. The documentation describes recent Claude Code versions (v2.1.2xx+), and some features require a minimum version (noted below).

Documentation index: https://code.claude.com/docs/llms.txt

Main pages (base `https://code.claude.com/docs/en/plugins/`):
`create-marketplace`, `marketplace-reference`, `manifest-reference`, `install`, `loading`, `host-marketplace`, `org`, `cli-reference`, `troubleshooting`. Also https://code.claude.com/docs/en/settings.md.

---

## Part 1. Official instructions

### 1.1 Repository layout

- `.claude-plugin/marketplace.json` lives at the repository root (the directory that contains `.claude-plugin/`).
- Relative plugin `source` paths resolve from the marketplace root, not from `.claude-plugin/`.
- Plugin directories can live anywhere. The documentation example uses `plugins/<name>/`.
- Plugin manifest (optional): `<plugin>/.claude-plugin/plugin.json`.
- Everything else goes at the plugin root, **not** inside `.claude-plugin/`. Components placed in `.claude-plugin/` are not loaded.
  - `skills/<name>/SKILL.md`
  - `commands/*.md` (legacy format; the docs prefer skills)
  - `agents/*.md`
  - `hooks/hooks.json`
  - `.mcp.json`, `.lsp.json`
  - `output-styles/`, `themes/`, `monitors/monitors.json`, `workflows/`, `bin/`, `settings.json`
- A `CLAUDE.md` at the plugin root is **not loaded**. Put instructions in a skill.

Recommended skeleton:

```
repo/
├── .claude-plugin/marketplace.json
├── plugins/<kebab-name>/
│   ├── .claude-plugin/plugin.json
│   ├── skills/ , agents/ , hooks/hooks.json , scripts/
│   ├── README.md
│   └── LICENSE
├── .github/workflows/validate.yml
├── README.md
└── LICENSE
```

### 1.2 marketplace.json schema

Required fields: `name`, `owner` (with `owner.name`), `plugins`.

| Field | Notes |
|---|---|
| `name` | Letters, digits, `.`, `_`, `-`; starts with a letter or digit; no `..`. kebab-case is preferred |
| `owner` | `name` required; `email`, `url` optional |
| `plugins[]` | Each entry is validated separately |
| `$schema` | Editor autocomplete only |
| `description`, `version` | The validator warns if `description` is missing |
| `metadata.pluginRoot` | Lets `source` use bare names (v2.1.239+) |
| `forceRemoveDeletedPlugins` | Uninstalls plugins that were removed from the catalog |
| `allowCrossMarketplaceDependenciesOn` | Marketplace names whose plugins may be dependencies |
| `renames` | Old name to new name, or `null` for removed plugins |

Unknown keys are ignored at load time. `claude plugin validate` only warns about them, so a typo in a field name is invisible.

Plugin entry: `name` and `source` are required. Optional: `description`, `version`, `category`, `tags`, `strict`, `dependencies`, `defaultEnabled`, `displayName`, `relevance`, `metadata`. An entry also accepts any `plugin.json` field.

Minimal example from the docs:

```json
{
  "name": "my-marketplace",
  "description": "Plugins for my team",
  "owner": { "name": "Your Name" },
  "plugins": [
    {
      "name": "my-first-plugin",
      "source": "./plugins/my-first-plugin",
      "description": "A greeting plugin to learn the basics"
    }
  ]
}
```

**Reserved marketplace names** (partial list; the full list is in `marketplace-reference`, "Reserved names"): `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `knowledge-work-plugins`, `claude-community`, `claude-code-marketplace`, plus `inline`, `builtin`, `skills-dir`, `synced`, `npm`, `pip`, `uv`, `cargo`, `github`, `gh`, and anything starting with `claudeai-`. Names that impersonate Anthropic marketplaces are rejected. Reservation is enforced only when a user adds the marketplace, not by `validate`.

### 1.3 Source types, pinning, strict mode

Plugin `source` types (marketplace-reference, "Plugin sources"):

- **Relative path** (string): starts with `./`, no `..`.
- **`github`**: `{ "source": "github", "repo": "owner/repo", "ref": "...", "sha": "..." }`
- **`url`**: any git URL (`https`, `http`, `file`, `git@`), with `ref` and `sha`.
- **`git-subdir`**: `url`, `path`, `ref`, `sha`. Sparse checkout of one subdirectory.
- **`npm`**: `package`, `version`, `registry`. Install scripts do not run.
- **`archive`**: `url` (HTTPS only), `sha256`. Requires v2.1.224+.
- **`command`**: `command`, `timeout`, `mode` (`copy` or `link`). Requires v2.1.229+.

Pinning: `ref` is a branch or tag, `sha` is a full 40-character commit. If both are set, `sha` is checked out.

**Version resolution** (loading, "How Claude Code computes the version"):

1. `version` in `plugin.json` (highest priority).
2. `version` in the marketplace entry.
3. If neither is set, the version comes from the source. For `github`, `url`, `git-subdir` and relative paths in git, it is the first 12 characters of the commit SHA.

Consequence: with a pinned `version`, users stay on the cached copy until you change it, even after you push new commits. To track commits, omit `version` everywhere. Do not set `version` in both `plugin.json` and the entry. `plugin.json` silently wins, and `validate` warns `Entry declares version ... but plugin.json says ...`.

**`strict`** (default `true`):

- No `plugin.json`: the entry is the manifest.
- `plugin.json` present, `strict: true`: component fields from the entry (`commands`, `agents`, `skills`, `hooks`, `outputStyles`, `themes`) are appended. For `hooks`, the entry's matchers replace the manifest's matchers for the same event.
- `plugin.json` present, `strict: false`: if the entry declares any of those fields, it is a conflict and the plugin fails to load (`conflicting manifests`).
- Entry `mcpServers` and `userConfig` apply only when there is no `plugin.json`.
- `strict: false` fits entries without a `plugin.json`, for example a bundle of skills (the pattern used in the official README).

### 1.4 plugin.json

- Only `name` is required: kebab-case, no spaces, `@` or `:`.
- Other fields: `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `defaultEnabled`, `dependencies`, `settings`, `userConfig`, `channels`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `experimental`.
- `validate` warns if `version`, `description` or `author` is missing.
- Component paths are relative to the plugin root and **must start with `./`** (`skills` also accepts `"."`). A path must exist and stay inside the plugin root. `..`, symlinks leading outside, and backslashes on macOS/Linux are rejected (`path escapes plugin directory`).
- Variables:
  - `${CLAUDE_PLUGIN_ROOT}`: the install directory of the current version, **changes on every update**.
  - `${CLAUDE_PLUGIN_DATA}`: persistent directory that survives updates. Keep state here.
  - `${CLAUDE_PROJECT_DIR}`.
- `${CLAUDE_PLUGIN_ROOT}` is not exported to Bash commands run by Claude itself. Use it in hook, MCP and LSP configs, or inline in skill/command Markdown.
- In shell-form hooks, quote the variable (otherwise paths with spaces break), or use exec form with `args`.

Example:

```json
{
  "hooks": {
    "PostToolUse": [
      { "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/process.sh" } ] }
    ]
  }
}
```

**Caching.**

- Marketplace plugins are copied to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and loaded from there.
- Only the plugin directory is copied, so scripts that read `../shared` break.
- Exceptions (loaded in place): `--plugin-dir`, and relative-path plugins from a marketplace added from a local path. Edits take effect at the next session or `/reload-plugins`.
- Old version directories are removed 14 days after an update.
- The cache root can be moved with `CLAUDE_CODE_PLUGIN_CACHE_DIR`.
- Sharing files across plugins: use symlinks. They are followed only within the same marketplace; symlinks pointing outside are skipped.

### 1.5 CLI and distribution

Commands (`claude plugins` is an alias):

- `claude plugin marketplace add <source>`: GitHub `owner/repo` (append `#ref` to pin), git URL, local path (`./`, `../`, `/`, `~`), or an `https://` URL to a `marketplace.json`. Flags seen in the docs: `--scope`, `--sparse`, `--claudeai`, `--json`.
- `claude plugin marketplace list | update [name] | remove <name>`
- `claude plugin install <plugin>@<marketplace> [--scope user|project|local] [--marketplace <source>] [--yes] [--json]` (`--marketplace` requires v2.1.292+)
- `claude plugin update|enable|disable|uninstall <plugin>@<marketplace>`, `claude plugin list`, `claude plugin details <name>`
- `claude plugin validate <path>`; `--strict` turns warnings into failures.
- In-session: `/plugin marketplace add|list|update|remove`, `/plugin install name@marketplace`, `/reload-plugins`.
- A `/plugin validate` slash command was not found in the docs **[unverified]**. Only the shell command `claude plugin validate` is documented.
- `/plugin install <name>` without `@marketplace` searches only cached catalogs. Always specify `name@marketplace`.

**Local testing:**

```
claude plugin marketplace add ./my-marketplace
claude plugin install my-first-plugin@my-marketplace
```

For a one-session load, use `--plugin-dir`.

**Team distribution:**

- Project scope writes `enabledPlugins` to the committed `.claude/settings.json`. `marketplace add --scope project` writes the marketplace itself.
- Committing the setting does **not** download the plugin. Each collaborator must run `claude plugin install <name>@<marketplace> --scope project` once.
- Repository-level `extraKnownMarketplaces` applies only after the folder trust dialog is accepted.
- Managed settings (org): `extraKnownMarketplaces` registers, `enabledPlugins` (`"plugin@marketplace": true`) enables, `false` blocks. The policy keys `strictKnownMarketplaces` (allowlist) and `blockedMarketplaces` (blocklist) are managed-only.

```json
{
  "extraKnownMarketplaces": {
    "your-marketplace": {
      "source": { "source": "git", "url": "https://git.example.com/your-org/your-marketplace.git", "ref": "main" }
    }
  }
}
```

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "your-org/*" },
    { "source": "hostPattern", "hostPattern": "^git\\.example\\.com$" }
  ]
}
```

The agent did not verify the full settings-reference schema **[unverified]**. The schemas above come from `org.md` and `marketplace-reference`.

**Private repositories:**

- `marketplace.json` has no token field. Claude Code runs git non-interactively with the user's existing credentials and never prompts.
- SSH: the key must work without a passphrase prompt, and the host must be in `known_hosts`.
- HTTPS: a credential helper must already hold the credential (for GitHub: `gh auth login`, then `gh auth setup-git`).
- `GITHUB_TOKEN`/`GH_TOKEN` alone do not authenticate background checks; they work only through a credential helper.
- In CI: export `GH_TOKEN` and run `gh auth setup-git`. The default GitHub Actions token reaches only its own repository.
- Environment variables: `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS` (default 120000), `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1`, `CLAUDE_CODE_PLUGIN_SEED_DIR`.
- `archive` sources can use entry `headers` or `headersHelper` (requires `"strict": false`).

**Auto-update:**

- On by default for Anthropic's official marketplaces (except `knowledge-work-plugins`, `first-party-plugins`) and marketplaces added via claude.ai. **Off for third-party marketplaces.**
- `marketplace.json` has no field to enable it. A user turns it on in `/plugin` > Marketplaces, or an admin sets `autoUpdate` in `extraKnownMarketplaces`.
- It runs after the first message, with a random delay of up to 10 minutes. The running session keeps the old version until `/reload-plugins` or the next launch.
- Off switches: `DISABLE_AUTOUPDATER`, `DISABLE_UPDATES`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. `FORCE_AUTOUPDATE_PLUGINS=1` keeps plugin updates while turning off Claude Code's own.
- Without auto-update, users run `/plugin marketplace update <name>`.

---

## Part 2. Practices and nuances from the web

### 2.1 Naming

- Marketplace and plugin names: kebab-case, letters/digits/`.`/`_`/`-`.
- The entry name in the marketplace **must match** `name` in `plugin.json`. Otherwise you get `Plugin "<x>" not found in marketplace`.
- A plugin `name` is an immutable identifier. Change the label with `displayName`.
- Agent 2 reports that names with prefixes such as `claude-`, `anthropic-`, `cc-plugin-` fail validation, and that the whole words `claude`/`anthropic` produce a warning. Agent 1 did not mention this. Treat it with caution **[check manifest-reference, `name` section]**.
- wshobson/agents convention: lowercase, hyphen-separated, never `__`.

### 2.2 Versioning, releases, renames

- The main trap: `"version": "1.0.0"` that is never bumped means users receive none of the new commits. Either bump it on every release, or omit it everywhere and rely on the commit SHA.
- Set the version in one place only, preferably `plugin.json`.
- The `<plugin>--v<version>` git tag convention is used for dependency version resolution.
- There are no release channels. Use two marketplaces with different `name`s pointing at different `ref`s, and give the refs different versions.
- Removal and renames: add a top-level `renames` map (append-only), and optionally `forceRemoveDeletedPlugins: true`. There is no deprecation state. Without these, removed plugins stay installed and show `not found in marketplace`. A renamed plugin from a git/URL marketplace reports `not cached` until the user reinstalls once.
- No official changelog convention was found. A per-plugin `CHANGELOG.md` plus semver in `plugin.json` is the agent's inference **[unverified]**.
- Related bug reports (titles only, threads not read; all closed): anthropics/claude-code issues #36569 (stale cached 1.0.0), #36938, #14218.

### 2.3 README, licensing, security

README conventions in anthropics/claude-plugins-official:

- a warning that Anthropic cannot verify plugin contents;
- the install command `/plugin install {name}@{marketplace}`;
- a description of the plugin layout;
- the note "each plugin carries its own license".

Other practices:

- `plugin.json` supports `license` (SPDX), `homepage`, `repository`, `keywords`, `author`.
- Pin `sha` on external sources. `archive` sources should set `sha256` (otherwise `validate` warns). npm sources run no install scripts.
- Avoid `http://` MCP URLs and literal credentials in headers (`validate` warns).
- Keep secrets in `userConfig` with `sensitive: true`.
- Git LFS files arrive as pointer files, so keep LFS out of plugins.
- A top-level `bin/` directory is added to PATH, but claude.ai org-sync rejects plugins that have one. Use `scripts/` instead.
- Contributor policy example: CONTRIBUTING.md in wshobson/agents (disclosure requirements, no commercial funnels).

### 2.4 CI validation

- `claude plugin validate ./marketplace-root` checks: JSON syntax, required fields and naming, `..` in relative sources, unknown fields (as warnings), each relative-path plugin's `plugin.json`, and skill/agent/command frontmatter. Also run it on each plugin directory. `--strict` turns warnings into failures.
- **What validation does not catch** (marketplace-reference, "Failures that validation doesn't catch"):
  - a non-existent relative source directory passes `validate` and fails only at install (`Source path does not exist`);
  - fetch errors for remote sources;
  - entry-level `hooks` given as a file path or array: passes validation but never runs;
  - reserved names.

  Add a CI step that checks each `source` points to a real directory.
- A small practical example: `validate.yml` in wshobson/agents.
  - `python3 -m json.tool` on `marketplace.json`, every `plugin.json` and every `hooks/*.json`;
  - a script that checks each marketplace entry resolves to a real plugin directory;
  - `permissions: contents: read`, a SHA-pinned `actions/checkout`, and `persist-credentials: false`.
- The official repository has a heavy set of workflows: `validate-plugins`, `validate-frontmatter`, `validate-licenses`, `check-mcp-urls`, `scan-plugins`, `bump-plugin-shas` (nightly PRs bumping SHAs), `close-external-prs`, `external-pr-scope-guard`, `revert-failed-bumps`. This is overkill for a small marketplace.
- CI pitfall: a path-filtered required check never reports when no path matches, so the PR is blocked forever. PRs opened with `GITHUB_TOKEN` do not trigger `pull_request` workflows. If you use required checks, run them unconditionally.

### 2.5 Gotchas

1. **Relative paths and URL-added marketplaces.** If a user adds a bare `https://.../marketplace.json`, only that file is downloaded. A `./plugins/x` entry then fails with `its marketplace entry path does not stay inside the marketplace directory`. Fix: in the README, tell users to add the git repository (`owner/repo` or a `.git` URL), or use object sources (`github`, `git-subdir`, `archive`). For marketplaces with a `settings` source, relative paths are rejected outright.
2. **Stale version:** see 2.2.
3. **Auto-update is off for third-party marketplaces:** document in the README how to enable it, or how to run `/plugin marketplace update` manually.
4. **The cache copies only the plugin directory:** `../shared` does not work; use symlinks within the marketplace.
5. **Escaping the plugin directory:** `path escapes plugin directory`, `Path contains ".."`.
6. **`${CLAUDE_PLUGIN_ROOT}`:** changes with every version; keep state in `${CLAUDE_PLUGIN_DATA}`. Past bugs (closed): #9354, #22449, #18527 (Windows path separators).
7. **Hooks:**
   - `hooks/hooks.json` needs a top-level `"hooks"` key;
   - event names are case-sensitive;
   - two enabled plugins with the same name: only one registers its hooks, the other's silently do not run;
   - hooks declared in both the manifest and `hooks/hooks.json` are merged, so the same hook runs twice.
8. **Private repositories:** see 1.5. `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` helps users without a GitHub SSH key. `claude plugin install` from the shell may fall back to HTTPS on its own, but in-session install and updates do not.
9. **Limits:** git clone timeout is 120 s (`CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`), a hosted `marketplace.json` is limited to 5 MiB and a 10 s response, archive downloads to 256 MiB.
10. **Name collisions:** two marketplaces with the same `name` cannot both be registered; the `<owner>-<repo>` download folder name can also block a differently named marketplace.
11. **Key typos:** unknown fields load silently. Unknown keys inside strict objects (`userConfig`, `lspServers`) break plugin loading. Always run `validate --strict`.
12. **Metadata leak into cache:** marketplace fields `category` and `source` leaked into the cached `plugin.json` and caused `Unrecognized keys` errors. Fixed in v2.1.76 per a bot comment (issue #26555).
13. **Executable bits for hook scripts:** the docs do not mention `chmod +x`. Invoking via `bash "${CLAUDE_PLUGIN_ROOT}/scripts/x.sh"` avoids the issue, but that is the agent's inference, and whether file modes survive the cache copy was not established **[unverified]**.
14. **Install errors:** `Plugin archive integrity check failed` means the `sha256` pin does not match. `Git clone timed out after 120s`: raise the timeout or use `--sparse`. Diagnose git auth failures with `git ls-remote <url>`. A local-path marketplace does not need a `version` bump.

### 2.6 Notable marketplaces

| Repository | What it does well |
|---|---|
| anthropics/claude-plugins-official (~41k stars, Apache-2.0) | Split between `plugins/` (internal) and `external_plugins/` (third party), SHA-pinned externals, nightly bump PRs, policy scanning, `renames`, a separate license in each plugin |
| anthropics/claude-code, `plugins/` folder | Worked example plugins (`feature-dev`, `code-review`) |
| wshobson/agents (~41k stars, MIT) | 92 plugins in one marketplace, granular install to save tokens, `CONTRIBUTING.md`, `ARCHITECTURE.md`, a `Makefile` (`make validate`), a small `validate.yml` |
| davila7/claude-code-templates (~33k stars, MIT) | A CLI and template catalog; its marketplace structure was not inspected |
| jeremylongshore/tons-of-skills-marketplace (~2.8k stars, MIT) | Moved, now positioned as a skills platform; not inspected further |
| ananddtyagi/cc-marketplace (~688 stars) | Redirected from the old name, no license, last push January 2026, low activity |

Star counts and repository state are as reported by the agent and were not re-checked.

---

## Part 3. Checklist for our repository

1. `.claude-plugin/marketplace.json` at the root: `name` (not reserved), `owner.name`, `description`, `plugins[]`.
2. Plugins in `plugins/<kebab-name>/`, each with `.claude-plugin/plugin.json` containing `name`, `description`, `author`, `license`; components at the plugin root.
3. The name in `marketplace.json` matches `name` in `plugin.json`.
4. Version: either only in `plugin.json` and bumped on every release, or nowhere (then the version comes from the SHA).
5. All paths start with `./`, no `..`; hooks use a quoted `"${CLAUDE_PLUGIN_ROOT}"`; state goes in `${CLAUDE_PLUGIN_DATA}`.
6. README: the `/plugin marketplace add owner/repo` command (not a bare URL), `/plugin install name@marketplace`, a trust warning, the plugin list, how to enable auto-update, the license.
7. CI: `claude plugin validate . --strict`, plus `python3 -m json.tool` on all JSON, plus a check that every `source` exists. Required checks without path filters.
8. No LFS and no top-level `bin/`; use symlinks within the repository for shared code.
9. Before publishing, test locally: `claude plugin marketplace add ./` and `claude plugin install <plugin>@<marketplace>`.
10. When removing or renaming a plugin, add an entry to `renames`.
