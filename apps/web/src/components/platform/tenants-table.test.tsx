import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PlatformTenantDto } from '@dontpanic/shared';
import { TenantsTable, type TenantsTableProps } from './tenants-table';

const messages = {
  common: { loading: 'Loading…' },
  platform: {
    status: { TRIAL: 'Trial', ACTIVE: 'Active', SUSPENDED: 'Suspended', CANCELED: 'Cancelled' },
    tenants: {
      searchLabel: 'Search',
      searchPlaceholder: 'Name, slug or email',
      filterStatus: 'Status',
      allStatuses: 'All',
      tableCaption: 'Companies',
      colCompany: 'Company',
      colPlan: 'Plan',
      colStatus: 'Status',
      colUsers: 'Users',
      colTrialEnds: 'Trial ends',
      colCreated: 'Created',
      colActions: 'Actions',
      empty: 'No companies found.',
      noPlan: 'No plan',
      changePlan: 'Change the plan of {name}',
      extendTrial: 'Extend the trial of {name}',
      reactivate: 'Reactivate {name}',
      suspend: 'Suspend {name}',
    },
  },
};

function row(overrides: Partial<PlatformTenantDto> = {}): PlatformTenantDto {
  return {
    id: 't1',
    slug: 'acme',
    name: 'Acme',
    legalName: null,
    taxId: null,
    email: 'ops@acme.test',
    phone: null,
    status: 'ACTIVE',
    trialEndsAt: null,
    planId: 'p1',
    planName: 'Pro',
    locale: 'pt-BR',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-01-15T10:00:00.000Z',
    userCount: 4,
    suspendedAt: null,
    suspendedReason: null,
    canceledAt: null,
    ...overrides,
  };
}

const handlers = () => ({
  onSearchChange: vi.fn(),
  onStatusChange: vi.fn(),
  onSuspend: vi.fn(),
  onReactivate: vi.fn(),
  onChangePlan: vi.fn(),
  onExtendTrial: vi.fn(),
});

function wrap(props: Partial<TenantsTableProps> & Pick<TenantsTableProps, 'rows'>) {
  const spies = handlers();
  const view = render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <TenantsTable search="" status="" {...spies} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...view, spies };
}

afterEach(cleanup);

describe('TenantsTable', () => {
  it('shows the company’s identity and metrics — never its records', () => {
    wrap({ rows: [row()] });

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('/acme')).toBeInTheDocument();
    expect(screen.getByText('ops@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('says "no plan" rather than leaving the cell blank', () => {
    wrap({ rows: [row({ planName: null })] });
    expect(screen.getByText('No plan')).toBeInTheDocument();
  });

  it('shows the suspension reason, which is what explains it afterwards', () => {
    wrap({ rows: [row({ status: 'SUSPENDED', suspendedReason: 'Chargeback' })] });
    expect(screen.getByText('Chargeback')).toBeInTheDocument();
  });

  it('shows loading and empty states instead of a bare table', () => {
    const loading = wrap({ rows: [], loading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    loading.unmount();

    wrap({ rows: [] });
    expect(screen.getByText('No companies found.')).toBeInTheDocument();
  });

  it('reports filter changes upward — it owns no state of its own', async () => {
    const { spies } = wrap({ rows: [row()] });

    await userEvent.type(screen.getByLabelText('Search'), 'ac');
    expect(spies.onSearchChange).toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED');
    expect(spies.onStatusChange).toHaveBeenCalledWith('SUSPENDED');

    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    expect(spies.onStatusChange).toHaveBeenLastCalledWith('');
  });

  it('offers suspend for a live company and reactivate for a suspended one', async () => {
    const live = wrap({ rows: [row()] });
    await userEvent.click(screen.getByRole('button', { name: 'Suspend Acme' }));
    expect(live.spies.onSuspend).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(screen.queryByRole('button', { name: 'Reactivate Acme' })).not.toBeInTheDocument();
    live.unmount();

    const suspended = wrap({ rows: [row({ status: 'SUSPENDED' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Acme' }));
    expect(suspended.spies.onReactivate).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Suspend Acme' })).not.toBeInTheDocument();
  });

  it('cannot suspend a company that is already cancelled', () => {
    wrap({ rows: [row({ status: 'CANCELED' })] });
    expect(screen.getByRole('button', { name: 'Suspend Acme' })).toBeDisabled();
  });

  it('offers extending the trial only while there is a trial to extend', async () => {
    const active = wrap({ rows: [row()] });
    expect(screen.getByRole('button', { name: 'Extend the trial of Acme' })).toBeDisabled();
    active.unmount();

    const trial = wrap({
      rows: [row({ status: 'TRIAL', trialEndsAt: '2026-02-01T00:00:00.000Z' })],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Extend the trial of Acme' }));
    expect(trial.spies.onExtendTrial).toHaveBeenCalled();
  });

  it('opens the plan dialog for the row that was clicked', async () => {
    const { spies } = wrap({ rows: [row()] });
    await userEvent.click(screen.getByRole('button', { name: 'Change the plan of Acme' }));
    expect(spies.onChangePlan).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });
});
