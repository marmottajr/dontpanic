import type { Meta, StoryObj } from '@storybook/nextjs';
import { Skeleton } from './skeleton';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Skeleton className="h-6 w-48" />,
};

/** A typical loading placeholder for a profile card. */
export const Card: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="w-72 space-y-3 rounded-xl border border-border p-4">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
};
