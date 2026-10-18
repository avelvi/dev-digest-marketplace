import { resolve } from 'node:path';
import { buildCatalog, type SiteConfig } from '../scripts/lib/catalog';
import type { Catalog } from '../src/types/catalog';

export const FIXTURES = resolve(import.meta.dirname, 'fixtures');

export const TEST_CONFIG: SiteConfig = {
  repoSlug: 'acme/market',
  defaultBranch: 'main',
  installNote: 'The repository is private. Git must already have access to it (SSH key or `gh auth login`).',
};

export function fixtureCatalog(name: 'full' | 'empty' = 'full', config: SiteConfig = TEST_CONFIG): Catalog {
  return buildCatalog({
    root: resolve(FIXTURES, name),
    config,
    generatedAt: '2026-10-17T00:00:00.000Z',
    warn: () => {},
  });
}
