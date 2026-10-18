# research-tools

A read-only `researcher` agent. It investigates one concrete question, either inside your project's repository (code, docs, config, git history) or from external sources (web documentation, specs, changelogs), and returns a short structured report: findings, evidence, references and what it could not determine. It never modifies anything.

## Install

```
/plugin install research-tools@dev-digest-marketplace
```

No dependencies. It is also pulled in automatically by `sdd-engineering`.

## What's inside

| Component | Kind | What it does |
|---|---|---|
| `researcher` | agent (tools: Read, Grep, Glob, Bash, WebFetch, WebSearch) | Answers a question from the repository, the web, or both, and reports with evidence |

## How to use

Ask for the agent by its namespaced name:

```
Use the research-tools:researcher agent to find where retries are configured and why the timeout is 30 seconds
Use the research-tools:researcher agent to check what changed in the Fastify 5 plugin lifecycle, from the official docs
Use the research-tools:researcher agent: how do we handle pagination in this codebase, and what does the JSON:API spec recommend?
```

Good prompts name a specific, answerable question and a target (this repository, external sources, or both). Several researchers can run in parallel on separate areas; each stays inside its assigned area.

### Interview mode

If the request has no concrete question (for example just "research caching"), or something material is ambiguous (target, scope, a term that could mean several things), the agent stops and asks its clarifying questions in one batch before it touches any tool. It does not guess. If the request is already specific, it skips the interview and starts.

### Two kinds of research

| Kind | Sources | Evidence looks like |
|---|---|---|
| Repository | `Grep`, `Glob`, `Read`, read-only `git log`/`blame`/`show` | `path/to/file:42` lines and commit SHAs |
| External | `WebSearch`, `WebFetch`; prefers primary sources and notes dates | quoted excerpts with source title and URL |

A task that needs both gets a single report with a `Repository research` and an `External research` section.

### Output shape

```
## Research: <question>
### Findings            numbered, direct claims
### Evidence            file:line, commit, or quoted excerpt for every finding
### References          deduplicated paths, SHAs or URLs
### Could not determine what it could not answer, and why
```

The report is capped at roughly 400 words and returned in chat. Nothing is written to disk.

## Requirements and conventions

None required. If the project has an `AGENTS.md` or `CLAUDE.md`, the agent reads the parts relevant to the question to learn where vendored or generated code lives.

## Limits and non-goals

- No Write or Edit tools; Bash is for read-only inspection and search only.
- It does not use a `/deep-research` command, even if asked.
- It reports what exists, not what should exist: no recommendations or fixes.
- Every finding must have evidence; anything it cannot support goes under "Could not determine".

## Source

Ported from the `researcher` agent in <https://github.com/avelvi/dev-digest> (branch `dev`, commit `fae4c27`, path `.claude/agents/researcher.md`), with project-specific wording removed.

## Versioning

Semantic versioning, set in `.claude-plugin/plugin.json`. Release history is in [CHANGELOG.md](CHANGELOG.md).
