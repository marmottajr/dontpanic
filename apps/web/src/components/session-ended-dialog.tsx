'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import type { SessionEndedReason } from '@dontpanic/shared';
import { onSessionEnded, redirectToLogin } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Reasons worth interrupting the user for. An ordinary `logout` is the user's
 * own doing — explaining it back to them is noise, so the client just redirects.
 */
const EXPLAINED_REASONS = ['reuse-detected', 'signed-in-elsewhere', 'expired'] as const;
type ExplainedReason = (typeof EXPLAINED_REASONS)[number];

/**
 * Reasons where someone else may hold the password. This is the one moment when
 * "change your password" is useful advice rather than a generic nag.
 */
const SUSPICIOUS_REASONS: readonly ExplainedReason[] = ['reuse-detected', 'signed-in-elsewhere'];

function isExplained(reason: SessionEndedReason): reason is ExplainedReason {
  return (EXPLAINED_REASONS as readonly string[]).includes(reason);
}

/**
 * Mounted above every screen. When the session dies, the browser used to take a
 * bare 401 and land on /login with no explanation — someone signed out because
 * another person used their password saw the ordinary login form and concluded
 * the system was broken. This says what happened, in their language, before
 * sending them anywhere.
 */
export function SessionEndedDialog() {
  const t = useTranslations('session');
  const [reason, setReason] = useState<ExplainedReason | null>(null);

  useEffect(
    () =>
      onSessionEnded((ended) => {
        if (!isExplained(ended)) return; // `logout`: let the default redirect run
        setReason(ended);
        return true; // we own the explanation; do not redirect behind our back
      }),
    [],
  );

  if (reason === null) return null;

  const suspicious = SUSPICIOUS_REASONS.includes(reason);

  return (
    <Dialog open onOpenChange={redirectToLogin}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert
              aria-hidden="true"
              className={suspicious ? 'size-5 text-destructive' : 'size-5 text-muted-foreground'}
            />
            {t(`${reason}.title`)}
          </DialogTitle>
          <DialogDescription>{t(`${reason}.description`)}</DialogDescription>
        </DialogHeader>

        {suspicious ? <p className="text-sm text-muted-foreground">{t('advice')}</p> : null}

        <DialogFooter>
          {suspicious ? (
            <Button variant="outline" onClick={() => window.location.assign('/forgot-password')}>
              {t('changePassword')}
            </Button>
          ) : null}
          <Button onClick={redirectToLogin}>{t('signInAgain')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
