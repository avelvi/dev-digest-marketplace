# architecture-review

A read-only `architecture-reviewer` agent that audits whether code conforms to layered-architecture rules (entry point -> service -> port -> adapter on a backend; feature boundaries and logic placement on a frontend). It proves every violation with a concrete import chain and a concrete consequence, and it never edits files. It works on any project: you tell it which directories play which role, and it applies a set of generic, falsifiable predicates.

## Install

```
/plugin install architecture-review@dev-digest-marketplace
```

This plugin **requires `engineering-paved-path`** (range `^1.0.0`). Claude Code installs and enables it automatically as a dependency. The reviewer loads three of its skills before it starts: `engineering-paved-path:onion-architecture`, `engineering-paved-path:frontend-architecture` and `engineering-paved-path:security`.

## What's inside

| Component | Kind | What it does |
|---|---|---|
| `architecture-reviewer` | agent (tools: Read, Grep, Glob, Bash) | Reviews a scope for layering violations and returns a findings report plus a JSON verdict |
| `rules/predicates.md` | generic rules | Predicate table: IDs, patterns, tiers, consequence templates, baseline schema |
| `references/project-rules.example.md` | template | How a project maps its own directories to layers and adjusts predicates |
| `references/baseline.example.json` | template | Shape of the baseline file that suppresses known, tracked violations |

## How to use

Ask for the agent by its namespaced name and give it a scope:

```
Use the architecture-review:architecture-reviewer agent on src/modules/orders
Use the architecture-review:architecture-reviewer agent on the changes in this PR
Use the architecture-review:architecture-reviewer agent on the whole repository
```

The scope is required. If you do not give one, the agent asks. A scope can be a directory or module, a PR or diff, a changed-file manifest, or the whole repository. With a manifest or patch path the agent reads only those files plus their direct imports.

### Inputs and defaults

| Input | Default | Meaning |
|---|---|---|
| scope | none (asked) | What to review |
| rules file | `.claude/architecture-review-rules.md` | Your layer mapping, predicate changes and extra predicates |
| baseline file | `.claude/architecture-review-baseline.json` | Known violations to report as baseline-suppressed |
| prior findings + fix manifest | not set | Switches on recheck mode |

State a different path in your request to override a default. When the agent falls back to a default it says so under the report header.

### Findings and tiers

| Tier | Meaning |
|---|---|
| BLOCKING | A new violation of a BLOCKING-tier predicate that is not in the baseline |
| ADVISORY | A consistency-only issue, an ADVISORY-tier predicate, or a violation already recorded in the baseline |

Every finding is one line: `file:line - chain - consequence`, tagged with a predicate ID. The report ends with a JSON verdict (`verdict`, counts, `findings[]` with ids `F-1`, `F-2`, ...) so an orchestrator can parse it.

### Recheck mode

After a fix round, pass the previous findings (ids and `file:line`) and the list of files the fixes touched. The agent then marks each prior finding `RESOLVED` or `STILL OPEN` with the line that proves it, and reviews only the touched files for new violations. It does not re-audit untouched files.

### Supplying project rules

1. Copy `references/project-rules.example.md` to `.claude/architecture-review-rules.md`.
2. Replace the example globs with your directories for entry points, services, ports, adapters, the composition root, pure core modules, features and view components.
3. Disable predicates you do not want, change tiers, or add predicates under your own prefix.

If the file is missing, the agent infers the layout from your `AGENTS.md`/`CLAUDE.md` and directory structure, prints the mapping it assumed, and still applies the generic predicates.

### Baseline

The baseline lists violations that already exist and are tracked, so they do not block new work. Copy `references/baseline.example.json` to `.claude/architecture-review-baseline.json`. Each entry has `file`, `predicate`, `reason`, `added_by` and `added_on`. The agent never edits this file; when a finding looks pre-existing it proposes an entry in its report for a human to add.

## Requirements and conventions

- A project that follows (or wants to follow) a layered structure. The predicates assume services are separated from transport and persistence code.
- Optional but recommended: a rules file with your layer mapping, and a baseline file if the code already has known violations.
- `engineering-paved-path` installed (automatic).

## Limits and non-goals

- Read-only: no Write, Edit or NotebookEdit tools, and Bash is limited to read-only inspection.
- Reports findings; never proposes or applies fixes.
- Layering only. It is not a correctness, style or general security review.
- Generated and vendored code (migrations, `vendor/`, lockfiles, build output) is out of scope unless your rules file says otherwise.
- Nothing is persisted: if you want a report file for a later recheck, save the returned report yourself.

## Source

Ported from the `architecture-reviewer` agent in <https://github.com/avelvi/dev-digest> (branch `dev`, commit `fae4c27`, path `.claude/agents/architecture-reviewer.md` and its rules and baseline files), with project-specific names removed and the predicates rewritten in terms of layers.

## Versioning

Semantic versioning, set in `.claude-plugin/plugin.json`. Release history is in [CHANGELOG.md](CHANGELOG.md).
