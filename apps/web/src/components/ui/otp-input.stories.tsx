import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { OtpInput } from './otp-input';

const meta = {
  title: 'UI/OtpInput',
  component: OtpInput,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // Required props satisfied here; the render stories supply their own controlled state.
  args: { value: '', onChange: () => {} },
} satisfies Meta<typeof OtpInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial = '' }: { initial?: string }) {
  const [code, setCode] = useState(initial);
  return <OtpInput value={code} onChange={setCode} ariaLabel="Verification code" />;
}

/** Empty — type or paste a 6-digit code; auto-advances and supports backspace. */
export const Default: Story = { render: () => <Controlled /> };
export const Prefilled: Story = { render: () => <Controlled initial="4242" /> };
export const Disabled: Story = {
  render: () => <OtpInput value="123456" onChange={() => {}} disabled />,
};
