import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PlanDto } from '@dontpanic/shared';
import type { ReactNode } from 'react';
import { SuspendTenantDialog } from './suspend-tenant-dialog';
import { ChangePlanDialog } from './change-plan-dialog';
import { ExtendTrialDialog } from './extend-trial-dialog';

const messages = {
  common: { cancel: 'Cancel', save: 'Save' },
  platform: {
    suspendDialog: {
      title: 'Suspend {name}',
      description: 'Suspending blocks access for {name} immediately.',
      effect: 'Every user of that company loses access at once.',
      reasonLabel: 'Reason',
      reasonPlaceholder: 'Why?',
      reasonHint: 'At least 3 characters.',
      confirm: 'Suspend',
    },
    planDialog: {
      title: 'Change plan',
      description: 'Pick the new plan for {name}.',
      planLabel: 'Plan',
      choose: 'Select…',
      confirm: 'Change plan',
    },
    trialDialog: {
      title: 'Extend trial',
      description: 'How many extra trial days for {name}?',
      daysLabel: 'Days',
      daysHint: 'From 1 to 365 days.',
      confirm: 'Extend',
    },
  },
};

const wrap = (node: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );

const plan = (overrides: Partial<PlanDto> = {}): PlanDto => ({
  id: 'p1',
  code: 'pro',
  name: 'Pro',
  description: null,
  priceCents: 9900,
  currency: 'USD',
  trialDays: 14,
  maxUsers: 10,
  maxStorageMb: 1024,
  active: true,
  ...overrides,
});

afterEach(cleanup);

describe('SuspendTenantDialog', () => {
  it('says what suspending actually does before it is confirmed', () => {
    wrap(<SuspendTenantDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={vi.fn()} />);

    expect(screen.getByText('Suspend Acme')).toBeInTheDocument();
    expect(
      screen.getByText('Every user of that company loses access at once.'),
    ).toBeInTheDocument();
  });

  it('refuses to confirm without a reason the API would accept', async () => {
    const onConfirm = vi.fn();
    wrap(
      <SuspendTenantDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={onConfirm} />,
    );

    const confirm = screen.getByRole('button', { name: 'Suspend' });
    expect(confirm).toBeDisabled();

    // Under the contract's 3-character floor: still refused, and marked invalid.
    await userEvent.type(screen.getByLabelText('Reason'), 'ab');
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(screen.getByLabelText('Reason'), 'use');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('abuse');
  });

  it('starts blank on every opening — a reason is not inherited', async () => {
    const view = wrap(
      <SuspendTenantDialog
        open={false}
        onOpenChange={vi.fn()}
        tenantName="Acme"
        onConfirm={vi.fn()}
      />,
    );
    view.rerender(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <SuspendTenantDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });

  it('locks both buttons while the request is in flight', () => {
    wrap(
      <SuspendTenantDialog
        open
        loading
        onOpenChange={vi.fn()}
        tenantName="Acme"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled();
  });

  it('closes without suspending when cancelled', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <SuspendTenantDialog
        open
        onOpenChange={onOpenChange}
        tenantName="Acme"
        onConfirm={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ChangePlanDialog', () => {
  const plans = [
    plan(),
    plan({ id: 'p2', name: 'Basic', priceCents: 1900 }),
    plan({ id: 'p3', name: 'Retired', active: false }),
  ];

  it('offers active plans, plus the inactive one the company is already on', () => {
    wrap(
      <ChangePlanDialog
        open
        onOpenChange={vi.fn()}
        tenantName="Acme"
        currentPlanId="p3"
        plans={plans}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Pro/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Retired/ })).toBeInTheDocument();
  });

  it('hides a retired plan nobody is on', () => {
    wrap(
      <ChangePlanDialog
        open
        onOpenChange={vi.fn()}
        tenantName="Acme"
        currentPlanId="p1"
        plans={plans}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('option', { name: /Retired/ })).not.toBeInTheDocument();
  });

  it('will not confirm a change to the plan already in force', async () => {
    const onConfirm = vi.fn();
    wrap(
      <ChangePlanDialog
        open
        onOpenChange={vi.fn()}
        tenantName="Acme"
        currentPlanId="p1"
        plans={plans}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Change plan' });
    expect(confirm).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Plan'), 'p2');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('p2');
  });

  it('starts on nothing when the company has no plan at all', () => {
    wrap(
      <ChangePlanDialog
        open
        onOpenChange={vi.fn()}
        tenantName="Acme"
        currentPlanId={null}
        plans={plans}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Plan')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Change plan' })).toBeDisabled();
  });

  it('closes without changing anything when cancelled', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    wrap(
      <ChangePlanDialog
        open
        onOpenChange={onOpenChange}
        tenantName="Acme"
        currentPlanId="p1"
        plans={plans}
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks while the request is in flight', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <ChangePlanDialog
        open
        loading
        onOpenChange={onOpenChange}
        tenantName="Acme"
        currentPlanId="p1"
        plans={plans}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change plan' })).toBeDisabled();
  });
});

describe('ExtendTrialDialog', () => {
  it('proposes a sensible default the operator can just confirm', async () => {
    const onConfirm = vi.fn();
    wrap(<ExtendTrialDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={onConfirm} />);

    expect(screen.getByLabelText('Days')).toHaveValue('14');
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenCalledWith(14);
  });

  it('refuses what the contract refuses — zero, beyond a year, or not a number', async () => {
    wrap(<ExtendTrialDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={vi.fn()} />);
    const field = screen.getByLabelText('Days');
    const confirm = screen.getByRole('button', { name: 'Extend' });

    for (const value of ['0', '400', 'abc']) {
      await userEvent.clear(field);
      await userEvent.type(field, value);
      expect(confirm).toBeDisabled();
      expect(field).toHaveAttribute('aria-invalid', 'true');
    }

    await userEvent.clear(field);
    await userEvent.type(field, '30');
    expect(confirm).toBeEnabled();
  });

  it('closes without extending anything when cancelled', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    wrap(
      <ExtendTrialDialog
        open
        onOpenChange={onOpenChange}
        tenantName="Acme"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks while the request is in flight', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <ExtendTrialDialog
        open
        loading
        onOpenChange={onOpenChange}
        tenantName="Acme"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('resets to the default each time it opens', () => {
    const view = wrap(
      <ExtendTrialDialog
        open={false}
        onOpenChange={vi.fn()}
        tenantName="Acme"
        onConfirm={vi.fn()}
      />,
    );
    view.rerender(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <ExtendTrialDialog open onOpenChange={vi.fn()} tenantName="Acme" onConfirm={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText('Days')).toHaveValue('14');
  });
});
