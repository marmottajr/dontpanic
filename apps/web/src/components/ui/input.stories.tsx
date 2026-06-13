import type { Meta, StoryObj } from '@storybook/nextjs';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    type: { control: 'select', options: ['text', 'email', 'password', 'number'] },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: 'arthur.dent@earth.example' },
  render: (args) => <Input className="w-72" {...args} />,
};

/** The common pairing used across the auth screens: <Label> + <Input>. */
export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="arthur.dent@earth.example" {...args} />
    </div>
  ),
};

export const Password: Story = {
  render: () => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="password">Password</Label>
      <Input id="password" type="password" defaultValue="towel42" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="disabled">Locked</Label>
      <Input id="disabled" disabled placeholder="Vogon poetry not allowed" />
    </div>
  ),
};

/** aria-invalid drives the destructive ring/border. */
export const Invalid: Story = {
  render: () => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="invalid">Email</Label>
      <Input id="invalid" aria-invalid defaultValue="not-an-email" />
    </div>
  ),
};
