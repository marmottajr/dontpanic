import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PlanDto } from '@dontpanic/shared';
import type { ReactNode } from 'react';
import { CreateTenantDialog } from './create-tenant-dialog';

// No inter-keystroke delay: this file fills a long form several times over.
const user = userEvent.setup({ delay: null });

const messages = {
  common: { cancel: 'Cancel' },
  platform: {
    status: { TRIAL: 'Trial', ACTIVE: 'Active', SUSPENDED: 'Suspended', CANCELED: 'Cancelled' },
    createTenant: {
      newTenant: 'New company',
      title: 'New company',
      subtitle: 'Register the company and invite its first administrator.',
      companyLegend: 'The company',
      companyName: 'Company name',
      slug: 'Address (slug)',
      legalName: 'Legal name',
      taxId: 'Tax ID',
      email: 'Company email',
      emailHint: 'Not the administrator’s.',
      phone: 'Phone',
      commercialLegend: 'Commercial terms',
      plan: 'Plan',
      noPlan: 'No plan',
      status: 'Initial status',
      trialDays: 'Trial days',
      trialDaysPlaceholder: 'Use the plan’s own',
      currency: 'Currency',
      locale: 'Language',
      timezone: 'Time zone',
      adminLegend: 'The first administrator',
      adminName: 'Administrator name',
      adminEmail: 'Administrator email',
      noPasswordNotice: 'The administrator gets an invitation, not a password.',
      sendInvitation: 'Send the invitation now',
      sendInvitationOn: 'The invitation goes out as soon as the company is created.',
      sendInvitationOff: 'Nobody is emailed now.',
      submit: 'Create company',
      invalid: 'Check the fields.',
    },
  },
};

const PLANS: PlanDto[] = [
  {
    id: '0f4d2a1e-2c33-4a4f-9f7f-2f2f9b1c0001',
    code: 'pro',
    name: 'Pro',
    description: null,
    priceCents: 9900,
    currency: 'BRL',
    trialDays: 14,
    maxUsers: 10,
    maxStorageMb: null,
    active: true,
  },
];

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function open(props: Partial<React.ComponentProps<typeof CreateTenantDialog>> = {}) {
  const onSubmit = vi.fn();
  const view = wrap(
    <CreateTenantDialog open onOpenChange={vi.fn()} plans={PLANS} onSubmit={onSubmit} {...props} />,
  );
  return { ...view, onSubmit };
}

/** The four fields the contract will not do without. */
async function fillMinimum() {
  await user.type(screen.getByLabelText('Company name'), 'Sirius Cybernetics');
  await user.type(screen.getByLabelText('Company email'), 'contato@sirius.example');
  await user.type(screen.getByLabelText('Administrator name'), 'Arthur Dent');
  await user.type(screen.getByLabelText('Administrator email'), 'arthur@sirius.example');
}

afterEach(cleanup);

describe('CreateTenantDialog', () => {
  it('never offers a password field — the administrator is invited, not issued one', () => {
    open();

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('The administrator gets an invitation, not a password.'),
    ).toBeInTheDocument();
  });

  it('sends a contract-shaped company, blanks collapsed to null', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Sirius Cybernetics',
        // Derived from the name, so the operator does not have to invent one.
        slug: 'sirius-cybernetics',
        legalName: null,
        taxId: null,
        phone: null,
        planId: null,
        status: 'TRIAL',
        adminName: 'Arthur Dent',
        adminEmail: 'arthur@sirius.example',
        sendInvitation: true,
      }),
    );
  });

  it('stops deriving the slug once it is edited by hand', async () => {
    const { onSubmit } = open();
    await user.type(screen.getByLabelText('Address (slug)'), 'the-guide');
    await fillMinimum();
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ slug: 'the-guide' }));
  });

  it('carries the commercial decisions through', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.selectOptions(screen.getByLabelText('Plan'), PLANS[0]!.id);
    await user.type(screen.getByLabelText('Trial days'), '30');
    await user.type(screen.getByLabelText('Currency'), 'usd');
    await user.type(screen.getByLabelText('Language'), 'en-US');
    await user.type(screen.getByLabelText('Time zone'), 'UTC');
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: PLANS[0]!.id,
        trialDays: 30,
        // Upper-cased before validation: the contract wants a 3-letter code and
        // an operator typing lowercase is not making a mistake.
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
      }),
    );
  });

  it('hides the trial length on an ACTIVE company and never sends it', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.type(screen.getByLabelText('Trial days'), '30');
    await user.selectOptions(screen.getByLabelText('Initial status'), 'ACTIVE');

    // Sending it anyway would let an operator "set" a trial the API ignores and
    // walk away believing it took.
    expect(screen.queryByLabelText('Trial days')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    const [sent] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(sent.status).toBe('ACTIVE');
    expect(sent).not.toHaveProperty('trialDays');
  });

  it('keeps the optional company details when they are filled in', async () => {
    const { onSubmit } = open();
    await fillMinimum();
    await user.type(screen.getByLabelText('Legal name'), 'Sirius Cybernetics Corp.');
    await user.type(screen.getByLabelText('Tax ID'), '12345678000199');
    await user.type(screen.getByLabelText('Phone'), '+55 11 4002-8922');
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        legalName: 'Sirius Cybernetics Corp.',
        taxId: '12345678000199',
        phone: '+55 11 4002-8922',
      }),
    );
  });

  it('says plainly what turning the invitation off means', async () => {
    const { onSubmit } = open();
    expect(
      screen.getByText('The invitation goes out as soon as the company is created.'),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText('Send the invitation now'));
    expect(screen.getByText('Nobody is emailed now.')).toBeInTheDocument();

    await fillMinimum();
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sendInvitation: false }));
  });

  it('refuses what the shared schema refuses, and says so', async () => {
    const { onSubmit } = open();
    await user.type(screen.getByLabelText('Company name'), 'Sirius');
    await user.type(screen.getByLabelText('Company email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Check the fields.');
  });

  it('clears the complaint once the form is valid', async () => {
    const { onSubmit } = open();
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await fillMinimum();
    await user.click(screen.getByRole('button', { name: 'Create company' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('locks the buttons while the company is being created', () => {
    open({ loading: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create company' })).toBeDisabled();
  });

  it('closes without creating anything when cancelled', async () => {
    const onOpenChange = vi.fn();
    wrap(<CreateTenantDialog open onOpenChange={onOpenChange} plans={PLANS} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing while closed', () => {
    wrap(
      <CreateTenantDialog open={false} onOpenChange={vi.fn()} plans={PLANS} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  });
});
