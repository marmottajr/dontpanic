import type { Meta, StoryObj } from '@storybook/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';

/**
 * LanguageSwitcher reads the active locale via next-intl's `useLocale`, so it
 * needs a <NextIntlClientProvider>. `@storybook/nextjs` auto-mocks
 * `next/navigation` (useRouter), so the trigger + dropdown render and open.
 *
 * NOTE: selecting a locale calls the `setLocale` *server action* (it writes a
 * cookie via `next/headers`), which has no effect inside Storybook — this story
 * is for visual/interaction review of the flag dropdown, not real switching.
 */
const meta = {
  title: 'Components/LanguageSwitcher',
  component: LanguageSwitcher,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story, ctx) => (
      <NextIntlClientProvider locale={(ctx.globals.locale as string) ?? 'pt-BR'} messages={{}}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
} satisfies Meta<typeof LanguageSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PortugueseBR: Story = {
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="pt-BR" messages={{}}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};

export const EnglishUS: Story = {
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en-US" messages={{}}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};
