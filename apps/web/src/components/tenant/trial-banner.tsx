'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock } from 'lucide-react';
import type { TenantStatus } from '@dontpanic/shared';
import { daysUntil } from '@/lib/masks';
import { cn } from '@/lib/utils';
import { useTenant } from './use-tenant';

/** How few days have to be left before the notice stops being discreet. */
const URGENT_DAYS = 3;

/**
 * The trial strip, with no state of its own so it can be tested apart from
 * TanStack Query. It only shows during `TRIAL` — an active company has nothing
 * to read here, and a blocked one sees the blocked screen, not a strip.
 */
export function TrialNotice({
  status,
  trialEndsAt,
  now,
}: {
  status: TenantStatus;
  trialEndsAt: string | null;
  now?: Date;
}) {
  const t = useTranslations('tenant.trial');
  if (status !== 'TRIAL') return null;

  const days = daysUntil(trialEndsAt, now);
  const urgent = days <= URGENT_DAYS;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-xs sm:px-6 md:px-10',
        urgent
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-accent/40 bg-accent/15 text-accent-strong',
      )}
    >
      {urgent ? (
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="font-medium">{days === 0 ? t('endsToday') : t('daysLeft', { days })}</span>
      <span className="opacity-80">{t('hint')}</span>
      <Link href="/profile" className="font-medium underline underline-offset-4 hover:no-underline">
        {t('seePlan')}
      </Link>
    </div>
  );
}

/** Wires the strip to the session's company. */
export function TrialBanner() {
  const { data: tenant } = useTenant();
  if (!tenant) return null;
  return <TrialNotice status={tenant.status} trialEndsAt={tenant.trialEndsAt} />;
}
