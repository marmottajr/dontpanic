'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PlatformTenantDto, TenantStatus } from '@dontpanic/shared';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { TenantsTable } from '@/components/platform/tenants-table';
import { SuspendTenantDialog } from '@/components/platform/suspend-tenant-dialog';
import { ChangePlanDialog } from '@/components/platform/change-plan-dialog';
import { ExtendTrialDialog } from '@/components/platform/extend-trial-dialog';
import {
  useChangeTenantPlan,
  useExtendTrial,
  usePlatformAccess,
  usePlatformDeniedRedirect,
  usePlatformPlans,
  usePlatformTenants,
  useReactivateTenant,
  useSuspendTenant,
} from '@/components/platform/platform-api';

const PAGE_SIZE = 20;

/** Every company on the platform, and the four levers the operator has. */
export default function PlatformTenantsPage() {
  const t = useTranslations('platform.tenants');
  const tToast = useTranslations('platform.toast');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const { allowed } = usePlatformAccess();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TenantStatus | ''>('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading, error } = usePlatformTenants(
    { page, limit: PAGE_SIZE, search: debouncedSearch, status },
    allowed,
  );
  usePlatformDeniedRedirect(error);
  const { data: plans } = usePlatformPlans(allowed);

  const [suspending, setSuspending] = useState<PlatformTenantDto | null>(null);
  const [reactivating, setReactivating] = useState<PlatformTenantDto | null>(null);
  const [changingPlan, setChangingPlan] = useState<PlatformTenantDto | null>(null);
  const [extending, setExtending] = useState<PlatformTenantDto | null>(null);

  const suspend = useSuspendTenant();
  const reactivate = useReactivateTenant();
  const changePlan = useChangeTenantPlan();
  const extendTrial = useExtendTrial();

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="font-mono text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <TenantsTable
        rows={data?.items ?? []}
        loading={isLoading}
        search={search}
        status={status}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        onSuspend={setSuspending}
        onReactivate={setReactivating}
        onChangePlan={setChangingPlan}
        onExtendTrial={setExtending}
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">{t('pageOf', { page, totalPages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('next')}
          </Button>
        </div>
      ) : null}

      <SuspendTenantDialog
        open={Boolean(suspending)}
        onOpenChange={(open) => !open && setSuspending(null)}
        tenantName={suspending?.name ?? ''}
        loading={suspend.isPending}
        onConfirm={(reason) => {
          if (!suspending) return;
          suspend.mutate(
            { id: suspending.id, input: { reason } },
            {
              onSuccess: () => {
                toast.success(tToast('tenantSuspended'));
                setSuspending(null);
              },
              onError: (err) => {
                setSuspending(null);
                fail(err);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={Boolean(reactivating)}
        onOpenChange={(open) => !open && setReactivating(null)}
        title={t('reactivateTitle')}
        description={t('reactivateConfirm', { name: reactivating?.name ?? '' })}
        confirmLabel={tc('confirm')}
        cancelLabel={tc('cancel')}
        loading={reactivate.isPending}
        onConfirm={() => {
          if (!reactivating) return;
          reactivate.mutate(reactivating.id, {
            onSuccess: () => {
              toast.success(tToast('tenantReactivated'));
              setReactivating(null);
            },
            onError: (err) => {
              setReactivating(null);
              fail(err);
            },
          });
        }}
      />

      <ChangePlanDialog
        open={Boolean(changingPlan)}
        onOpenChange={(open) => !open && setChangingPlan(null)}
        tenantName={changingPlan?.name ?? ''}
        currentPlanId={changingPlan?.planId ?? null}
        plans={plans ?? []}
        loading={changePlan.isPending}
        onConfirm={(planId) => {
          if (!changingPlan) return;
          changePlan.mutate(
            { id: changingPlan.id, input: { planId } },
            {
              onSuccess: () => {
                toast.success(tToast('planChanged'));
                setChangingPlan(null);
              },
              onError: (err) => {
                setChangingPlan(null);
                fail(err);
              },
            },
          );
        }}
      />

      <ExtendTrialDialog
        open={Boolean(extending)}
        onOpenChange={(open) => !open && setExtending(null)}
        tenantName={extending?.name ?? ''}
        loading={extendTrial.isPending}
        onConfirm={(days) => {
          if (!extending) return;
          extendTrial.mutate(
            { id: extending.id, input: { days } },
            {
              onSuccess: () => {
                toast.success(tToast('trialExtended'));
                setExtending(null);
              },
              onError: (err) => {
                setExtending(null);
                fail(err);
              },
            },
          );
        }}
      />
    </div>
  );
}
