import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // Bundle deps so `npx create-dontpanic` is self-contained and fast.
  noExternal: [/.*/],
  clean: true,
  dts: false,
  sourcemap: false,
  banner: { js: '#!/usr/bin/env node' },
});
