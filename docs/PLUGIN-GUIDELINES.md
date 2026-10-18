# Plugin guidelines

Source of truth: https://code.claude.com/docs/en/plugins/manifest-reference.md. Background and caveats are in [tmp/MARKETPLACE-RESEARCH.md](tmp/MARKETPLACE-RESEARCH.md).

## Structure

```
plugins/<kebab-name>/
├── .claude-plugin/plugin.json     # the ONLY thing inside .claude-plugin/
├── skills/<name>/SKILL.md
├── agents/*.md
├── hooks/hooks.json               # top-level "hooks" key, case-sensitive event names
├── .mcp.json
├── scripts/                       # helper scripts (not bin/)
├── README.md
└── LICENSE
```

Components placed inside `.claude-plugin/` are not loaded. A `CLAUDE.md` at the plugin root is not loaded either; put instructions in a skill. Prefer `skills/` over the legacy `commands/`.

## Manifest (`plugin.json`)

- Required: `name` (kebab-case, no spaces, `@` or `:`).
- Always set `description`, `author` and `license` (SPDX); the validator warns without them.
- Do not use `claude-`/`anthropic-` name prefixes.
- Component paths are relative to the plugin root, start with `./`, contain no `..`, and must exist.

## Marketplace entry

- Entry `name` equals the manifest `name`.
- `strict` defaults to `true`. Use `strict: false` only for entries without a `plugin.json`; declaring components in an entry that also has a `plugin.json` makes the plugin fail to load.
- Prefer relative `./plugins/<name>` sources. For third-party code use `github`/`git-subdir` and pin a full 40-character `sha`.

## Isolation and paths

- The plugin directory is copied to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Anything outside it (such as `../shared`) is not available.
- `${CLAUDE_PLUGIN_ROOT}` changes on every version. Keep persistent state in `${CLAUDE_PLUGIN_DATA}`.
- Quote the variable in shell-form hooks (`"\"${CLAUDE_PLUGIN_ROOT}\"/scripts/x.sh"`) or use exec form with `args`. Call scripts through an interpreter (`bash "${CLAUDE_PLUGIN_ROOT}/scripts/x.sh"`) so the executable bit does not matter.
- Do not declare the same hook in both the manifest and `hooks/hooks.json`; it runs twice.

## Dependencies

- Plugins that depend on others declare `dependencies`; cross-marketplace dependencies need `allowCrossMarketplaceDependenciesOn` in `marketplace.json`.
- npm sources do not run install scripts. Vendor what the plugin needs; do not rely on a post-install step.
- No Git LFS: LFS files arrive as pointer files.
