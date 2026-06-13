'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@dontpanic/shared';
import { api } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertTitle } from '@/components/ui/alert';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const ta = useTranslations('auth.login');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');

  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const forgot = useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api('/auth/forgot-password', { method: 'POST', body: input }),
  });

  const onSubmit = handleSubmit(async (values) => {
    // The endpoint always returns 200 to avoid leaking which emails exist; even
    // on an unexpected error we show the neutral "sent" state.
    try {
      await forgot.mutateAsync(values);
    } catch {
      /* swallow — never reveal account existence */
    } finally {
      setSent(true);
    }
  });

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="gap-3">
        <Brand size="md" className="mb-1" />
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>

      {sent ? (
        <>
          <CardContent>
            <Alert variant="success">
              <MailCheck className="size-4" />
              <AlertTitle>{t('sent')}</AlertTitle>
            </Alert>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">
                <ArrowLeft className="size-4" />
                {ta('submit')}
              </Link>
            </Button>
          </CardFooter>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tc('email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="arthur@earth.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{tv('email')}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {t('submit')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('remembered')}{' '}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {ta('submit')}
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
