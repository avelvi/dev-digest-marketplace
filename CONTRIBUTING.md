# Contributing

How to change the catalog safely. Read [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md), [docs/SECURITY.md](docs/SECURITY.md) and [docs/RELEASES.md](docs/RELEASES.md) first.

## Add a plugin

1. Create `plugins/<kebab-name>/` with `.claude-plugin/plugin.json` and components (`skills/`, `agents/`, `hooks/hooks.json`, `scripts/`) at the plugin root.
2. Add an entry to `.claude-plugin/marketplace.json`:
   ```json
   { "name": "<kebab-name>", "source": "./plugins/<kebab-name>", "description": "..." }
   ```
   The entry `name` must equal `name` in `plugin.json`.
3. Add a per-plugin line to `.github/CODEOWNERS`.
4. Run the validators (below) and open a pull request using the template.

## Change or remove a plugin

- Never change a plugin `name`; it is an identifier. Use `displayName` for a label.
- To rename or remove a plugin, add it to the top-level `renames` map in `marketplace.json` (old name to new name, or `null`). `renames` is append-only.
- Bump the version with `node scripts/release.mjs bump <plugin> <major|minor|patch>`; tagging and rollback are described in [docs/RELEASES.md](docs/RELEASES.md).

## Validate before opening a PR

```
node scripts/validate-marketplace.mjs --strict
claude plugin validate . --strict
claude plugin marketplace add ./
claude plugin install <plugin>@dev-digest-marketplace
```

`claude plugin validate` does not catch a missing relative `source` directory, fetch errors, or entry-level `hooks` given as a path; the Node linter covers the first and last.

## Rules of thumb

- Paths start with `./`, never contain `..`, and stay inside the plugin directory.
- No secrets in the repo. Use `userConfig` with `sensitive: true`.
- Review any new script or hook line by line; reviewers should do the same.
- Do not use Git LFS or a top-level `bin/` directory in plugins.
- Keep CI checks unfiltered by path so they can be required.
