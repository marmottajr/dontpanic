'use client';

import { useTranslations } from 'next-intl';
import type { TenantStatus } from '@dontpanic/shared';
import { Badge } from '@/components/ui/badge';

/**
 * One semantic colour per state, always through a token — so it reads in both
 * themes: trial = amber (accent), active = brand green (primary),
 * suspended = red (destructive), cancelled = neutral (secondary).
 */
const STATUS_VARIANT: Record<TenantStatus, 'default' | 'secondary' | 'accent' | 'destructive'> = {
  TRIAL: 'accent',
  ACTIVE: 'default',
  SUSPENDED: 'destructive',
  CANCELED: 'secondary',
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const t = useTranslations('platform.status');
  return (
    <Badge variant={STATUS_VARIANT[status]} data-status={status}>
      {t(status)}
    </Badge>
  );
}

export { STATUS_VARIANT };
