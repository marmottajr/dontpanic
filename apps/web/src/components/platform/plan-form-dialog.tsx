'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { upsertPlanSchema, type PlanDto, type UpsertPlanInput } from '@dontpanic/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Create/edit a commercial plan.
 *
 * Empty limits mean **unlimited** (the API stores `null`), and the price is
 * typed in the currency and converted to cents, which is how the contract
 * carries it. The final validation is the shared `upsertPlanSchema`, so the
 * dialog cannot accept what the API would refuse.
 *
 * `limits` and `features` are free-form JSON because they are the per-product
 * part of a plan: the boilerplate cannot know which counters your product
 * meters. They are also the two fields `PlanDto` does not return, so editing an
 * existing plan starts with them blank — and blank means "leave them as they
 * are", because the API only writes them when they are present.
 */
export interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = create. Present = edit that plan. */
  plan?: PlanDto | null;
  loading?: boolean;
  onSubmit: (input: UpsertPlanInput) => void;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  trialDays: string;
  maxUsers: string;
  maxStorageMb: string;
  sortOrder: string;
  limits: string;
  features: string;
  isDefault: boolean;
  active: boolean;
}

const EMPTY: FormState = {
  code: '',
  name: '',
  description: '',
  price: '0',
  currency: 'BRL',
  trialDays: '14',
  maxUsers: '',
  maxStorageMb: '',
  sortOrder: '0',
  limits: '',
  features: '',
  isDefault: false,
  active: true,
};

function fromPlan(plan: PlanDto): FormState {
  return {
    ...EMPTY,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    price: (plan.priceCents / 100).toFixed(2),
    currency: plan.currency,
    trialDays: String(plan.trialDays),
    maxUsers: plan.maxUsers === null ? '' : String(plan.maxUsers),
    maxStorageMb: plan.maxStorageMb === null ? '' : String(plan.maxStorageMb),
    active: plan.active,
  };
}

const optionalInt = (value: string): number | null =>
  value.trim() === '' ? null : Number.parseInt(value, 10);

/**
 * Blank is `undefined` (the field is not sent). Anything else has to be a JSON
 * object, and `null` signals a parse failure so the caller can say so instead of
 * silently dropping what the operator typed.
 */
function parseJsonRecord(value: string): Record<string, unknown> | null | undefined {
  if (value.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

const textareaClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm ' +
  'transition-colors placeholder:text-muted-foreground focus-visible:border-ring ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'aria-invalid:border-destructive aria-invalid:ring-destructive/30';

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  loading = false,
  onSubmit,
}: PlanFormDialogProps) {
  const t = useTranslations('platform.plans.form');
  const tc = useTranslations('common');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(plan ? fromPlan(plan) : EMPTY);
  }, [open, plan]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = () => {
    const limits = parseJsonRecord(form.limits);
    const features = parseJsonRecord(form.features);
    if (limits === null || features === null) {
      setError(t('invalidJson'));
      return;
    }

    const priceCents = Math.round(Number.parseFloat(form.price.replace(',', '.') || '0') * 100);
    const parsed = upsertPlanSchema.safeParse({
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() === '' ? null : form.description.trim(),
      priceCents: Number.isFinite(priceCents) ? priceCents : 0,
      currency: form.currency.trim().toUpperCase(),
      trialDays: Number.parseInt(form.trialDays || '0', 10),
      maxUsers: optionalInt(form.maxUsers),
      maxStorageMb: optionalInt(form.maxStorageMb),
      sortOrder: Number.parseInt(form.sortOrder || '0', 10),
      ...(limits === undefined ? {} : { limits }),
      ...(features === undefined ? {} : { features }),
      isDefault: form.isDefault,
      active: form.active,
    });

    if (!parsed.success) {
      setError(t('invalid'));
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="plan-code">{t('code')}</Label>
            <Input
              id="plan-code"
              value={form.code}
              onChange={(event) => set('code', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">{t('name')}</Label>
            <Input
              id="plan-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="plan-description">{t('description')}</Label>
            <Input
              id="plan-description"
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-price">{t('price')}</Label>
            <Input
              id="plan-price"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => set('price', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-currency">{t('currency')}</Label>
            <Input
              id="plan-currency"
              maxLength={3}
              value={form.currency}
              onChange={(event) => set('currency', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-trial">{t('trialDays')}</Label>
            <Input
              id="plan-trial"
              inputMode="numeric"
              value={form.trialDays}
              onChange={(event) => set('trialDays', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-sort">{t('sortOrder')}</Label>
            <Input
              id="plan-sort"
              inputMode="numeric"
              value={form.sortOrder}
              onChange={(event) => set('sortOrder', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-max-users">{t('maxUsers')}</Label>
            <Input
              id="plan-max-users"
              inputMode="numeric"
              placeholder={t('unlimitedPlaceholder')}
              value={form.maxUsers}
              onChange={(event) => set('maxUsers', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-max-storage">{t('maxStorageMb')}</Label>
            <Input
              id="plan-max-storage"
              inputMode="numeric"
              placeholder={t('unlimitedPlaceholder')}
              value={form.maxStorageMb}
              onChange={(event) => set('maxStorageMb', event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="plan-limits">{t('limits')}</Label>
            <textarea
              id="plan-limits"
              rows={3}
              className={textareaClass}
              placeholder='{"projects": 10}'
              value={form.limits}
              onChange={(event) => set('limits', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('limitsHint')}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="plan-features">{t('features')}</Label>
            <textarea
              id="plan-features"
              rows={3}
              className={textareaClass}
              placeholder='{"concurrentSessions": true}'
              value={form.features}
              onChange={(event) => set('features', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('featuresHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="plan-default"
              checked={form.isDefault}
              onCheckedChange={(checked) => set('isDefault', checked)}
            />
            <Label htmlFor="plan-default">{t('isDefault')}</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="plan-active"
              checked={form.active}
              onCheckedChange={(checked) => set('active', checked)}
            />
            <Label htmlFor="plan-active">{t('active')}</Label>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {plan ? tc('save') : t('createSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
