import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PlanDto } from '@dontpanic/shared';
import type { ReactNode } from 'react';
import { PlanFormDialog } from './plan-form-dialog';

// No inter-keystroke delay. This file types long JSON payloads into several
// fields; with userEvent's default delay the suite spent real wall-clock per
// character and blew the 5s timeout whenever it ran alongside the API suite.
const user = userEvent.setup({ delay: null });

const messages = {
  common: { cancel: 'Cancel', save: 'Save' },
  platform: {
    plans: {
      form: {
        createTitle: 'New plan',
        editTitle: 'Edit plan',
        subtitle: 'A blank limit means unlimited.',
        code: 'Code',
        name: 'Name',
        description: 'Description',
        price: 'Price',
        currency: 'Currency',
        trialDays: 'Trial days',
        sortOrder: 'Sort order',
        maxUsers: 'Max users',
        maxStorageMb: 'Storage (MB)',
        unlimitedPlaceholder: 'Unlimited',
        limits: 'Per-resource limits (JSON)',
        limitsHint: 'Counters specific to your product.',
        features: 'Features (JSON)',
        featuresHint: 'Boolean flags.',
        isDefault: 'Default plan for new signups',
        active: 'Available to sign up for',
        createSubmit: 'Create plan',
        invalid: 'Check the fields.',
        invalidJson: 'Limits and features must be a valid JSON object.',
      },
    },
  },
};

const PRO: PlanDto = {
  id: 'p1',
  code: 'pro',
  name: 'Pro',
  description: 'For teams',
  priceCents: 9900,
  currency: 'USD',
  trialDays: 30,
  maxUsers: 10,
  maxStorageMb: null,
  active: false,
};

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const open = (props: Partial<React.ComponentProps<typeof PlanFormDialog>> = {}) => {
  const onSubmit = vi.fn();
  const view = wrap(<PlanFormDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} {...props} />);
  return { ...view, onSubmit };
};

async function fillMinimum() {
  await user.type(screen.getByLabelText('Code'), 'starter');
  await user.type(screen.getByLabelText('Name'), 'Starter');
}

afterEach(cleanup);

describe('PlanFormDialog — creating', () => {
  it('sends a contract-shaped plan, price converted to cents', async () => {
    const { onSubmit } = open();
    await fillMinimum();

    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '19,90');
    await user.clear(screen.getByLabelText('Currency'));
    await user.type(screen.getByLabelText('Currency'), 'usd');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'starter',
        name: 'Starter',
        description: null,
        priceCents: 1990,
        // The currency is upper-cased before validation: the contract wants a
        // 3-letter code, and an operator typing lowercase is not an error.
        currency: 'USD',
        trialDays: 14,
        maxUsers: null,
        maxStorageMb: null,
        sortOrder: 0,
        isDefault: false,
        active: true,
      }),
    );
  });

  it('carries every typed field through to the contract', async () => {
    const { onSubmit } = open();
    await fillMinimum();

    await user.type(screen.getByLabelText('Description'), 'For small teams');
    await user.clear(screen.getByLabelText('Trial days'));
    await user.type(screen.getByLabelText('Trial days'), '7');
    await user.clear(screen.getByLabelText('Sort order'));
    await user.type(screen.getByLabelText('Sort order'), '3');
    await user.type(screen.getByLabelText('Storage (MB)'), '2048');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'For small teams',
        trialDays: 7,
        sortOrder: 3,
        maxStorageMb: 2048,
      }),
    );
  });

  it('treats a blank limit as unlimited, and a filled one as a number', async () => {
    const { onSubmit } = open();
    await fillMinimum();

    await user.type(screen.getByLabelText('Max users'), '25');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maxUsers: 25, maxStorageMb: null }),
    );
  });

  it('sends limits and features only when the operator typed them', async () => {
    const blank = open();
    await fillMinimum();
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    const [sentBlank] = blank.onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(sentBlank).not.toHaveProperty('limits');
    expect(sentBlank).not.toHaveProperty('features');
    blank.unmount();

    const filled = open();
    await fillMinimum();
    await user.type(screen.getByLabelText('Per-resource limits (JSON)'), '{{"projects": 10}');
    await user.type(screen.getByLabelText('Features (JSON)'), '{{"concurrentSessions": true}');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(filled.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        limits: { projects: 10 },
        features: { concurrentSessions: true },
      }),
    );
  });

  it('refuses malformed JSON out loud instead of dropping what was typed', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.type(screen.getByLabelText('Per-resource limits (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Limits and features must be a valid JSON object.',
    );
  });

  it('refuses a JSON array — limits are a named map, not a list', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    // `[[` is user-event's escape for a literal opening bracket.
    await user.type(screen.getByLabelText('Features (JSON)'), '[[1,2]');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('refuses what the shared schema refuses, and says so', async () => {
    const { onSubmit } = open();
    // An uppercase code breaks the contract's slug rule.
    await user.type(screen.getByLabelText('Code'), 'Starter');
    await user.type(screen.getByLabelText('Name'), 'Starter');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Check the fields.');
  });

  it('treats an unparseable price as zero rather than NaN', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.clear(screen.getByLabelText('Price'));
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ priceCents: 0 }));
  });

  it('carries the two switches through to the contract', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.click(screen.getByLabelText('Default plan for new signups'));
    await user.click(screen.getByLabelText('Available to sign up for'));
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true, active: false }),
    );
  });
});

describe('PlanFormDialog — editing', () => {
  it('loads the existing plan, including a null limit as blank', () => {
    open({ plan: PRO });

    expect(screen.getByText('Edit plan')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('pro');
    expect(screen.getByLabelText('Price')).toHaveValue('99.00');
    expect(screen.getByLabelText('Max users')).toHaveValue('10');
    expect(screen.getByLabelText('Storage (MB)')).toHaveValue('');
    expect(screen.getByLabelText('Available to sign up for')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('starts limits and features blank — the DTO does not return them', () => {
    open({ plan: PRO });

    expect(screen.getByLabelText('Per-resource limits (JSON)')).toHaveValue('');
    expect(screen.getByLabelText('Features (JSON)')).toHaveValue('');
  });

  it('locks the buttons while saving', () => {
    open({ plan: PRO, loading: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('closes without saving when cancelled', async () => {
    const onOpenChange = vi.fn();
    wrap(<PlanFormDialog open onOpenChange={onOpenChange} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does nothing while closed', () => {
    wrap(<PlanFormDialog open={false} onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
  });
});
