// Reads the marketplace and writes public/catalog.json.
// Usage: tsx scripts/build-catalog.ts [--root <marketplace dir>] [--out <file>] [--config <file>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CatalogError, buildCatalog, stableStringify, type SiteConfig } from './lib/catalog';

const siteDir = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};

const root = resolve(option('--root', resolve(siteDir, '..')));
const out = resolve(option('--out', resolve(siteDir, 'public/catalog.json')));
const configPath = resolve(option('--config', resolve(siteDir, 'catalog.config.json')));

try {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as SiteConfig;
  const catalog = buildCatalog({ root, config });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, stableStringify(catalog));
  const counts = catalog.artifacts.length;
  console.log(`catalog: ${catalog.plugins.length} plugin(s), ${counts} artifact(s) -> ${out}`);
} catch (e) {
  console.error(`error: ${e instanceof CatalogError ? e.message : (e as Error).stack}`);
  process.exit(1);
}
