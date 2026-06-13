import type { StorybookConfig } from '@storybook/nextjs';

/**
 * Storybook for the DontPanic web app.
 *
 * NOTE: we are on Storybook 10 (the first line that supports Next 16 + React 19).
 * In Storybook 9+ the old "addon-essentials" meta-package and "@storybook/test"
 * were folded into core, so the controls/actions/docs/viewport/backgrounds
 * features are built in. We only add the two addons that still ship separately:
 *  - @storybook/addon-docs  (autodocs + the classic "essentials" UX)
 *  - @storybook/addon-a11y  (accessibility checks, as requested)
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: ['../public'],
  typescript: {
    // The app already type-checks via `pnpm typecheck`; let SB build stay fast.
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
