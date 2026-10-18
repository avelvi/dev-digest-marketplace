# UI catalog specification

Status: draft v1 (MVP scope)

A static web catalog for this marketplace, hosted on GitHub Pages. Users search every plugin, skill, agent, command, hook and MCP server in the repository, read what an artifact does, and copy the commands to install it.

## 1. Decisions

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages, **public site**, no backend |
| UI language | English only (content is English too) |
| Stack | React + TypeScript, built with Vite |
| MVP scope | Search, result cards, artifact page, copy-to-clipboard commands |
| Out of MVP | Collections/bundles, compare, config generator, ratings, install counters, semantic (embedding) search, i18n |

## 2. Goals and non-goals

**Goals**

- A visitor types a free-form request ("I need a skill for code review") and gets matching artifacts as cards, ranked by relevance.
- Every artifact has a stable, shareable URL.
- Installing is one click away: the exact `/plugin ...` commands are shown and copyable.
- The catalog is always in sync with the repository: no hand-maintained data.

**Non-goals**

- No server, database, accounts, analytics backend, comments or ratings.
- No LLM calls from the browser.
- The site does not install anything; it only shows commands.

## 3. Architecture

```
marketplace.json ┐
plugins/**       ┼─► build-catalog (Node, CI) ─► catalog.json + search-index.json ─┐
                 ┘                                                                 ├─► Vite build ─► Pages
site/ (React + TS) ────────────────────────────────────────────────────────────────┘
```

1. **Catalog build** (Node script, runs before the Vite build) reads the repository and emits two static files.
2. **SPA** fetches both files at start-up and does everything client-side.
3. **GitHub Actions** builds and deploys to Pages on every push to `main`.

### Repository layout (new)

```
site/
├── package.json            # separate from the repo root; devDependencies only
├── vite.config.ts
├── tsconfig.json
├── index.html
├── scripts/build-catalog.ts   # catalog + index generator
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/            # SearchPage, ArtifactPage, NotFound
│   ├── components/        # SearchBox, Filters, ArtifactCard, CopyButton, ...
│   ├── lib/               # catalog loading, search, query parsing
│   └── types/catalog.ts   # shared with build-catalog
└── tests/
.github/workflows/pages.yml
```

`scripts/validate-marketplace.mjs` stays dependency-free and untouched except for the metadata checks in section 5.

## 4. Data model

`catalog.json` is the only data contract between build and UI. Types live in `site/src/types/catalog.ts`.

```ts
type ArtifactType = 'plugin' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp-server';

interface Catalog {
  schemaVersion: 1;
  generatedAt: string;            // ISO 8601
  marketplace: {
    name: string;                 // "dev-digest-marketplace"
    description: string;
    ownerName: string;
    repoSlug: string;             // "owner/repo", used in the "marketplace add" command
    repoUrl: string;              // https://github.com/owner/repo
    defaultBranch: string;
  };
  plugins: PluginEntry[];
  artifacts: Artifact[];          // flat list, includes one 'plugin' artifact per plugin
}

interface Artifact {
  id: string;                     // "<plugin>" | "<plugin>/<type>/<name>"; URL-safe, unique
  type: ArtifactType;
  name: string;
  plugin: string;                 // owning plugin name
  description: string;            // plain text, ≤ 300 chars shown on cards
  keywords: string[];
  category?: string;
  version?: string;               // plugin version, copied to children
  author?: string;
  license?: string;
  sourcePath: string;             // repo-relative path, for the "View source" link
  bodyMarkdown: string;           // SKILL.md / agent body / README, frontmatter stripped
  details: Record<string, unknown>; // type-specific, see below
}
```

Type-specific `details`:

| Type | Contents |
|---|---|
| plugin | counts per child type, dependencies, README markdown, file tree |
| skill | `allowed-tools`, `argument-hint`, other frontmatter fields |
| agent | `tools`, `model`, other frontmatter fields |
| command | `argument-hint`, `allowed-tools` |
| hook | event name, matcher, hook type, command string (display only) |
| mcp-server | server name, transport (`stdio`/`http`/`sse`), command or URL (env values redacted) |

### Build rules

- Source of truth for the plugin list is `.claude-plugin/marketplace.json`. Plugins in `plugins/` that are not listed there are skipped with a warning.
- Frontmatter is parsed with a YAML parser (`gray-matter`); a malformed file fails the build with the file path in the message.
- Artifact `id` collisions fail the build.
- Plugins with a non-relative `source` (`github`, `git-subdir`, npm) cannot be read at build time: they appear as a `plugin` artifact built from the marketplace entry only, with a flag `details.external = true`.
- Output is deterministic (sorted keys and lists) so unchanged content produces identical files.
- An empty `plugins` array is valid and produces an empty catalog.

## 5. Metadata conventions (needed for good search)

Search quality depends on authors writing searchable metadata. Add to `docs/PLUGIN-GUIDELINES.md` and enforce in `validate-marketplace.mjs --strict`:

