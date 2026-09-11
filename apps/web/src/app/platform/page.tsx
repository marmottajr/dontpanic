'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/platform/stat-card';
import { SignupsChart } from '@/components/platform/signups-chart';
import { formatNumber } from '@/components/platform/format';
import {
  usePlatformAccess,
  usePlatformDeniedRedirect,
  usePlatformStats,
} from '@/components/platform/platform-api';

/** The platform overview: the numbers for the whole SaaS. */
export default function PlatformOverviewPage() {
  const t = useTranslations('platform.overview');
  const locale = useLocale();
  const { allowed } = usePlatformAccess();
  const { data, isLoading, error } = usePlatformStats(allowed);
  usePlatformDeniedRedirect(error);

  const n = (value: number) => formatNumber(value, locale);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="font-mono text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section aria-labelledby="platform-companies" className="space-y-3">
            <h2 id="platform-companies" className="font-display text-lg font-semibold">
              {t('companiesTitle')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard label={t('tenantsTotal')} value={n(data.totalTenants)} />
              <StatCard label={t('trial')} value={n(data.tenants.TRIAL ?? 0)} tone="trial" />
              <StatCard label={t('active')} value={n(data.tenants.ACTIVE ?? 0)} tone="active" />
              <StatCard
                label={t('suspended')}
                value={n(data.tenants.SUSPENDED ?? 0)}
                tone="suspended"
              />
              <StatCard
                label={t('canceled')}
                value={n(data.tenants.CANCELED ?? 0)}
                tone="canceled"
              />
              <StatCard label={t('usersTotal')} value={n(data.totalUsers)} />
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t('chartTitle')}</CardTitle>
              <CardDescription>{t('chartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SignupsChart data={data.signups} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
