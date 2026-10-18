import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __CATALOG_HASH__: JSON.stringify('test') },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
  },
});
