import type { Meta, StoryObj } from '@storybook/nextjs';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from './theme-toggle';

/**
 * ThemeToggle reads/writes the theme through `next-themes`' `useTheme`, so it
 * needs a <ThemeProvider>. We give it a self-contained one here (attribute
 * "class", same config as the real app) so clicking the button actually flips
 * the `.dark` class on <html> live in the canvas.
 *
 * Tip: this is independent from the global "Theme" toolbar toggle (which is for
 * previewing components in a fixed theme) — here you drive it via the button.
 */
const meta = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
