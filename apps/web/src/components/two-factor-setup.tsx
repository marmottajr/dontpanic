'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, Download, Loader2, ShieldCheck } from 'lucide-react';
import type { TwoFactorEnableResponse, TwoFactorSetupResponse } from '@dontpanic/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';
import { Alert, AlertTitle } from '@/components/ui/alert';

/**
 * Self-contained 2FA enrolment: fetches a secret/QR, verifies a TOTP code, then
 * reveals the one-time backup codes. Reused by the optional prompt dialog and
 * the forced /setup-2fa page. Uses the authenticated /users/me/2fa endpoints.
 */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const t = useTranslations('twoFactorSetup');
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<TwoFactorSetupResponse>('/users/me/2fa/setup', { method: 'POST' })
      .then((s) => active && setSetup(s))
      .catch(() => active && setError(t('error')));
    return () => {
      active = false;
    };
  }, [t]);

  async function enable(value: string) {
    if (value.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<TwoFactorEnableResponse>('/users/me/2fa/enable', {
        method: 'POST',
        body: { code: value },
      });
      setBackupCodes(res.backupCodes);
      toast.success(t('enabled'));
    } catch {
      setError(t('invalidCode'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  function copySecret() {
    if (!setup) return;
    void navigator.clipboard?.writeText(setup.secret);
    toast.success(t('copied'));
  }

  function downloadBackup() {
    if (!backupCodes) return;
    const blob = new Blob([`${backupCodes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dontpanic-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (backupCodes) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h3 className="font-display text-lg font-semibold">{t('backupTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('backupBody')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm">
          {backupCodes.map((c) => (
            <span key={c} className="text-center tracking-widest">
              {c}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={downloadBackup}>
            <Download className="size-4" />
            {t('download')}
          </Button>
          <Button className="flex-1" onClick={onDone}>
            {t('done')}
          </Button>
        </div>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="py-8 text-center">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h3 className="font-display text-lg font-semibold">{t('scanTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('scanBody')}</p>
      </div>
      <img
        src={setup.qrCodeDataUrl}
        alt="2FA QR code"
        className="mx-auto size-44 rounded-lg border border-border bg-white p-2"
      />
      <div className="space-y-1">
        <p className="text-center text-xs text-muted-foreground">{t('secretLabel')}</p>
        <button
          type="button"
          onClick={copySecret}
          className="mx-auto flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
        >
          <span className="tracking-wider">{setup.secret}</span>
          <Copy className="size-3.5 text-muted-foreground" />
        </button>
      </div>
      <OtpInput
        value={code}
        onChange={setCode}
        autoFocus
        onComplete={enable}
        ariaLabel={t('codeLabel')}
        disabled={submitting}
      />
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <Button
        className="w-full"
        disabled={code.length !== 6 || submitting}
        onClick={() => enable(code)}
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {t('enable')}
      </Button>
    </div>
  );
}
