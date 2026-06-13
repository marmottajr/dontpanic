import type { Meta, StoryObj } from '@storybook/nextjs';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive', 'success'] },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="w-96">
      <Info />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>You can carry a towel; it is the most useful thing.</AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert variant="success" className="w-96">
      <CheckCircle2 />
      <AlertTitle>Email verified</AlertTitle>
      <AlertDescription>Your account is ready. Don&apos;t panic.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <TriangleAlert />
      <AlertTitle>Improbability too high</AlertTitle>
      <AlertDescription>The credentials you entered could not be verified.</AlertDescription>
    </Alert>
  ),
};

/** All three variants stacked. */
export const AllVariants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="grid w-96 gap-4">
      <Alert>
        <Info />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>Neutral, informational message.</AlertDescription>
      </Alert>
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Everything worked as expected.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>Something went wrong.</AlertDescription>
      </Alert>
    </div>
  ),
};
