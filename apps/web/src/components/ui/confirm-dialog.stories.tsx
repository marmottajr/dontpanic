import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from './button';

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  // Required props satisfied at the meta level; the render stories drive their own state.
  args: {
    open: false,
    onOpenChange: () => {},
    title: 'Are you sure?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    onConfirm: () => {},
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ variant }: { variant: 'default' | 'destructive' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant === 'destructive' ? 'destructive' : 'default'}
        onClick={() => setOpen(true)}
      >
        {variant === 'destructive' ? 'Delete account' : 'Confirm something'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={variant === 'destructive' ? 'Delete account' : 'Are you sure?'}
        description={
          variant === 'destructive'
            ? 'This cannot be undone. So long, and thanks for all the fish.'
            : "You can change your mind later. Probably. Don't Panic."
        }
        confirmLabel={variant === 'destructive' ? 'Delete' : 'Confirm'}
        cancelLabel="Cancel"
        variant={variant}
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

export const Default: Story = { render: () => <Demo variant="default" /> };
export const Destructive: Story = { render: () => <Demo variant="destructive" /> };
