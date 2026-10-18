---
name: frontend-architecture
description: "React/Next.js codebase architecture and organization (not performance). Use when deciding where a component, hook, constant, util, or business-logic function should live, or when reviewing/refactoring folder structure. Covers feature-based structure, component decomposition, business-logic placement (hooks/services/DAL), and Next.js App Router organization. See references.md for sources."
---

# Frontend Architecture

Where code should live, not how fast it runs. For code examples, see
[examples.md](examples.md). For the research this is based on, see
[references.md](references.md).

## Project mapping (fill in once per project)

Paths below (`src/features/...`, `app/lib/dal.ts`) are an example layout. The
project records its real layout in its own `AGENTS.md` (or `CLAUDE.md`); apply
the rules to that layout. If none is recorded, infer it from the repository,
state the mapping you assumed, and continue.

| Concept | Example layout (replace with the project's) |
|---|---|
| Frontend source root(s) | `src/`, `app/`, `apps/web/src/` |
| Feature folders | `src/features/<feature>/` |
| Shared layer (2+ features) | `src/{components,hooks,lib,utils,types}` |
| Data access layer | `src/lib/dal.ts`, `app/lib/dal.ts` |
| Composition layer (where features are combined) | `app/`, `src/pages/`, `src/routes/` |

## Severity Levels

- **CRITICAL** — Will cause tangled ownership, leaked secrets, or a codebase
  that can't be safely changed
- **HIGH** — Will hurt scalability as the app grows
- **MEDIUM** — Will hurt discoverability/consistency

---

## Feature-Based Structure (HIGH)

- Organize by feature/domain, not by technical role — avoid a global split
  into `containers/` vs `components/` vs `hooks/`
- Shape: `src/features/<feature>/{components,hooks,api,utils,types}` for
  domain code; `src/{components,hooks,lib,utils,types}` for code shared by
  2+ features
- Features must not import from each other — compose them only at the
  app/routing layer (enforceable via an ESLint import-boundary rule)
- Promote code from a feature to the shared layer only when a **second**
  consumer needs it — don't create the shared folder preemptively
- For midsize apps, organizing by technical concern first (all components
  together, all hooks together) is fine — switch to feature folders once
  that structure starts fighting the app's growth, not before

## Component Decomposition (HIGH)

- One component, one responsibility — when markup grows a loop or a
  conditional, extract it into its own component
- The component hierarchy should mirror the shape of the underlying data
  model, not just the visual mockup
- Don't force every component into a rigid container/presentational split —
  colocate state with whichever component is actually responsible for it
- A "reusable" component/hook with only one real consumer is premature —
  inline it until a second consumer proves the abstraction

## Business Logic Placement (CRITICAL)

- Business/domain logic lives in **hooks** (client-side) or a
  **services/data-access layer** (server-side) — never inline in a
  component body or JSX
- Custom hooks should name *what* the component wants ("useOnlineStatus"),
  not *how* it's implemented — only functions that call other hooks get the
  `use` prefix
- In Next.js, Server Actions/Server Functions are thin entry points: they
  call into a **Data Access Layer** (e.g. `app/lib/dal.ts`), not the other
  way around — don't embed queries or authorization logic directly in the
  action
- Every Server Function independently verifies auth/authorization — it's
  reachable via direct POST, not only through your UI
- Treat data crossing the Server→Client boundary (props into a Client
  Component) as a trust boundary — return DTOs from the DAL, not raw
  database rows

## Constants & Utils/Helpers (MEDIUM)

- Colocate constants and utils with the feature that uses them
- Promote to a shared `utils/`/`constants/` folder only once **two or
  more** features need the same code — not preemptively
- Prefer duplicating a small piece of logic over guessing at a shared
  abstraction before its real shape is clear ("prefer duplication over the
  wrong abstraction")
- Tests, styles, and helpers for a component belong next to that component,
  not mirrored into parallel `tests/`/`styles/` trees — the exception is
  e2e tests (project root) and docs/tests spanning multiple features

## Next.js App Router Organization (HIGH)

- Next.js is unopinionated about colocation: a route segment only becomes
  routable when it contains a `page`/`route` file, so non-route project
  files can safely live alongside it
- Use **private folders** (`_folder`) to hold non-routable UI/utils inside
  a route segment — separates UI logic from routing logic
- Use **route groups** (`(group)`) to organize routes by team/section, or
  to apply a layout to a subset of routes, without affecting the URL
- Server Components own data access and secrets by default; push
  `'use client'` down to the narrowest component that actually needs
  state/events/browser APIs, not up to a whole subtree
- Guard server-only modules with the `server-only` package so an accidental
  client import fails at build time instead of leaking a secret
- In monorepo-scale apps, push shared business logic into dedicated
  packages (e.g. a `database` package) so each app stays a thin,
  deployable consumer of shared services

## Open Questions (not yet resourced — see references.md)

- Barrel files (`index.ts` re-exports): pros/cons for module boundaries
- Concrete naming/scoping conventions for constants beyond the
  colocation/promotion rule above
