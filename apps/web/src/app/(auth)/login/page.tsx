'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { loginSchema, type LoginInput, type LoginResponse } from '@dontpanic/shared';
import { useLogin } from '@/hooks/use-auth';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

type LoginUserResponse = Extract<LoginResponse, { user: unknown }>;

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 2FA challenge state — the card swaps to a code step when the API asks for it.
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const goNext = () => {
    const from = searchParams.get('from');
    router.push(from && from.startsWith('/') ? from : '/');
    router.refresh();
  };

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    try {
      const res = await login.mutateAsync(values);
      if ('twoFactorRequired' in res && res.twoFactorRequired) {
        setTicket(res.ticket);
        return;
      }
      goNext();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setAuthError(t('invalid'));
      } else if (err instanceof ApiError && err.status === 423) {
        setAuthError(t('locked'));
      } else {
        toast.error(tErr('generic'));
      }
    }
  });

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    setAuthError(null);
    setVerifying(true);
    try {
      await api<LoginUserResponse>('/auth/2fa/verify', {
        method: 'POST',
        body: { ticket, code },
      });
      goNext();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setAuthError(t('invalid'));
      } else {
        toast.error(tErr('generic'));
      }
    } finally {
      setVerifying(false);
    }
  };

  if (ticket) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <CardTitle>{t('twoFactorTitle')}</CardTitle>
          <CardDescription>{t('twoFactorSubtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={onVerify}>
          <CardContent className="space-y-4">
            {authError && (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="code">{t('code')}</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={16}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                className="text-center font-mono text-lg tracking-[0.5em]"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={verifying || code.length < 6}>
              {verifying && <Loader2 className="size-4 animate-spin" />}
              {t('verify')}
            </Button>
          </CardFooter>
        </form>
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
          {authError && (
            <Alert variant="destructive">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{tc('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ford@betelgeuse.net"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{tc('password')}</Label>
              <Link
                href="/forgot-password"
                className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t('forgot')}
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('noAccount')}{' '}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('signup')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
