# dev-digest-marketplace

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace.md) for the dev-digest project. The catalog lives in `.claude-plugin/marketplace.json`; plugins live in `plugins/`.

> **Trust warning.** Plugins can run code on your machine (hooks, MCP servers, scripts). Read a plugin before installing it. Nothing here is verified by Anthropic.

## Add the marketplace

Add it by repository (`owner/repo`), **not** by a raw URL to `marketplace.json`. With a bare URL only that one file is downloaded, and relative plugin paths such as `./plugins/x` fail.

```
/plugin marketplace add avelvi/dev-digest-marketplace
```

The repository is private, so git must already have credentials: an SSH key loaded in your agent with the host in `known_hosts`, or HTTPS via `gh auth login && gh auth setup-git`. Claude Code never prompts for a password. `GITHUB_TOKEN` alone is not enough.

## Install a plugin

```
/plugin install <plugin-name>@dev-digest-marketplace
```

Always include `@dev-digest-marketplace`; without it only cached catalogs are searched.

## Plugins

| Plugin | What it gives you | Depends on |
|---|---|---|
| [`sdd-engineering`](plugins/sdd-engineering/README.md) | Spec Driven Development: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier` agents; `run-plan` and `workflow-retro` skills | the three below |
| [`engineering-paved-path`](plugins/engineering-paved-path/README.md) | Architecture, React, Fastify, testing and security skills | none |
| [`research-tools`](plugins/research-tools/README.md) | Read-only `researcher` agent | none |
| [`architecture-review`](plugins/architecture-review/README.md) | Read-only `architecture-reviewer` agent | `engineering-paved-path` |

Installing `sdd-engineering` pulls in the other three automatically. Design: [docs/SDD-PLUGINS-SPEC.md](docs/SDD-PLUGINS-SPEC.md). To add another plugin, follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Updates

Auto-update is **off** by default for third-party marketplaces. Turn it on in `/plugin` > Marketplaces, or refresh manually:

```
/plugin marketplace update dev-digest-marketplace
```

A plugin with a pinned `version` only updates when that version changes. See [docs/RELEASES.md](docs/RELEASES.md).

## Repository layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | The catalog |
| `plugins/` | One directory per plugin |
| `docs/` | Plugin guidelines, security policy, release process |
| `scripts/validate-marketplace.mjs` | Structural linter (Node, no dependencies) |
| `scripts/release.mjs`, `scripts/rollback.mjs` | Version bump, tagging, rollback and emergency removal ([docs/RELEASES.md](docs/RELEASES.md)) |
| `.github/` | CI, PR template, CODEOWNERS |

## Validate locally

```
node scripts/validate-marketplace.mjs --strict
claude plugin validate . --strict
```
