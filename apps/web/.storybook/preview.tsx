import * as React from 'react';
import type { Preview, Decorator } from '@storybook/nextjs';
import '../src/app/globals.css';

/**
 * The real app wires the three brand fonts through `next/font/google`, which
 * only runs inside Next's build — it does NOT run inside the Storybook preview
 * iframe. So here we provide sensible fallback values for the same CSS
 * variables the design tokens read (`--font-body`, `--font-display`,
 * `--font-mono`). Components keep using `font-sans` / `font-display` /
 * `font-mono` and render with the correct family + the design tokens.
 */
const FONT_VARS: React.CSSProperties = {
  ['--font-body' as string]: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
  ['--font-display' as string]:
    '"Bricolage Grotesque", "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
  ['--font-mono' as string]:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Toolbar toggle: switch the whole canvas between "paper" (light) and "deep space" (dark). */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as 'light' | 'dark') ?? 'light';

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    // Keep the preview <body> in sync so the page chrome matches the canvas.
    document.body.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div
      className={`${theme === 'dark' ? 'dark ' : ''}bg-background text-foreground font-sans antialiased`}
      style={{ ...FONT_VARS, minHeight: '100vh', padding: '2rem' }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'DontPanic theme — paper (light) or deep space (dark)',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Paper (light)', icon: 'sun' },
          { value: 'dark', title: 'Deep space (dark)', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
  parameters: {
    layout: 'centered',
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: { disable: true }, // we own the background via the theme decorator
    a11y: { test: 'todo' },
  },
};

export default preview;
