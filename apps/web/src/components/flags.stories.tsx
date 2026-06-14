import type { Meta, StoryObj } from '@storybook/nextjs';
import { FlagIcon } from './flags';

const meta = {
  title: 'Components/FlagIcon',
  component: FlagIcon,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: { locale: { control: 'select', options: ['pt-BR', 'en-US'] } },
  args: { locale: 'pt-BR' },
} satisfies Meta<typeof FlagIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

// Drawn as inline SVG on purpose — emoji flags don't render on Windows.
export const Brazil: Story = { args: { locale: 'pt-BR' } };
export const UnitedStates: Story = { args: { locale: 'en-US' } };

export const Both: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-4">
      <FlagIcon locale="pt-BR" />
      <FlagIcon locale="en-US" />
    </div>
  ),
};
