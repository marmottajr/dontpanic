import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form (not an array) so the output paths are explicit: `index` is the
  // contract every app imports, and `locale/br` is an opt-in module that must
  // NOT be pulled into the main bundle — nothing in src/index.ts references it,
  // so it only ships to whoever imports '@dontpanic/shared/locale/br'.
  entry: { index: 'src/index.ts', 'locale/br': 'src/locale/br.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
