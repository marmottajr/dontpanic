'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  emailChangeRequestSchema,
  type EmailChangeRequestInput,
  type UserDto,
} from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/components/ui/otp-input';

/** Change the account email in two steps: password-gated request, then a code. */
export function EmailCard({ user }: { user: UserDto }) {
  const t = useTranslations('profile.email');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const qc = useQueryClient();
  const [step, setStep] = useState<'idle' | 'form' | 'otp'>('idle');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailChangeRequestInput>({
    resolver: zodResolver(emailChangeRequestSchema),
    defaultValues: { newEmail: '', password: '' },
  });

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));

  function backToIdle() {
    setStep('idle');
    setCode('');
    reset();
  }

  async function requestChange(values: EmailChangeRequestInput) {
    try {
      await api('/users/me/email/change-request', { method: 'POST', body: values });
      setPendingEmail(values.newEmail);
      setStep('otp');
      toast.success(t('codeSent'));
    } catch (err) {
      fail(err);
    }
  }

  async function verify(value: string) {
    if (value.length < 4 || verifying) return;
    setVerifying(true);
    try {
      await api('/users/me/email/change-verify', { method: 'POST', body: { code: value } });
      toast.success(t('changed'));
      await qc.invalidateQueries({ queryKey: ['me'] });
      backToIdle();
    } catch (err) {
      fail(err);
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription className="font-mono">{user.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:max-w-sm">
        {step === 'idle' && (
          <Button variant="outline" onClick={() => setStep('form')}>
            {t('change')}
          </Button>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit(requestChange)} noValidate className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="new-email">{t('newEmail')}</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.newEmail)}
                {...register('newEmail')}
              />
              {errors.newEmail && (
                <p className="text-xs text-destructive">{errors.newEmail.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-password">{tc('password')}</Label>
              <Input
                id="email-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {t('sendCode')}
              </Button>
              <Button type="button" variant="ghost" onClick={backToIdle}>
                {tc('cancel')}
              </Button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('enterCode', { email: pendingEmail })}
            </p>
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={verify}
              autoFocus
              disabled={verifying}
              ariaLabel={t('code')}
            />
            <Button type="button" variant="ghost" onClick={backToIdle}>
              {tc('cancel')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
