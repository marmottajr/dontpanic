'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { extendTrialSchema } from '@dontpanic/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Extends a company's trial by a number of days.
 *
 * The bounds come from `extendTrialSchema` (1–365), so a value the API would
 * refuse cannot be confirmed here — the dialog and the contract agree or the
 * operator finds out by getting a 400 for no visible reason.
 */
export interface ExtendTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  loading?: boolean;
  onConfirm: (days: number) => void;
}

const DEFAULT_DAYS = '14';

export function ExtendTrialDialog({
  open,
  onOpenChange,
  tenantName,
  loading = false,
  onConfirm,
}: ExtendTrialDialogProps) {
  const t = useTranslations('platform.trialDialog');
  const tc = useTranslations('common');
  const [days, setDays] = useState(DEFAULT_DAYS);

  useEffect(() => {
    if (open) setDays(DEFAULT_DAYS);
  }, [open]);

  const parsed = extendTrialSchema.safeParse({ days: Number.parseInt(days, 10) });
  const canConfirm = parsed.success && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: tenantName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="platform-extend-days">{t('daysLabel')}</Label>
          <Input
            id="platform-extend-days"
            inputMode="numeric"
            value={days}
            aria-invalid={!parsed.success}
            onChange={(event) => setDays(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('daysHint')}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => parsed.success && onConfirm(parsed.data.days)}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
