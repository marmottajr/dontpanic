'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
  type InvitationPreview,
  type UserDto,
} from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
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

/** The form: the contract's fields minus the token, plus a confirmation box. */
const buildFormSchema = (mismatchMessage: string) =>
  acceptInvitationSchema
    .omit({ token: true })
    .extend({ confirmPassword: z.string() })
    .refine((values) => values.password === values.confirmPassword, {
      message: mismatchMessage,
      path: ['confirmPassword'],
    });

type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

/**
 * Accepting an invitation — the only way into a company that already exists.
 *
 * The token travels in a URL through mail clients and proxies, so the preview
 * behind it says the least that still lets someone decide: which address the
 * account will carry, and which company they are joining. Nothing else.
 *
 * Invalid, expired and revoked all render **one** message. The API does not
 * distinguish them on purpose — telling the difference would turn this page
 * into an oracle for probing which tokens ever existed — and the screen must
 * not invent a distinction the API refused to make.
 */
export default function AcceptInvitationPage() {
  const t = useTranslations('invite');
  const tc = useTranslations('common');
  const ta = useTranslations('auth.login');
  const ts = useTranslations('auth.signup');
  const tr = useTranslations('auth.reset');
  const tv = useTranslations('validation');
  const tErr = useTranslations('errors');

  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ token: string | string[] }>();
  const raw = params?.token;
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');

  const [showPassword, setShowPassword] = useState(false);

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    // A dead token stays dead: retrying only delays the honest message.
    retry: false,
  });

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(buildFormSchema(tr('mismatch'))),
    defaultValues: { name: '', password: '', confirmPassword: '' },
  });

  // The invited name is a courtesy from whoever sent the invite, so it lands as
  // a default the person can overwrite — never as a fixed value.
  useEffect(() => {
    if (preview.data?.name)
      resetForm({ name: preview.data.name, password: '', confirmPassword: '' });
  }, [preview.data?.name, resetForm]);

  const accept = useMutation({
    mutationFn: (input: AcceptInvitationInput) =>
      api<{ user: UserDto }>('/auth/invitations/accept', { method: 'POST', body: input }),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await accept.mutateAsync({
        token,
        name: values.name,
        password: values.password,
        acceptTerms: values.acceptTerms,
      });
      // The endpoint sets the session cookies — we are already signed in.
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push('/');
      router.refresh();
    } catch (err) {
      // Same coarse verdict as the preview: one message for every way a token
      // can be no good.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        toast.error(t('invalid'));
        return;
      }
      toast.error(tErr('generic'));
    }
  });

  if (preview.isLoading) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {tc('loading')}
        </CardContent>
      </Card>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Card className="animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <CardTitle className="font-display text-2xl">{t('invalidTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>{t('invalid')}</AlertTitle>
          </Alert>
          <p className="text-sm text-muted-foreground">{t('invalidHint')}</p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{ta('submit')}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="gap-3">
        <CardTitle className="font-display text-2xl">
          {t('title', { company: preview.data.tenantName })}
        </CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {/* Company and address are shown, not edited: both come from the
              invitation. An editable e-mail here would let whoever received the
              link create an account for an address nobody invited. */}
          <dl className="grid gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('company')}
              </dt>
              <dd className="font-medium">{preview.data.tenantName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {tc('email')}
              </dt>
              <dd className="font-mono text-xs">{preview.data.email}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <Label htmlFor="name">{tc('name')}</Label>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{tv('required')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{tc('password')}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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
            <Label htmlFor="confirmPassword">{tr('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && <p className="text-xs text-destructive">{tr('mismatch')}</p>}
          </div>

          {/* z.literal(true), like signup: an unchecked box fails validation
              instead of recording a refusal as an acceptance. The invitee
              accepts for themselves — their company having accepted earlier was
              the company's act, not theirs. */}
          <div className="flex items-start gap-2 pt-1">
            <input
              id="acceptTerms"
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded-sm border border-input accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-invalid={!!errors.acceptTerms}
              {...register('acceptTerms')}
            />
            <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug">
              {ts('acceptTerms')}
            </Label>
          </div>
          {errors.acceptTerms && (
            <p className="text-xs text-destructive">{ts('acceptTermsRequired')}</p>
          )}
          <p className="text-xs text-muted-foreground">
            <Link href="/termos" className="underline underline-offset-4">
              {t('termsLink')}
            </Link>
            {' · '}
            <Link href="/privacidade" className="underline underline-offset-4">
              {t('privacyLink')}
            </Link>
          </p>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting || accept.isPending}>
            {(isSubmitting || accept.isPending) && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
