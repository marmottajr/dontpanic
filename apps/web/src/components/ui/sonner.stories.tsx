import type { Meta, StoryObj } from '@storybook/nextjs';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';

const meta = {
  title: 'UI/Toaster',
  component: Toaster,
  tags: ['autodocs'],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Click a button to fire a toast. The Toaster lives once, near the app root. */
export const Default: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => toast.success("Saved. Don't Panic.")}>Success</Button>
        <Button variant="destructive" onClick={() => toast.error('Vogon poetry detected.')}>
          Error
        </Button>
        <Button variant="outline" onClick={() => toast('So long, and thanks for all the fish.')}>
          Plain
        </Button>
      </div>
      <Toaster richColors />
    </div>
  ),
};
