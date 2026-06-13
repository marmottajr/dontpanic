'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { CheckCircle2, Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { resetPasswordSchema, passwordSchema } from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
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

export default function ResetPasswordPage() {
  const t = useTranslations('auth.reset');
  const ta = useTranslations('auth.login');
  const tErr = useTranslations('errors');
  const tv = useTranslations('validation');

  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Local form schema: enforce the shared password policy AND the confirm match.
  const formSchema = z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: t('mismatch'),
      path: ['confirmPassword'],
    });
  type FormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const payload = resetPasswordSchema.parse({ token, password: values.password });
      await api('/auth/reset-password', { method: 'POST', body: payload });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 410)) {
        toast.error(t('invalidToken'));
      } else if (err instanceof z.ZodError) {
        toast.error(t('invalidToken'));
      } else {
        toast.error(tErr('generic'));
      }
    } finally {
      setSubmitting(false);
    }
  });

  // Missing/obviously-invalid token: don't even render the form.
  if (!token || token.length < 10) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <Brand size="md" className="mb-1" />
          <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>{t('invalidToken')}</AlertTitle>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">{ta('forgot')}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2 className="size-5" />
          </span>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertTitle>{t('success')}</AlertTitle>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/login">{ta('submit')}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="gap-3">
        <Brand size="md" className="mb-1" />
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t('newPassword')}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                aria-invalid={!!errors.password}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-r-md"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p
              className={
                errors.password ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
              }
            >
              {tv('passwordWeak')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{t('mismatch')}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting || submitting}>
            {(isSubmitting || submitting) && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
