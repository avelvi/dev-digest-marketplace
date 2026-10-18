# Catalog site

Static web catalog for the marketplace. Vite + React + TypeScript, deployed to GitHub Pages by `.github/workflows/pages.yml`. Design and decisions: [docs/UI-CATALOG-SPEC.md](../docs/UI-CATALOG-SPEC.md).

```
marketplace.json + plugins/**  ->  scripts/build-catalog.ts  ->  public/catalog.json  ->  vite build  ->  dist/
```

## Develop

Requires Node 20.19+ or 22.12+.

```
cd site
npm ci
npm run catalog            # catalog from this repository
npm run catalog:fixtures   # catalog from tests/fixtures/full (one artifact of every type)
npm run dev
```

`public/catalog.json` is generated and git-ignored; run `npm run catalog` again after changing plugins.

## Checks

```
npm run typecheck
npm run lint
npm test
npm run build              # catalog + typecheck + vite build -> dist/
```

CI runs the same steps on every pull request; pushes to `main` also deploy.

## Publishing note

The site is public and publishes everything it indexes: descriptions, markdown bodies, hook commands and MCP configuration. Environment and header values are never emitted (names only). A plugin can opt out with `"x-catalog": { "hidden": true }` in its `marketplace.json` entry.

## Enable Pages (once)

Repository Settings > Pages > Source: **GitHub Actions**.
