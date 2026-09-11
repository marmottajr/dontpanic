'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { suspendTenantSchema } from '@dontpanic/shared';
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

/**
 * Suspending a company. A `Dialog` styled like `ConfirmDialog` — rather than
 * `ConfirmDialog` itself — because suspension requires a reason, and the reason
 * has to be written inside the confirmation step.
 *
 * The copy says what the action actually does: that company's users lose access
 * immediately. Confirm only becomes available with a valid reason, and the
 * validation is the shared contract's (`suspendTenantSchema`, minimum 3
 * characters), so the button cannot disagree with what the API accepts.
 */
export interface SuspendTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
}

export function SuspendTenantDialog({
  open,
  onOpenChange,
  tenantName,
  loading = false,
  onConfirm,
}: SuspendTenantDialogProps) {
  const t = useTranslations('platform.suspendDialog');
  const tc = useTranslations('common');
  const [reason, setReason] = useState('');

  // every opening starts blank: a reason is not inherited from another suspension.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const parsed = suspendTenantSchema.safeParse({ reason: reason.trim() });
  const canConfirm = parsed.success && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: tenantName })}</DialogTitle>
          <DialogDescription>{t('description', { name: tenantName })}</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t('effect')}</span>
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="platform-suspend-reason">{t('reasonLabel')}</Label>
          <textarea
            id="platform-suspend-reason"
            value={reason}
            rows={3}
            maxLength={500}
            placeholder={t('reasonPlaceholder')}
            aria-invalid={reason.length > 0 && !parsed.success}
            aria-describedby="platform-suspend-reason-hint"
            onChange={(event) => setReason(event.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/30"
          />
          <p id="platform-suspend-reason-hint" className="text-xs text-muted-foreground">
            {t('reasonHint')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
