'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { OtpInput } from '@/components/ui/otp-input';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verify');
  const router = useRouter();
  const email = useSearchParams().get('email') ?? '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function submit(value: string) {
    if (value.length !== CODE_LENGTH || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/verify-email', { method: 'POST', body: { email, code: value } });
      setVerified(true);
      toast.success(t('success'));
      setTimeout(() => router.push('/login'), 1200);
    } catch {
      setError(t('error'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN);
    try {
      await api('/auth/resend-verification', { method: 'POST', body: { email } });
      toast.success(t('resent'));
    } catch {
      toast.error(t('error'));
    }
  }

  if (!email) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="items-center gap-3 text-center">
          <Brand size="md" className="mb-1" />
          <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>{t('noEmail')}</AlertTitle>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/register">{t('goToLogin')}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="items-center gap-3 text-center">
        <Brand size="md" className="mb-1" />
        <span className="flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
          <MailCheck className="size-5" />
        </span>
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle', { email })}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {verified ? (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertTitle>{t('success')}</AlertTitle>
          </Alert>
        ) : (
          <>
            <OtpInput
              value={code}
              onChange={setCode}
              disabled={submitting}
              autoFocus
              onComplete={submit}
              ariaLabel={t('codeLabel')}
            />
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              disabled={code.length !== CODE_LENGTH || submitting}
              onClick={() => submit(code)}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t('submit')}
            </Button>
            <button
              type="button"
              onClick={resend}
              disabled={cooldown > 0}
              className="w-full text-center font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {cooldown > 0 ? t('resendCooldown', { seconds: cooldown }) : t('resend')}
            </button>
          </>
        )}
      </CardContent>

      <CardFooter>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">{t('goToLogin')}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
