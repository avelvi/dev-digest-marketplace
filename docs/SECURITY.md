# Security policy

Plugins execute with the user's privileges (hooks, MCP servers, scripts). Treat every change to `plugins/` as a code change to software that runs on other people's machines.

## Permissions

- Hooks and scripts do only what the plugin's description says. Prefer the narrowest hook matcher.
- Do not read or write outside `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and the project directory without a documented reason.
- MCP servers use `https://`, never plain `http://`.

## Secrets

- Never commit tokens, keys or credentials, including in headers or example configs.
- Collect secrets from the user via `userConfig` with `sensitive: true`.
- The marketplace has no token field. Access to this private repository relies on the user's own git credentials (SSH key or `gh auth setup-git`).
- If a secret is committed, rotate it first, then remove it from history.

## Reviewing scripts

Before merging a PR that adds or changes a script, hook, or MCP config:

1. Read every line; no obfuscation, no `curl | sh`, no downloading and executing remote code.
2. Check what it touches: files, network, environment variables.
3. Check that variables are quoted and inputs are not interpolated into shell commands.
4. Confirm it works when the install path contains spaces.

## Supply chain

- Pin external sources to a full `sha`. For `archive` sources set `sha256`.
- Do not use `npm` sources without a pinned `version`.
- Third-party plugins keep their own license and are reviewed like first-party code.

## CI and repository

- CI runs with `permissions: contents: read`, a SHA-pinned `actions/checkout`, and `persist-credentials: false`.
- `.github/CODEOWNERS` requires owner review for `.claude-plugin/`, `.github/` and `scripts/`.
- Enable branch protection on `main` and require the `validate` check.

## Reporting

Report a suspected vulnerability privately to the repository owner; do not open a public issue.
