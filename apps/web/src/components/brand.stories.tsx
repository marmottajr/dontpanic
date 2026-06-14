import type { Meta, StoryObj } from '@storybook/nextjs';
import { Brand } from './brand';

const meta = {
  title: 'Components/Brand',
  component: Brand,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    showBadge: { control: 'boolean' },
  },
} satisfies Meta<typeof Brand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { size: 'lg' } };
export const NoBadge: Story = { args: { showBadge: false } };

export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-6">
      <Brand size="sm" />
      <Brand size="md" />
      <Brand size="lg" />
    </div>
  ),
};
