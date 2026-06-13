/**
 * Minimal Jest transformer that down-levels a handful of ESM-only dependencies
 * to CommonJS so the (CommonJS) Jest runtime can `require` them.
 *
 * Why this exists: otplib@13 pulls in `@scure/base@2` (ships `exports: null`
 * plus a single ESM `index.js`, no CJS build) and `@noble/hashes@2` (pure ESM,
 * `type: module`). Neither offers a `require` condition, so Jest's CommonJS
 * loader hits raw `import`/`export` and throws. Rather than add babel + presets,
 * we reuse the already-installed TypeScript compiler to transpile just those
 * files to CJS. The jest-e2e `transform` map scopes this transformer to ONLY
 * those two packages (by path), so nothing else in node_modules is touched.
 */
const ts = require('typescript');
const crypto = require('node:crypto');

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText, sourceMapText } = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        allowJs: true,
        sourceMap: true,
        inlineSources: true,
      },
      fileName: sourcePath,
    });
    return { code: outputText, map: sourceMapText };
  },
  getCacheKey(sourceText, sourcePath) {
    return crypto
      .createHash('sha1')
      .update('esm-to-cjs-v1')
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  },
};
