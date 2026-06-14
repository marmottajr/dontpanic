import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Switch } from './switch';
import { Label } from './label';

const meta = {
  title: 'UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: { disabled: { control: 'boolean' } },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };

function LabelledSwitch() {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center gap-3">
      <Switch id="twofa" checked={on} onCheckedChange={setOn} />
      <Label htmlFor="twofa">Require 2FA — don&apos;t panic</Label>
    </div>
  );
}

/** Controlled, with a label. */
export const WithLabel: Story = {
  parameters: { controls: { disable: true } },
  render: () => <LabelledSwitch />,
};
