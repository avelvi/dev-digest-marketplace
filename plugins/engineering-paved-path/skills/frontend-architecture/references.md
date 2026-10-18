# References — Frontend Architecture

Curated sources for the `frontend-architecture` skill. Focus: code
organization / structure, not performance. Every URL below was fetched and
verified (not guessed). Used as the source material for `SKILL.md` (to be
written in a follow-up step) — kept here so the research isn't lost.

## 1. Component location & decomposition

- **React docs — Thinking in React**
  https://react.dev/learn/thinking-in-react
  Official approach to breaking a UI into components: separation of
  concerns, matching the component hierarchy to the shape of the underlying
  data model.
- **Alex Kondov — Tao of React**
  https://alexkondov.com/tao-of-react/
  Keep components small and single-purpose (extract loops/conditionals into
  their own component); rejects the classic container/presentational split
  in favor of state living close to whichever component is "responsible"
  for it.
- **patterns.dev — React design patterns**
  https://www.patterns.dev/react
  Catalog of composition patterns: HOC, Hooks pattern, Compound Components,
  Container/Presentational, Render Props.

## 2. Where business logic lives (hooks vs. services vs. components)

- **React docs — Reusing Logic with Custom Hooks**
  https://react.dev/learn/reusing-logic-with-custom-hooks
  When to extract a custom hook: it should communicate *what* the component
  wants to do, not *how*; only `use`-prefixed functions should call other
  hooks (enables lint enforcement of the Rules of Hooks).
- **Alex Kondov — Tao of React**
  https://alexkondov.com/tao-of-react/
  Prefers hooks over HOCs/render props for business logic, since hooks let a
  component consume multiple sources of external functionality without prop
  drilling or obscured ownership.
- **Next.js docs — Mutating Data (Server Functions / Server Actions)**
  https://nextjs.org/docs/app/getting-started/mutating-data
  Server Actions belong in dedicated files (e.g. `app/lib/actions.ts`), not
  inlined in components; every Server Function must independently verify
  auth/authorization since it's reachable directly via POST.
- **Next.js docs — Authentication guide (Data Access Layer)**
  https://nextjs.org/docs/app/guides/authentication
  Prescribes a dedicated Data Access Layer (`app/lib/dal.ts`) that
  centralizes authorization/data logic; Server Actions, Route Handlers, and
  Server/Client Components all call into it instead of embedding business
  logic in route files.
- **Vercel/Next.js blog — How to Think About Security in Next.js**
  https://nextjs.org/blog/security-nextjs-server-components-actions
  Author: Sebastian Markbåge (React core team). Names three data-handling
  models (HTTP APIs, Data Access Layer, Component-Level Data Access) and
  argues the DAL + DTO pattern is "the recommended approach for new
  projects"; treats Client Component props as a trust boundary. Widely
  cited as the definitive take on where domain logic should sit relative to
  the RSC boundary.
- **The Road to Next** — Robin Wieruch
  https://www.road-to-next.com/
  Community-level elaboration of the DAL idea into an explicit layered
  backend architecture for App Router apps: Action Layer → Service Layer →
  Data Access Layer → DTOs, with Server Actions as thin RPC-style entry
  points.

## 3. Constants & utils/helpers placement

