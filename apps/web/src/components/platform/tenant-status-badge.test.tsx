import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { tenantStatuses } from '@dontpanic/shared';
import { STATUS_VARIANT, TenantStatusBadge } from './tenant-status-badge';

const messages = {
  platform: {
    status: { TRIAL: 'Trial', ACTIVE: 'Active', SUSPENDED: 'Suspended', CANCELED: 'Cancelled' },
  },
};

afterEach(cleanup);

describe('TenantStatusBadge', () => {
  it('has a translated label and a distinct variant for every status', () => {
    for (const status of tenantStatuses) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en-US" messages={messages}>
          <TenantStatusBadge status={status} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(messages.platform.status[status])).toHaveAttribute(
        'data-status',
        status,
      );
      unmount();
    }
    expect(new Set(Object.values(STATUS_VARIANT)).size).toBe(tenantStatuses.length);
  });
});
