# Architecture Reviewer - generic predicate table

Reference file for the `architecture-reviewer` agent. Each predicate is a falsifiable, evidence-checkable rule. Every finding must cite the actual import chain that matched it, not just the predicate name.

The predicates are written in terms of **layers** and **roles**, not directory names. The project maps its own directories to those layers in its rules file (see "Project mapping").

## Layers and roles used below

| Term | Meaning |
|---|---|
| entry point | Code that receives external input: HTTP route handlers, controllers, CLI commands, queue consumers |
| service | Business logic / use cases. Must stay free of framework and infrastructure details |
| port | An interface the service depends on (repository, gateway, clock, mailer, ...) |
| adapter | A concrete implementation of a port: database client or ORM, HTTP client, SDK wrapper, filesystem |
| composition root | The single place where adapters are chosen and wired to services (container, bootstrap, main) |
| feature | A self-contained slice of a frontend (components, hooks, data access for one business capability) |
| view component | A UI component that renders markup |
| hook / service (frontend) | Where stateful or business logic for a feature belongs |

## Predicates

| Predicate ID | Pattern (import/usage) | Forbidden in | Tier | Consequence template |
|---|---|---|---|---|
| `layering.entry-persistence` | Entry point imports or uses a persistence object directly (ORM table or query builder, raw SQL client) | entry points | BLOCKING | bypasses the service layer; swapping the database driver would require touching the entry point |
| `layering.adapter-outside-root` | Direct import of a concrete adapter (LLM client, VCS client, secrets store, SDK wrapper, ...) instead of a port injected from the composition root | anywhere outside the composition root | BLOCKING | swapping that adapter would require editing this file instead of only the composition root |
| `layering.framework-in-service` | Framework request/response objects or transport types (HTTP request/reply, framework decorators) imported into business logic | services, domain code | BLOCKING | the service cannot be reused or tested without the web framework |
| `layering.entry-does-too-much` | Entry point doing more than validate input, call one service method, map the result to a response | entry points | ADVISORY (HIGH) | business rules are duplicated per transport and cannot be unit-tested without the framework |
| `layering.service-leak` | Persistence row type or ORM-inferred type exposed through a service's public API | service public API | ADVISORY (HIGH) | hurts testability and swappability, but does not skip a layer |
| `layering.core-side-effect` | A module declared as a pure core performs I/O (network, filesystem, clock, randomness) other than through an injected port | pure core modules | BLOCKING | the core can no longer be tested deterministically or reused in another host |
| `frontend.cross-feature` | One feature directly imports another feature's internals | feature directories | BLOCKING | features can no longer be composed independently; a change to B ripples into A untracked |
| `frontend.logic-in-component` | Branching or data-transform business logic inline in a view component body or JSX | view components (not hooks, not data-access modules) | BLOCKING | logic cannot be reused or unit-tested without mounting the component |

A project may add predicates in its rules file under its own prefix (for example `acme.no-direct-fetch`). Use the same columns.

## Tier definitions

- **BLOCKING** - a new occurrence of any predicate above tagged BLOCKING, not already in the baseline file.
- **ADVISORY** - any predicate tagged ADVISORY, any MEDIUM/HIGH-tier consistency-only issue that is not a hard layer skip, or any predicate already recorded in the baseline file (reported as baseline-suppressed).

## Project mapping

The plugin does not know your directory names. The project supplies a rules file (default `.claude/architecture-review-rules.md`; the caller may pass another path) that says:

1. Which globs are entry points, services, ports, adapters, the composition root, pure core modules, features and view components.
2. Which predicates to disable, and any predicates to add.
3. Any tier overrides (for example promoting `layering.entry-does-too-much` to BLOCKING).

If the rules file is missing, the agent infers the layout from the project's `AGENTS.md`/`CLAUDE.md` and the directory structure, states the mapping it assumed at the top of its report, and still applies the predicates above. A template is in `${CLAUDE_PLUGIN_ROOT}/references/project-rules.example.md`.

## Baseline file schema

The baseline lists known violations that are tracked and must not block. Default path `.claude/architecture-review-baseline.json` (the caller may pass another). A template is in `${CLAUDE_PLUGIN_ROOT}/references/baseline.example.json`.

```json
{
  "ignored": [
    {
      "file": "src/modules/example/service.ts",
      "predicate": "layering.service-leak",
      "reason": "pre-existing, tracked for a future refactor",
      "added_by": "example-user",
      "added_on": "2026-01-01"
    }
  ]
}
```

Fields: `file` (path relative to the project root), `predicate` (a predicate ID), `reason`, `added_by`, `added_on` (ISO date). The agent never edits this file; it proposes entries in its report for a human to add.

Update this table whenever a new generic predicate is needed. This file is the single source of truth for severity; the agent prompt only describes how to apply it.
