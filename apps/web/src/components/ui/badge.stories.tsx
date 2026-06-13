import type { Meta, StoryObj } from '@storybook/nextjs';
import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'accent', 'destructive', 'outline'],
    },
  },
  args: { children: 'online' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Accent: Story = { args: { variant: 'accent', children: '42' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'offline' } };
export const Outline: Story = { args: { variant: 'outline' } };

/** All variants together (note: badges use the mono "system voice"). */
export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="accent">accent</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
    </div>
  ),
};