- `plugin.json`: `description` (required), `keywords` (≥ 3 recommended), `category` in marketplace entry.
- Each `SKILL.md` and agent: `name` and `description` in frontmatter. The description must say **what it does and when to use it**; this is also what Claude uses to pick the skill.
- Keywords include synonyms users would type ("review", "code review", "PR").
- Validator checks are warnings in default mode and errors under `--strict`.

### Publishing note

The site is public. The build publishes everything it indexes: descriptions, markdown bodies, hook commands, MCP configs. Rules:

- Environment values in `.mcp.json` and `hooks.json` are never emitted (keys only).
- A plugin may opt out of the catalog with `"x-catalog": { "hidden": true }` in its marketplace entry; hidden plugins are not indexed or listed.
- Reviewers must treat a plugin PR as a publication to the public web.

## 6. Search

Runs entirely in the browser using **MiniSearch** (index serialized at build time, loaded at start-up).

**Indexed fields and boosts**

| Field | Boost |
|---|---|
| name | 5 |
| keywords | 4 |
| description | 3 |
| category, plugin name | 2 |
| bodyMarkdown (plain text) | 1 |

**Query handling**

1. Lowercase, strip punctuation, drop English stop words and filler ("i need a", "skill for", "how to").
2. Words that name a type ("skill", "agent", "plugin", "hook", "mcp", "command", plurals) are removed from the text query and applied as a **soft boost** (×1.5) for that type, not a hard filter. The explicit type filter in the UI is the hard filter.
3. Remaining terms: OR semantics, prefix matching, fuzzy matching (edit distance 0.2), so partial and misspelled words still match.
4. Results ranked by score; ties broken by type order (plugin, skill, agent, ...) then name.
5. Matched terms are highlighted in name and description on the card.
6. Empty query shows all artifacts (sorted by type, then name) with the filters applied.
7. Zero results shows a message and suggestions: remove filters, try fewer words, list of popular keywords.

Search must respond within 50 ms for 1,000 artifacts on a mid-range laptop; the query runs on every keystroke with a 100 ms debounce.

## 7. UI

### Routes

The app uses **hash routing** (`react-router`, `createHashRouter`) because GitHub Pages cannot rewrite unknown paths to `index.html`.

| Route | Page |
|---|---|
| `#/` | Search page |
| `#/?q=review&type=skill&category=quality` | Search page with state |
| `#/a/<id>` | Artifact page (`id` URL-encoded) |
| anything else | "Not found" page with a link home |

Search state (`q`, `type`, `category`, `plugin`) lives in the URL query so searches can be shared and the back button works.

### Search page

- Header: marketplace name, repo link, short description.
- Search box, auto-focused, `/` focuses it from anywhere, `Esc` clears it.
- Filters: type (multi-select chips with counts), category, plugin. Active filters are removable chips. "Clear all" button.
- Result count and a live region announcing it to screen readers.
- Card grid: responsive, 1 column on mobile, 2 on tablet, 3 on desktop.
- Empty catalog state: "No plugins published yet" with a link to `CONTRIBUTING.md`.

### Artifact card

Shows: type badge, name, parent plugin (link, except for plugin cards), description (clamped to 3 lines), up to 4 keyword chips, version. The whole card is a link to the artifact page. A copy button on the card copies the install command for its plugin without navigating.

### Artifact page

- Title, type badge, parent plugin link, version, author, license, category, keywords.
- **Install panel** (section 8).
- Body: `bodyMarkdown` rendered to HTML.
- Type-specific section from `details` (tools, model, hook event and matcher, MCP transport, children of a plugin as cards).
- "View source on GitHub" link built from `repoUrl`, `defaultBranch`, `sourcePath`.
- For plugins that contain hooks or MCP servers, a visible **"What this plugin runs"** notice listing them, mirroring the trust warning in `README.md`.

### Markdown rendering and safety

- Render with `react-markdown` + `remark-gfm`. Raw HTML in markdown is **not** rendered (no `rehype-raw`).
- Links open with `rel="noopener noreferrer"`; only `http`, `https`, `mailto` and in-page anchors are allowed.
- Relative images and links in plugin READMEs are rewritten to `raw.githubusercontent.com` / `github.com/.../blob/...` URLs at build time.
- Code blocks have their own copy button.

### Visual and accessibility requirements

- Light and dark theme following `prefers-color-scheme`; no manual toggle in MVP.
- WCAG 2.1 AA contrast; full keyboard operation; visible focus ring; semantic landmarks; badges never rely on colour alone.
- Copy button announces "Copied" via `aria-live` and reverts after 2 seconds.
- No layout shift while the catalog loads (skeleton cards).

## 8. Copy-to-clipboard commands

Skills, agents, commands, hooks and MCP servers are not installed individually; installing the **parent plugin** installs them. The install panel therefore always shows plugin-level commands and says which plugin contains the artifact.

