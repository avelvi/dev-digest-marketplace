# References — Onion Architecture (Backend)

Curated sources for the `onion-architecture` skill. Every URL below was
fetched and verified reachable (not guessed). Used as source material for
`SKILL.md`.

## 1. Onion Architecture origin

- **Jeffrey Palermo — The Onion Architecture, Part 1**
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
  Coins the term. Concentric rings (Domain Model at the center, Domain
  Services, Application Services, outermost Infrastructure/UI); "the
  database is not the center — it is external," reached only through an
  interface the core defines.
- **Jeffrey Palermo — The Onion Architecture, Part 2**
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
  Worked example with repository interfaces defined by the core and
  implementations resolved by an IoC container — the container is a
  convenience, not a requirement of the pattern.
- **Jeffrey Palermo — The Onion Architecture, Part 3**
  https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
  States the four tenets (independent object model; inner layers define
  interfaces, outer layers implement them; coupling points toward the
  center; core code compiles/runs separately from infrastructure) and
  contrasts with traditional N-tier layering.

## 2. Comparative architecture (Hexagonal / Clean / DDD)

- **Herberto Graça — Explicit Architecture**
  https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
  Synthesizes Hexagonal (Ports & Adapters), Onion, and Clean Architecture
  into one model: Hexagonal establishes the core split (UI/adapters —
  application core — infrastructure/adapters, with core-owned Ports);
  Onion adds DDD's explicit Domain/Application layering inside that core.
- **Robert C. Martin — The Clean Architecture**
  https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
  Same dependency rule under different ring names (Entities → Use Cases →
  Interface Adapters → Frameworks/Drivers); only plain data structures may
  cross a ring boundary.
- **Bitloops — Onion Architecture**
  https://bitloops.com/docs/bitloops-language/learning/software-architecture/onion-architecture
  Modern comparison of Onion vs. Hexagonal rigor/modularity.

## 3. Fastify mechanics for enforcing the boundary (only if the project uses Fastify)

- **Fastify docs — Encapsulation**
  https://fastify.dev/docs/latest/Reference/Encapsulation/
  `register()` creates a scoped child context; decorations/hooks/plugins
  registered in a child are invisible to parents and siblings — the
  mechanism that keeps a route's wiring from leaking sideways.
- **Fastify docs — Decorators**
  https://fastify.dev/docs/latest/Reference/Decorators/
  `fastify.decorate`/`getDecorator` for injecting a service into routes;
  `getDecorator` fails fast at boot with `FST_ERR_DEC_UNDECLARED` if a
  dependency isn't registered — DI-style validation without a full
  container.

## 4. Repository / DTO / Mapper pattern

- **Khalil Stemmler — Domain-Driven Design w/ TypeScript: Repository, DTO,
  Mapper**
  https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
  Repository interfaces speak domain language, not query-builder shapes;
  `toDomain()`/`toPersistence()` mappers keep ORM row types out of the
  domain. Shown against Sequelize; the pattern is ORM-agnostic and applies
  directly to Drizzle.

## 5. Zod / boundary validation

- **Alexis King ("Lexi Lambda") — Parse, Don't Validate**
  https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
  Validation should happen once, at the boundary between the application
  and the external world, converting untyped input into a refined type —
  not re-checked deeper in the call stack ("shotgun parsing").
