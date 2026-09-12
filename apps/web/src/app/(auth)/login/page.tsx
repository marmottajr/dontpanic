'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  TWO_FACTOR_TICKET_COOKIE,
  loginSchema,
  oauthErrorCodeSchema,
  type LoginInput,
  type LoginResponse,
} from '@dontpanic/shared';
import { useLogin } from '@/hooks/use-auth';
import { api, ApiError } from '@/lib/api';
import { safeInternalPath } from '@/lib/safe-path';
import { Captcha, type CaptchaHandle } from '@/components/captcha';
import { captchaEnabled } from '@/lib/captcha';
import { clearCookie, readCookie } from '@/lib/cookies';
import { signupEnabled } from '@/lib/auth-config';
import { OAuthButtons } from '@/components/oauth-buttons';
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
  const tCaptcha = useTranslations('auth.captcha');
  const tOauth = useTranslations('auth.oauth.errors');
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();

  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // 2FA challenge state — the card swaps to a code step when the API asks for it.
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  /**
   * A social callback that could not sign the user in bounces back here as
   * `?error=<code>`. Read it once, translate it, and take it out of the
   * address bar: leaving it there means the message reappears on every later
   * reload — including after a successful sign-in attempt — and it also travels
   * on into the `from=` round-trip and into anything the user pastes.
   *
   * An unknown value degrades to the deliberately coarse `failed`, never to the
   * raw string: the code drives a translation, so whatever an attacker puts in
   * the query string must not reach the screen.
   */
  const oauthErrorHandled = useRef(false);
  useEffect(() => {
    if (oauthErrorHandled.current) return;
    const raw = searchParams.get('error');
    if (!raw) return;
    oauthErrorHandled.current = true;

    const parsed = oauthErrorCodeSchema.safeParse(raw);
    setAuthError(tOauth(parsed.success ? parsed.data : 'failed'));

    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [searchParams, tOauth]);

  /**
   * A social sign-in that owed a second factor comes back as `?twofactor=1`
   * with the ticket in a short-lived cookie, and this picks it up so the card
   * swaps straight to the code step.
   *
   * The ticket travels in a cookie rather than the query string to keep it out
   * of browser history and the Referer header — but it still has to reach the
   * body of `/auth/2fa/verify`, so it is read here and then deleted, because a
   * ticket left in the jar would be replayed onto the next visit to this page
   * long after the flow it belonged to was abandoned.
   */
  const twoFactorHandoffHandled = useRef(false);
  useEffect(() => {
    if (twoFactorHandoffHandled.current) return;
    if (searchParams.get('twofactor') !== '1') return;
    twoFactorHandoffHandled.current = true;

    const pending = readCookie(TWO_FACTOR_TICKET_COOKIE);
    clearCookie(TWO_FACTOR_TICKET_COOKIE);

    const url = new URL(window.location.href);
    url.searchParams.delete('twofactor');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

    // No cookie means it expired, or the browser dropped it. Say the ordinary
    // "that did not work" rather than inventing a state the user cannot act on.
    if (!pending) {
      setAuthError(tOauth('failed'));
      return;
    }
    setTicket(pending);
  }, [searchParams, tOauth]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const goNext = () => {
    // `from` comes from the address bar, so it's whatever anyone puts there.
    // It's resolved against the current origin instead of matched by pattern:
    // the browser reads both `//evil.com` and `/\evil.com` as absolute URLs,
    // and plugging one case at a time always leaves the next one out.
    const target = safeInternalPath(searchParams.get('from'), window.location.origin) ?? '/';
    router.push(target);
    router.refresh();
  };

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    const captchaToken = await captchaRef.current?.getToken();
    if (captchaEnabled && !captchaToken) {
      setAuthError(tCaptcha('required'));
      return;
    }
    try {
      const res = await login.mutateAsync({ ...values, captchaToken: captchaToken ?? undefined });
      if ('twoFactorRequired' in res && res.twoFactorRequired) {
        setTicket(res.ticket);
        return;
      }
      goNext();
    } catch (err) {
      // Tokens are single-use: a rejected submit needs a fresh challenge.
      captchaRef.current?.reset();
      if (err instanceof ApiError && err.status === 400 && err.body?.error === 'CaptchaRequired') {
        setAuthError(tCaptcha('failed'));
      } else if (err instanceof ApiError && err.status === 503) {
        setAuthError(tCaptcha('unavailable'));
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
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
      <Card key="login-2fa" className="animate-in fade-in zoom-in-95 duration-300">
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
    <Card key="login-credentials" className="animate-in fade-in zoom-in-95 duration-300">
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
          <Captcha ref={captchaRef} action="login" />
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>

          {/* Renders itself away — separator included — when no provider is
              configured, which is the default deployment. */}
          <OAuthButtons intent="login" className="w-full" />

          {/* With registration closed there is nothing behind this link but a
              "closed" screen, so it is not offered at all. */}
          {signupEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              {t('noAccount')}{' '}
              <Link
                href="/signup"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('signup')}
              </Link>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
