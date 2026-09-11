'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import type { PlanDto, UpsertPlanInput } from '@dontpanic/shared';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlanFormDialog } from '@/components/platform/plan-form-dialog';
import { formatMoney, formatNumber } from '@/components/platform/format';
import {
  useCreatePlan,
  usePlatformAccess,
  usePlatformDeniedRedirect,
  usePlatformPlans,
  useUpdatePlan,
} from '@/components/platform/platform-api';

/**
 * The commercial plan catalogue.
 *
 * There is no delete: the API exposes no route for it, and it should not — a
 * plan a company is on cannot vanish without leaving that company planless.
 * Retiring a plan is done by unticking "active", which keeps it working for
 * whoever already has it while hiding it from new signups.
 */
export default function PlatformPlansPage() {
  const t = useTranslations('platform.plans');
  const tToast = useTranslations('platform.toast');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const locale = useLocale();
  const { allowed } = usePlatformAccess();
  const { data: plans, isLoading, error } = usePlatformPlans(allowed);
  usePlatformDeniedRedirect(error);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanDto | null>(null);

  const create = useCreatePlan();
  const update = useUpdatePlan();

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));

  const submit = (input: UpsertPlanInput) => {
    if (editing) {
      update.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => {
            toast.success(tToast('planUpdated'));
            setFormOpen(false);
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: () => {
        toast.success(tToast('planCreated'));
        setFormOpen(false);
      },
      onError: fail,
    });
  };

  const limit = (value: number | null) =>
    value === null ? t('unlimited') : formatNumber(value, locale);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="font-mono text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          {t('newPlan')}
        </Button>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colName')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colPrice')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colTrial')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colLimits')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colStatus')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('colActions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {tc('loading')}
                </td>
              </tr>
            ) : !plans || plans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{plan.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{plan.code}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMoney(plan.priceCents, plan.currency, locale)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t('trialDaysValue', { days: plan.trialDays })}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t('limitsSummary', {
                      users: limit(plan.maxUsers),
                      storage: limit(plan.maxStorageMb),
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.active ? 'default' : 'secondary'}>
                      {plan.active ? t('activeTag') : t('inactiveTag')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('edit', { name: plan.name })}
                        onClick={() => {
                          setEditing(plan);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        plan={editing}
        loading={create.isPending || update.isPending}
        onSubmit={submit}
      />
    </div>
  );
}
