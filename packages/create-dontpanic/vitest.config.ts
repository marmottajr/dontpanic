import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only our own sources — never the bundled boilerplate under template/.
    include: ['src/**/*.test.ts'],
    exclude: ['template/**', 'node_modules/**', 'dist/**'],
  },
});
