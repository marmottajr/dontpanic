import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';

function setup(overrides: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete account?"
      description="This is irreversible."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="destructive"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('shows the title, description and both actions when open', () => {
    setup();
    expect(screen.getByText('Delete account?')).toBeInTheDocument();
    expect(screen.getByText('This is irreversible.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('requests close when cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables both actions while loading', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders a default (non-destructive) variant without a description', () => {
    setup({ variant: 'default', description: undefined });
    expect(screen.getByText('Delete account?')).toBeInTheDocument();
    expect(screen.queryByText('This is irreversible.')).not.toBeInTheDocument();
  });
});