Step 1, add the marketplace (once):

```
/plugin marketplace add <repoSlug>
```

Step 2, install:

```
/plugin install <plugin>@<marketplace.name>
```

Rules:

- Each command is in its own code block with its own copy button; a "Copy both" button copies the two lines.
- `repoSlug` and `marketplace.name` come from `catalog.json`, never hard-coded.
- Uses `navigator.clipboard.writeText`; falls back to a hidden textarea + `document.execCommand('copy')` when the Clipboard API is unavailable; if both fail, the text is selected for manual copy and a message says so.
- The panel shows a note that is configurable at build time (`site/catalog.config.json`, key `installNote`). Default text: "The repository is private. Git must already have access to it (SSH key or `gh auth login`)." The note is hidden if the config value is empty.
- A link to the trust warning: "Read the plugin before installing it."

## 9. Technical requirements

- Node 20+, TypeScript `strict`, ESLint, Prettier.
- Runtime dependencies kept minimal: `react`, `react-dom`, `react-router`, `minisearch`, `react-markdown`, `remark-gfm`. No UI framework; plain CSS modules or a single CSS file.
- Vite `base` is read from the `SITE_BASE` env var, default `/<repo-name>/`. CI sets it; it must be confirmed against the real Pages URL (see section 12).
- `catalog.json` and `search-index.json` are emitted into `dist/` and fetched with a relative URL plus a content-hash query string for cache busting.
- Budget: initial JS ≤ 150 KB gzip (excluding catalog data); Lighthouse Performance, Accessibility, Best Practices ≥ 90 on the search page.
- No third-party requests at runtime (no CDN fonts, no analytics). System font stack.
- Works in the last two versions of Chrome, Firefox, Safari and Edge.

## 10. CI/CD

`.github/workflows/pages.yml`:

1. Trigger: push to `main` and `workflow_dispatch`.
2. Steps: checkout, setup Node 20, `npm ci` in `site/`, `node scripts/validate-marketplace.mjs --strict`, build catalog, typecheck, lint, unit tests, `vite build`, upload `site/dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.
3. Permissions: `contents: read`, `pages: write`, `id-token: write`. Concurrency group `pages`, no cancellation of in-progress deploys.
4. Pull requests run the same steps without deploying, so catalog build failures block the merge.

The existing `validate.yml` is unchanged.

## 11. Testing

| Level | What |
|---|---|
| Unit (Vitest) | Frontmatter parsing, id generation, query parsing (stop words, type hints), ranking, link rewriting, secret redaction |
| Build | Fixture marketplace in `site/tests/fixtures/` with one plugin of each artifact type, a malformed file, a hidden plugin, an external-source plugin, and an empty marketplace |
| Component (Testing Library) | Search box to cards flow, filters, URL state, copy button with Clipboard API mocked, empty and zero-result states |
| E2E smoke (Playwright, optional in MVP) | Load built site, search, open artifact, copy command |
| Accessibility | `axe` checks on the search and artifact pages in component tests |

The real catalog is empty today, so all development and tests run against the fixtures.

## 12. Acceptance criteria (MVP)

1. Pushing to `main` deploys the site; opening the Pages URL shows the search page.
2. With the fixture catalog, searching "review code" returns the code-review skill first; searching with a typo ("reveiw") still finds it; a query of "agents for testing" ranks agent artifacts above others but still shows other types.
3. Filters and query survive reload and can be shared by URL; the browser back button restores previous state.
4. Every artifact has a working page at `#/a/<id>`; opening an unknown id shows the Not found page.
5. The install panel shows the two commands built from catalog data; each copy button works in Chrome, Firefox and Safari and shows a "Copied" confirmation.
6. A plugin with hooks or MCP servers shows the "What this plugin runs" notice; env values never appear in `catalog.json`.
7. A hidden plugin appears nowhere in the output; a malformed `SKILL.md` fails the build with its path.
8. An empty marketplace builds and shows the empty state.
9. Lighthouse and bundle-size budgets from section 9 are met; `axe` reports no violations.

## 13. Milestones

1. **M1 Catalog build.** Types, `build-catalog`, fixtures, unit tests, metadata checks in the validator.
2. **M2 Search page.** App shell, search index, query parsing, cards, filters, URL state, empty states.
3. **M3 Artifact page.** Markdown rendering, type-specific sections, install panel and copy buttons, run notice.
4. **M4 Delivery.** Pages workflow, base path, accessibility and performance pass, README section linking to the site.

## 14. Open items

- **Pages URL and base path.** Confirm in repository Settings > Pages that a public site is allowed and what the final URL is, then set `SITE_BASE`.
- **Private repo, public site.** Install commands only work for people with repository access (note in section 8). Decide whether the repository becomes public later; if so, remove the `installNote`.
- **Post-MVP candidates.** Collections/bundles, config generator, compare view, new/updated feed (Atom), semantic search with a small in-browser embedding model, GitHub Discussions links for feedback.
