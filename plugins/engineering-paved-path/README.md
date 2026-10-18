# engineering-paved-path

A bundle of six engineering skills for the common web stack: React, Fastify, testing, layered architecture and security. The skills are plain Markdown knowledge that Claude loads on demand, so a project gets consistent guidance for where code should live, how to test it and what to avoid, without writing its own rules first.

The other plugins in this marketplace depend on this one: `architecture-review` audits code against its architecture skills, and `sdd-engineering` agents load the right skills while specifying, planning and implementing.

## Install

```
/plugin install engineering-paved-path@dev-digest-marketplace
```

Installing `architecture-review` or `sdd-engineering` installs this plugin automatically. Install it directly if you only want the skills.

## What's inside

| Skill | Scope | Loads when you... | Used by |
|---|---|---|---|
| `onion-architecture` | Backend | write or review a route/controller, service, repository or port; ask where backend logic belongs; mention layering, hexagonal or clean architecture | `architecture-review` (backend layering audit), `sdd-engineering` spec-creator, implementation-planner, implementer |
| `frontend-architecture` | Frontend (React / Next.js) | decide where a component, hook, constant or business-logic function lives; refactor folder structure | `architecture-review` (UI audit), `sdd-engineering` spec-creator, implementation-planner, implementer |
| `react-best-practices` | Frontend | write or refactor React components, hooks and state | `sdd-engineering` implementer (UI work items) |
| `react-testing-library` | Frontend testing | write component tests with React Testing Library and Vitest | `sdd-engineering` implementer / anyone writing UI tests |
| `fastify-best-practices` | Backend (Fastify) | build or debug a Fastify app: routes, plugins, schemas, hooks, auth, deployment | `sdd-engineering` implementer (backend work items) |
| `security` | Full stack | review code for vulnerabilities, handle auth, input, uploads, secrets (OWASP Top 10:2025) | `architecture-review`, `sdd-engineering` spec-creator |

Each skill folder has a `SKILL.md` (rules with severities) and, where useful, `examples.md` (good and bad code), `references.md` (sources) and `checklists.md`.

## How to use

Claude picks a skill by its description, so ordinary requests are enough: "where should this logic live?", "review this route for layering problems", "write tests for this form". To force one, or to call it from your own agent, use the namespaced name with the Skill tool or a slash command:

```
/engineering-paved-path:onion-architecture
/engineering-paved-path:security
```

In an agent or skill prompt, write "load `engineering-paved-path:frontend-architecture` with the Skill tool". Plugin skills are always addressed with the `engineering-paved-path:` prefix from other plugins.

## Make the architecture skills fit your project

`onion-architecture` and `frontend-architecture` state universal rules (dependencies point inward, no business logic in handlers or components, ORM access only in the repository, features do not import each other). The file and folder names in their examples are only an example layout.

Each skill opens with a **Project mapping** table. Record your real layout once in your project's `AGENTS.md` (or `CLAUDE.md`):

- where transport (routes/controllers), services, repositories/ports, domain core and the composition root live;
- the repository class naming convention and where shared contracts (DTO schemas) live;
- for the frontend: source roots, feature folders, the shared layer, the data access layer;
- any known, pre-existing violations you do not want fixed opportunistically.

Without a mapping, the skills infer the layout from the repository and say which mapping they assumed.

## Requirements

None to install. The skills assume TypeScript examples; the rules apply to any language that separates transport, business logic and persistence. Stack-specific skills (React, Fastify, React Testing Library) apply only when the project uses that tool.

## Not bundled

- **Next.js guidance.** The upstream skill (`vercel-labs/next-skills`) publishes no license, so it cannot be redistributed here. You can install it yourself from that repository. `frontend-architecture` still covers Next.js App Router organization (private folders, route groups, server/client boundary, data access layer).
- Other stack skills (TypeScript, Zod, Drizzle, PostgreSQL design) are not part of 1.0.0.

## Source and licenses

Original repository: <https://github.com/avelvi/dev-digest> (branch `dev`, commit `fae4c27`). Skills were copied from `.claude/skills/` there and generalized: project-specific paths, package names and examples were replaced with neutral ones.

| Skill | Origin | License |
|---|---|---|
| `fastify-best-practices` | Third party: `mcollina/skills`, path `skills/fastify`, pinned commit `df621544c85070fd19766fe8037f950b3e2cbc7d`. Content is unchanged | MIT, (c) 2026 Matteo Collina. License file present: `skills/fastify-best-practices/LICENSE` |
| `onion-architecture`, `frontend-architecture` | Written in the original repository, then generalized for this plugin | See the plugin `LICENSE` |
| `react-best-practices`, `react-testing-library`, `security` | Present in the original repository's `.claude/skills/`. The original `skills-lock.json` records no upstream for them. `react-testing-library` describes itself as a rewrite of an earlier skill whose origin is not recorded; `security` and the architecture skills cite public sources (OWASP, Palermo, Martin, Next.js docs) in `references.md` | Provenance to be verified before the 1.0.0 release |

## Versioning

Semantic Versioning, recorded in `plugin.json`. See [CHANGELOG.md](CHANGELOG.md) for what changed in each release. Removing or renaming a skill is a major change, because other plugins depend on these names (`^1.0.0`).
