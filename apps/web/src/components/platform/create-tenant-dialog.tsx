'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  platformCreateTenantSchema,
  type PlanDto,
  type PlatformCreateTenantInput,
} from '@dontpanic/shared';
import { slugify } from '@/lib/masks';
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
 * The operator creating a company on someone's behalf — a sale closed on the
 * phone, an onboarding done for a customer who will never see the signup form.
 *
 * Two things this dialog will never have, and both are the point:
 *
 *  - **No password field.** The operator names the first administrator and the
 *    system invites them. Nobody at the vendor ever knows a customer's
 *    credential, and the address is proven by the acceptance rather than taken
 *    on faith. The UI says so out loud, because "create a company" reads like
 *    "create an account" and an operator who expects to hand over a password
 *    will otherwise go looking for one.
 *  - **No derived commercial terms.** Plan, status and trial length are
 *    decisions being made here, not defaults inherited from whichever plan
 *    happens to carry `isDefault`.
 *
 * Like `PlanFormDialog`, the final word is the shared schema via `safeParse`:
 * the dialog cannot submit something the API would refuse.
 */
export interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PlanDto[];
  loading?: boolean;
  onSubmit: (input: PlatformCreateTenantInput) => void;
}

interface FormState {
  companyName: string;
  slug: string;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  planId: string;
  status: 'TRIAL' | 'ACTIVE';
  trialDays: string;
  locale: string;
  currency: string;
  timezone: string;
  adminName: string;
  adminEmail: string;
  sendInvitation: boolean;
}

const EMPTY: FormState = {
  companyName: '',
  slug: '',
  legalName: '',
  taxId: '',
  email: '',
  phone: '',
  planId: '',
  status: 'TRIAL',
  trialDays: '',
  locale: '',
  currency: '',
  timezone: '',
  adminName: '',
  adminEmail: '',
  sendInvitation: true,
};

/** Blank stays out of the payload; the API's own default then applies. */
const optionalText = (value: string): string | undefined =>
  value.trim() === '' ? undefined : value.trim();

/** Blank means "no value", which for a nullish field is an explicit null. */
const nullableText = (value: string): string | null => (value.trim() === '' ? null : value.trim());

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

export function CreateTenantDialog({
  open,
  onOpenChange,
  plans,
  loading = false,
  onSubmit,
}: CreateTenantDialogProps) {
  const t = useTranslations('platform.createTenant');
  const tStatus = useTranslations('platform.status');
  const tc = useTranslations('common');

  const [form, setForm] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setSlugTouched(false);
    setError(null);
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = () => {
    const trialDays = form.trialDays.trim();
    const parsed = platformCreateTenantSchema.safeParse({
      companyName: form.companyName.trim(),
      slug: form.slug.trim(),
      legalName: nullableText(form.legalName),
      taxId: nullableText(form.taxId),
      email: form.email.trim(),
      phone: nullableText(form.phone),
      planId: form.planId === '' ? null : form.planId,
      status: form.status,
      // Ignored by the API unless the company starts on TRIAL, but sending it
      // anyway would let an operator "set" a trial length on an ACTIVE company
      // and believe it took.
      ...(form.status === 'TRIAL' && trialDays !== ''
        ? { trialDays: Number.parseInt(trialDays, 10) }
        : {}),
      locale: optionalText(form.locale),
      currency: optionalText(form.currency)?.toUpperCase(),
      timezone: optionalText(form.timezone),
      adminEmail: form.adminEmail.trim(),
      adminName: form.adminName.trim(),
      sendInvitation: form.sendInvitation,
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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:col-span-2">
            {t('companyLegend')}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">{t('companyName')}</Label>
            <Input
              id="tenant-name"
              value={form.companyName}
              onChange={(event) => {
                const value = event.target.value;
                setForm((previous) => ({
                  ...previous,
                  companyName: value,
                  // Deriving the address stops the moment it is edited by hand.
                  slug: slugTouched ? previous.slug : slugify(value),
                }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-slug">{t('slug')}</Label>
            <Input
              id="tenant-slug"
              spellCheck={false}
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set('slug', event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-legal-name">{t('legalName')}</Label>
            <Input
              id="tenant-legal-name"
              value={form.legalName}
              onChange={(event) => set('legalName', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-tax-id">{t('taxId')}</Label>
            <Input
              id="tenant-tax-id"
              value={form.taxId}
              onChange={(event) => set('taxId', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-email">{t('email')}</Label>
            <Input
              id="tenant-email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-phone">{t('phone')}</Label>
            <Input
              id="tenant-phone"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </div>

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:col-span-2">
            {t('commercialLegend')}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-plan">{t('plan')}</Label>
            <select
              id="tenant-plan"
              className={selectClass}
              value={form.planId}
              onChange={(event) => set('planId', event.target.value)}
            >
              <option value="">{t('noPlan')}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-status">{t('status')}</Label>
            <select
              id="tenant-status"
              className={selectClass}
              value={form.status}
              onChange={(event) => set('status', event.target.value as FormState['status'])}
            >
              <option value="TRIAL">{tStatus('TRIAL')}</option>
              <option value="ACTIVE">{tStatus('ACTIVE')}</option>
            </select>
          </div>
          {form.status === 'TRIAL' ? (
            <div className="space-y-1.5">
              <Label htmlFor="tenant-trial-days">{t('trialDays')}</Label>
              <Input
                id="tenant-trial-days"
                inputMode="numeric"
                placeholder={t('trialDaysPlaceholder')}
                value={form.trialDays}
                onChange={(event) => set('trialDays', event.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-currency">{t('currency')}</Label>
            <Input
              id="tenant-currency"
              maxLength={3}
              value={form.currency}
              onChange={(event) => set('currency', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-locale">{t('locale')}</Label>
            <Input
              id="tenant-locale"
              value={form.locale}
              onChange={(event) => set('locale', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-timezone">{t('timezone')}</Label>
            <Input
              id="tenant-timezone"
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
            />
          </div>

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:col-span-2">
            {t('adminLegend')}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-admin-name">{t('adminName')}</Label>
            <Input
              id="tenant-admin-name"
              value={form.adminName}
              onChange={(event) => set('adminName', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-admin-email">{t('adminEmail')}</Label>
            <Input
              id="tenant-admin-email"
              type="email"
              value={form.adminEmail}
              onChange={(event) => set('adminEmail', event.target.value)}
            />
          </div>

          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
            {t('noPasswordNotice')}
          </p>

          <div className="flex items-start gap-3 sm:col-span-2">
            <Switch
              id="tenant-send-invitation"
              checked={form.sendInvitation}
              onCheckedChange={(checked) => set('sendInvitation', checked)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="tenant-send-invitation">{t('sendInvitation')}</Label>
              <p className="text-xs text-muted-foreground">
                {form.sendInvitation ? t('sendInvitationOn') : t('sendInvitationOff')}
              </p>
            </div>
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
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
