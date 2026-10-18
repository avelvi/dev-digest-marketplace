import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Content hash of the generated catalog, used as a cache-busting query string.
function catalogHash(): string {
  const file = resolve(import.meta.dirname, 'public/catalog.json');
  if (!existsSync(file)) return 'dev';
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
}

export default defineConfig({
  // Relative by default so the build works under any Pages path (project page, custom domain).
  // Safe because routing is hash-based and there are no deep URLs.
  base: process.env.SITE_BASE ?? './',
  plugins: [react()],
  define: { __CATALOG_HASH__: JSON.stringify(catalogHash()) },
  build: { target: 'es2022', sourcemap: false },
});