- **Kent C. Dodds — Colocation**
  https://kentcdodds.com/blog/colocation
  "Place code as close to where it's relevant as possible" — applies to
  tests, styles, and utility functions alike. Exceptions: cross-cutting
  docs/integration tests (shared parent folder) and e2e tests (project
  root, since they don't map to `src/`).
- **Kent C. Dodds — AHA Programming (Avoid Hasty Abstractions)**
  https://kentcdodds.com/blog/aha-programming
  When to promote something to a shared util/constant: not preemptively —
  tolerate duplication until a repeated pattern reveals the right shape of
  the abstraction ("prefer duplication over the wrong abstraction").
- **Robin Wieruch — React Folder Structure**
  https://www.robinwieruch.de/react-folder-structure/
  Concrete promotion rule: a util/hook/constant lives inside the feature
  that uses it; it only moves to a shared top-level folder once **two or
  more** features need it. Same rule applies uniformly to hooks, context,
  and components.

## 4. Overall `src/` structure for scaling apps

- **Bulletproof React** — Alan Alickovic and contributors
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
  Widely-cited (60k+ stars) reference architecture: `src/features/<feature>/
  {api,components,hooks,stores,types,utils}` for domain code, shared code in
  top-level `src/{components,hooks,lib,types,utils}`, an `app` layer that
  composes routes/providers. Forbids cross-feature imports (enforced via
  ESLint `import/no-restricted-paths`); "unidirectional architecture":
  shared → features → app. Docs explicitly note the same structure adapts
  to Next.js.
- **Robin Wieruch — React Folder Structure**
  https://www.robinwieruch.de/react-folder-structure/
  Progression as apps scale: by-technical-concern (midsize apps) → by-feature
  (growing apps) → domain folders / packages / monorepo (very large apps) —
  the shared-vs-feature split stays consistent throughout.
- **Alex Kondov — Tao of React**
  https://alexkondov.com/tao-of-react/
  Organize files by module/domain rather than by technical role (no
  separate `containers/` vs `components/`), plus one shared "common" module
  for generic reusable pieces (buttons, inputs).

## 5. Next.js App Router — project organization

- **Next.js docs — Project Structure and Organization** (official)
  https://nextjs.org/docs/app/getting-started/project-structure
  Deliberately "unopinionated": files are only routable once a `page`/
  `route` file exists, so project files can be safely colocated inside
  route segments. Covers private folders (`_folder`, opts a subtree out of
  routing — separates UI from routing logic, avoids naming collisions with
  future conventions), route groups (`(folder)`), the optional `src/`
  folder, and three named strategies (files outside `app`, files in a
  top-level folder inside `app`, split by feature/route).
- **Next.js docs — Route Groups** (official)
  https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
  `(folder)` organizes routes by team/concern without affecting the URL;
  supports multiple root layouts and opting specific segments into a shared
  layout.
- **Next.js docs — Server and Client Components** (official)
  https://nextjs.org/docs/app/getting-started/server-and-client-components
  Ownership boundary: Server Components by default (data access, secrets,
  less shipped JS); Client Components only where state/events/browser
  APIs/custom hooks are needed. Pattern: push `'use client'` as far down the
  tree as possible; `server-only`/`client-only` packages guard against
  environment poisoning.
- **Next.js docs — The Server and Client Boundary** (official, deeper dive)
  https://nextjs.org/docs/app/guides/server-and-client-boundary
  Goes further into module-graph mechanics — why compound components can
  break across the boundary, and why the boundary should sit at the
  narrowest entry point rather than marking large subtrees client-side.
- **The Road to Next** — Robin Wieruch
  https://www.road-to-next.com/
  App-Router-specific course teaching Feature Folders / Shared Folders / App
  layer as a concrete answer to where colocated vs. top-level code should
  live, plus dedicated modules on route groups and private folders.

## 6. Real-world example repos (full recommended structure)

- **next-forge** — Hayden Bleasel
  https://www.next-forge.com/docs/structure
  Production-oriented Turborepo template for Next.js SaaS apps: each `app`
  stays self-contained/deployable while shared business logic moves into
  dedicated `packages/*` (e.g. a `database` package), with Turborepo
  "boundaries" enforcing the separation — a monorepo-scale extension of the
  "keep code outside `app`" strategy.
- **Next.js Commerce** — Vercel
  https://github.com/vercel/commerce
  Vercel's own actively-maintained App Router reference app (RSC, Server
  Actions, `Suspense`, `useOptimistic`) with a swappable `lib/<provider>`
  data layer (e.g. `lib/shopify`) — a real-product example of the
  services/data-access separation described in section 2.

## Not yet covered / possible gaps for a follow-up pass

- No dedicated source yet on **barrel files** (`index.ts` re-exports) —
  pros/cons for module boundaries; worth a targeted search before writing
  `SKILL.md`.
- No source yet specifically on **naming/scoping conventions for constants**
  beyond the general colocation/promotion rules above.
