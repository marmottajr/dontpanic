import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared flat ESLint config for the DontPanic monorepo.
 * Each package does: `import base from '@dontpanic/config/eslint'; export default base;`
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // House rule: never use the browser's alert/confirm/prompt — use a
      // system-styled modal (ConfirmDialog / Dialog) instead. Enforced.
      'no-alert': 'error',
    },
  },
  {
    ignores: [
      'dist/**',
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'storybook-static/**',
      '**/*.config.js',
      '**/*.config.cjs',
    ],
  },
);
