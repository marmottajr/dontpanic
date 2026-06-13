'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertTitle } from '@/components/ui/alert';

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verify');
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>('loading');
  // Guard against React Strict Mode double-invoking the effect in dev.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setStatus('error');
      return;
    }

    let active = true;
    (async () => {
      try {
        await api(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (active) setStatus('success');
      } catch {
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="items-center gap-3 text-center">
        <Brand size="md" className="mb-1" />
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-4 font-mono text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>{t('title')}…</span>
          </div>
        )}
        {status === 'success' && (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertTitle>{t('success')}</AlertTitle>
          </Alert>
        )}
        {status === 'error' && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>{t('error')}</AlertTitle>
          </Alert>
        )}
      </CardContent>
      {status !== 'loading' && (
        <CardFooter>
          <Button asChild variant={status === 'success' ? 'default' : 'outline'} className="w-full">
            <Link href="/login">{t('goToLogin')}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
