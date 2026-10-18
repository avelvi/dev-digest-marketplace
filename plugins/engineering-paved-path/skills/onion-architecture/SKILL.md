---
name: onion-architecture
description: "Enforces Onion / layered architecture for backend code: dependencies point inward only (transport/routes -> service -> repository/ports -> domain core), transport handlers stay thin, and ORM/database access is confined to the repository layer. Use when writing or reviewing an HTTP route/controller/handler, a service or use-case class, a repository or port/adapter, any feature-module file in a backend, a framework-free core module, or when asked about layering, dependency direction, ports and adapters, hexagonal/clean/onion architecture, or where backend logic should live. Trigger terms: onion architecture, layering, dependency rule, ports and adapters, hexagonal architecture, clean architecture, business logic in routes, thin controller, repository pattern, composition root, dependency injection."
---

# Onion Architecture (Backend)

Where backend logic should live, not how fast it runs. Applies to any backend
module that separates transport, business logic and persistence. For code
examples, see [examples.md](examples.md). For the sources this is based on, see
[references.md](references.md).

## Project mapping (fill in once per project)

The rules below are stated in terms of four layers. Every project names and
places them differently, so the project records its mapping in its own
`AGENTS.md` (or `CLAUDE.md`). If no mapping is recorded, infer it from the
repository layout, state the mapping you assumed, and apply the rules to it.

| Layer | Role | Example layout (replace with the project's) |
|---|---|---|
| Transport | Parses a request, calls one service method, maps result/error to a response | `routes.ts`, `controller.ts`, `handlers/` |
| Service | Business rules and orchestration; knows ports, not adapters | `service.ts`, `use-cases/` |
| Repository / ports | Persistence and external-system access behind interfaces the inner layers own | `repository.ts`, `ports/`, `adapters/` |
| Domain core | Plain types and pure logic; no framework, DB or HTTP imports | `domain/`, `core/` |
| Composition root | The one place allowed to know every concrete adapter and wire them together | `container.ts`, `main.ts`, `bootstrap/` |

Also record, if the project has them: the naming convention for repository
classes, where shared contracts/DTO schemas live, and any modules that are
deliberately framework-free.

## Severity Levels

- **CRITICAL** — Will let business logic leak into the wrong layer, couple the
  domain to the web framework or ORM, or make the module untestable without a
  real DB/HTTP server
- **HIGH** — Will hurt testability/swappability as adapters change
- **MEDIUM** — Will hurt consistency/discoverability across modules

---

## The Dependency Rule (CRITICAL)

- Dependencies point inward only: transport -> service -> repository/ports ->
  domain. Never the reverse, and never a sideways skip (a handler calling the
  database or a concrete adapter directly, bypassing the service).
- Inner layers define interfaces (ports); outer layers implement them. Transport
  code never imports a concrete adapter (LLM client, VCS client, mailer, secret
  store, ...) directly - only the port, resolved through the composition root
  or an injected container.
- A framework-free core (pure business logic with no I/O of its own) is the
  ideal shape for logic that has no reason to know about HTTP or the database.
  Its only side effects go through injected ports. New pure logic belongs in
  such a core, not duplicated inside the service layer.
- Composition roots are the sanctioned exception: the container/bootstrap file
  (and seed/script entrypoints) may know about every concrete adapter - wiring
  them together is their entire job.

## Transport Handlers Stay Thin (CRITICAL)

- A handler's job: validate input (schema on params/body), call exactly one
  service method per branch, map the result or thrown error to a status code -
  nothing else.
- No raw ORM/SQL query, no loop or business branching, no external-API sync
  call inline in a handler body.
- Resolve dependencies through the container or an injected service, never a
  direct adapter import. Most web frameworks have a mechanism for this
  (scoped plugins/modules, decorators, DI containers); use the one the project
  already has.

## Repository Pattern (HIGH)

- The repository file/class is the only code in a module allowed to import the
  ORM or the DB schema. One repository per module/aggregate, following the
  project's naming convention.
- Map rows to domain-shaped types before returning to the service. Don't let an
  ORM-derived row type (for example one inferred from a table definition) cross
  back out through a service method signature into the transport layer - the
  row type is a repository-internal implementation detail.

## Validation / DTOs at the Boundary, Not the Core (MEDIUM)

- "Parse, don't validate": schema validation (Zod, JSON Schema, class-validator,
  ...) belongs at true edges - the request schema, and responses from external
  providers. Once parsed, the rest of the call chain gets a plain type, not a
  schema to re-validate.
- Services shouldn't re-parse data their own repository or the handler already
  produced. Express service-level invariants as plain guard code
  (`throw new NotFoundError(...)`), not a second validation pass.

## Enforcement Checklist (CRITICAL)

Run through this before considering backend module work done. Read each line
against the project's mapping above:

- [ ] Transport files import no ORM/DB-schema module and no concrete-adapter
  path - only the web framework, their own service, shared schemas/contracts
  and request-context helpers.
- [ ] Service files import no ORM; their only DB-shaped dependency is their own
  repository or a port.
- [ ] The repository is the sole importer of the ORM/DB schema in the module.
- [ ] No ORM-derived row type appears in a service method signature that is
  returned to the transport layer.
- [ ] No business branching, looping or external-API sync lives inside a handler
  body.
- [ ] Concrete adapters are constructed only in the composition root.

## Existing violations

If the project documents known, pre-existing violators (in its `AGENTS.md`,
architecture baseline or tech-debt list), cite them as anti-pattern examples and
don't opportunistically fix them while doing unrelated work. Don't add new code
that follows the same anti-pattern. If the task is specifically to refactor one
of them, use a module that already follows the rules as the target shape.

## Stack notes (apply only if the project uses the tool)

- **Fastify:** `register()` creates an encapsulated child context, and
  `fastify.decorate` / `getDecorator` fails fast at boot if a required
  dependency isn't wired - cheap, enforceable DI without a full container.
  Use `engineering-paved-path:fastify-best-practices` for the routing details.
- **Drizzle / other ORMs:** the repository owns table definitions and queries;
  row types inferred from a table never leave the repository.
- **Zod:** parse at the request and external-response edges only.
