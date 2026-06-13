'use client';

import * as React from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Download, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  twoFactorEnableSchema,
  twoFactorDisableSchema,
  type TwoFactorEnableInput,
  type TwoFactorDisableInput,
  type TwoFactorEnableResponse,
  type TwoFactorSetupResponse,
  type UserDto,
} from '@dontpanic/shared';
import { useUser } from '@/hooks/use-auth';
import { api, ApiError } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Small reusable copy-to-clipboard button with a transient check state. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — silently ignore */
        }
      }}
    >
      {copied ? (
        <Check className="size-4 text-primary" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export function TwoFactorCard({ user }: { user: UserDto }) {
  const t = useTranslations('profile.twoFactor');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const qc = useQueryClient();
  const { refetch } = useUser();

  const [enableOpen, setEnableOpen] = React.useState(false);
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [setup, setSetup] = React.useState<TwoFactorSetupResponse | null>(null);
  const [setupLoading, setSetupLoading] = React.useState(false);
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);

  const enableForm = useForm<TwoFactorEnableInput>({
    resolver: zodResolver(twoFactorEnableSchema),
    defaultValues: { code: '' },
  });

  const disableForm = useForm<TwoFactorDisableInput>({
    resolver: zodResolver(twoFactorDisableSchema),
    defaultValues: { code: '', password: '' },
  });

  // The schema's refine() (need code OR password) reports at the object root,
  // which lands under an empty-string key — surface the first message we find.
  const disableErrors = disableForm.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const disableError =
    disableErrors['']?.message ??
    disableErrors.code?.message ??
    disableErrors.password?.message;

  async function refreshUser() {
    await refetch();
    qc.invalidateQueries({ queryKey: ['me'] });
  }

  // ── Enable flow ───────────────────────────────────────────────────────────
  async function startEnable() {
    setSetupLoading(true);
    setBackupCodes(null);
    enableForm.reset({ code: '' });
    try {
      const data = await api<TwoFactorSetupResponse>('/users/me/2fa/setup', { method: 'POST' });
      setSetup(data);
      setEnableOpen(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    } finally {
      setSetupLoading(false);
    }
  }

  async function confirmEnable(values: TwoFactorEnableInput) {
    try {
      const res = await api<TwoFactorEnableResponse>('/users/me/2fa/enable', {
        method: 'POST',
        body: { code: values.code },
      });
      setBackupCodes(res.backupCodes);
      await refreshUser();
      toast.success(t('enabledToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    }
  }

  function closeEnable() {
    setEnableOpen(false);
    setSetup(null);
    setBackupCodes(null);
    enableForm.reset({ code: '' });
  }

  // ── Disable flow ──────────────────────────────────────────────────────────
  async function confirmDisable(values: TwoFactorDisableInput) {
    try {
      await api('/users/me/2fa/disable', {
        method: 'POST',
        body: {
          ...(values.code ? { code: values.code } : {}),
          ...(values.password ? { password: values.password } : {}),
        },
      });
      await refreshUser();
      toast.success(t('disabledToast'));
      setDisableOpen(false);
      disableForm.reset({ code: '', password: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    }
  }

  // ── Backup codes helpers ──────────────────────────────────────────────────
  function downloadBackupCodes() {
    if (!backupCodes) return;
    const blob = new Blob([backupCodes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dontpanic-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('title')}
            {user.twoFactorEnabled && (
              <Badge variant="default">
                <ShieldCheck className="size-3" aria-hidden="true" />
                ON
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {user.twoFactorEnabled ? t('enabled') : t('disabled')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch
              checked={user.twoFactorEnabled}
              aria-label={t('title')}
              onCheckedChange={(checked) => {
                if (checked && !user.twoFactorEnabled) startEnable();
                else if (!checked && user.twoFactorEnabled) setDisableOpen(true);
              }}
              disabled={setupLoading}
            />
            <span className="font-mono text-sm text-muted-foreground">
              {user.twoFactorEnabled ? t('enabled') : t('disabled')}
            </span>
          </div>

          {user.twoFactorEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisableOpen(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {t('disable')}
            </Button>
          ) : (
            <Button type="button" onClick={startEnable} disabled={setupLoading}>
              {setupLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('enable')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Enable dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={enableOpen}
        onOpenChange={(open) => {
          if (!open) closeEnable();
        }}
      >
        <DialogContent className="max-w-md">
          {backupCodes ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('backupTitle')}</DialogTitle>
                <DialogDescription>{t('backupHint')}</DialogDescription>
              </DialogHeader>

              <Alert variant="success">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <AlertTitle>{t('enabledToast')}</AlertTitle>
              </Alert>

              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-3">
                {backupCodes.map((code) => (
                  <code
                    key={code}
                    className="select-all rounded bg-background px-2 py-1 text-center font-mono text-sm tracking-wider"
                  >
                    {code}
                  </code>
                ))}
              </div>

              <DialogFooter className="sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {});
                      toast.success(t('backupTitle'));
                    }}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    {t('backupTitle')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={downloadBackupCodes}>
                    <Download className="size-4" aria-hidden="true" />
                    .txt
                  </Button>
                </div>
                <Button type="button" onClick={closeEnable}>
                  {tc('continue')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={enableForm.handleSubmit(confirmEnable)} noValidate>
              <DialogHeader>
                <DialogTitle>{t('title')}</DialogTitle>
                <DialogDescription>{t('scan')}</DialogDescription>
              </DialogHeader>

              <div className="my-4 flex flex-col items-center gap-4">
                {setup?.qrCodeDataUrl && (
                  <Image
                    src={setup.qrCodeDataUrl}
                    alt={t('scan')}
                    width={192}
                    height={192}
                    unoptimized
                    className="size-48 rounded-lg border border-border bg-white p-2"
                  />
                )}

                {setup?.secret && (
                  <div className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <code className="flex-1 truncate font-mono text-xs tracking-wider">
                      {setup.secret}
                    </code>
                    <CopyButton value={setup.secret} label={t('title')} />
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="enable-2fa-code">{t('enterCode')}</Label>
                <Input
                  id="enable-2fa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                  aria-invalid={Boolean(enableForm.formState.errors.code)}
                  {...enableForm.register('code')}
                />
                {enableForm.formState.errors.code && (
                  <p className="text-xs text-destructive">
                    {enableForm.formState.errors.code.message}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="ghost" onClick={closeEnable}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={enableForm.formState.isSubmitting}>
                  {enableForm.formState.isSubmitting && (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  )}
                  {t('enable')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable dialog ──────────────────────────────────────────────────── */}
      <Dialog
        open={disableOpen}
        onOpenChange={(open) => {
          setDisableOpen(open);
          if (!open) disableForm.reset({ code: '', password: '' });
        }}
      >
        <DialogContent className="max-w-md">
          <form onSubmit={disableForm.handleSubmit(confirmDisable)} noValidate>
            <DialogHeader>
              <DialogTitle>{t('disable')}</DialogTitle>
              <DialogDescription>{t('enterCode')}</DialogDescription>
            </DialogHeader>

            <Alert variant="destructive" className="my-4">
              <ShieldAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{t('enabled')}</AlertDescription>
            </Alert>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="disable-2fa-code">{t('enterCode')}</Label>
                <Input
                  id="disable-2fa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                  {...disableForm.register('code', {
                    setValueAs: (v: string) => (v?.trim() ? v.trim() : undefined),
                  })}
                />
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="disable-2fa-password">{tc('password')}</Label>
                <Input
                  id="disable-2fa-password"
                  type="password"
                  autoComplete="current-password"
                  {...disableForm.register('password', {
                    setValueAs: (v: string) => (v ? v : undefined),
                  })}
                />
              </div>

              {disableError && <p className="text-xs text-destructive">{disableError}</p>}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDisableOpen(false)}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={disableForm.formState.isSubmitting}
              >
                {disableForm.formState.isSubmitting && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {t('disable')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
