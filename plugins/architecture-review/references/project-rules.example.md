# Architecture review rules (project extension) - EXAMPLE

Copy this file to `.claude/architecture-review-rules.md` in your project (or pass another path to the agent) and replace the globs with your own. Everything below is an example layout, not a convention the plugin assumes.

## Layer mapping

| Layer / role | Globs |
|---|---|
| entry point | `src/modules/*/routes.ts`, `src/cli/**` |
| service | `src/modules/*/service.ts`, `src/domain/**` |
| port | `src/modules/*/ports.ts`, `src/ports/**` |
| adapter | `src/adapters/**`, `src/db/**` |
| composition root | `src/container.ts` |
| pure core | `packages/core/src/**` |
| feature | `web/src/features/*/**` |
| view component | `web/src/**/*.tsx` (excluding hooks and data-access files) |

## Public contracts

- Shared types live in `packages/shared`; importing them from anywhere is allowed.
- Generated or vendored code (`**/vendor/**`, `**/migrations/**`) is out of scope: never report findings inside it.

## Predicate changes

| Predicate | Change |
|---|---|
| `layering.entry-does-too-much` | promote to BLOCKING |
| `frontend.logic-in-component` | disabled for `web/src/legacy/**` |

## Additional predicates

| Predicate ID | Pattern (import/usage) | Forbidden in | Tier | Consequence template |
|---|---|---|---|---|
| `acme.no-direct-fetch` | `fetch(` or an HTTP client import | services, features (use the API client module) | BLOCKING | requests bypass auth and retry handling in the API client |

## Notes for the reviewer

- Entry points may import the composition root's exported types only.
- The `src/legacy/` tree is being migrated; report its violations as ADVISORY.
