'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TwoFactorSetup } from '@/components/two-factor-setup';

/** Optional-mode nudge: pitch 2FA, let the user enable it inline, or snooze 24h. */
export function TwoFactorPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('twoFactorPrompt');
  const qc = useQueryClient();
  const [setupMode, setSetupMode] = useState(false);

  async function later() {
    try {
      await api('/users/me/2fa/snooze', { method: 'POST' });
    } catch {
      /* snooze is best-effort — closing is what matters */
    }
    onOpenChange(false);
  }

  function done() {
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['security'] });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-md">
        {setupMode ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('enable')}</DialogTitle>
            </DialogHeader>
            <TwoFactorSetup onDone={done} />
          </>
        ) : (
          <>
            <DialogHeader className="items-center text-center">
              <span className="flex size-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </span>
              <DialogTitle className="font-display text-xl">{t('title')}</DialogTitle>
              <DialogDescription>{t('body')}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:flex-col sm:gap-2">
              <Button className="w-full" onClick={() => setSetupMode(true)}>
                {t('enable')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={later}>
                {t('later')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
