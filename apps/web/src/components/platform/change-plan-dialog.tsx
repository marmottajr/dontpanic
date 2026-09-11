'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import type { PlanDto } from '@dontpanic/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from './format';

/** Moves a company to another plan. Only active plans are offered. */
export interface ChangePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  currentPlanId: string | null;
  plans: PlanDto[];
  loading?: boolean;
  onConfirm: (planId: string) => void;
}

export function ChangePlanDialog({
  open,
  onOpenChange,
  tenantName,
  currentPlanId,
  plans,
  loading = false,
  onConfirm,
}: ChangePlanDialogProps) {
  const t = useTranslations('platform.planDialog');
  const tc = useTranslations('common');
  const locale = useLocale();
  // An inactive plan stays listed while it is the company's current one:
  // hiding it would show the company as having no plan at all.
  const selectable = plans.filter((plan) => plan.active || plan.id === currentPlanId);
  const [planId, setPlanId] = useState(currentPlanId ?? '');

  useEffect(() => {
    if (open) setPlanId(currentPlanId ?? '');
  }, [open, currentPlanId]);

  const canConfirm = planId !== '' && planId !== currentPlanId && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: tenantName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="platform-change-plan">{t('planLabel')}</Label>
          <select
            id="platform-change-plan"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{t('choose')}</option>
            {selectable.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {formatMoney(plan.priceCents, plan.currency, locale)}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button disabled={!canConfirm} onClick={() => onConfirm(planId)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
