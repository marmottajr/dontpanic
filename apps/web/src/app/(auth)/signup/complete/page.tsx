'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  completeOAuthSignupSchema,
  type CompleteOAuthSignupInput,
  type CompleteOAuthSignupResponse,
} from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { slugify } from '@/lib/masks';
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

/**
 * Finishing a registration that started at a social provider.
 *
 * The callback got here because the verified identity belongs to nobody yet,
 * and creating a company needs a name and an address no identity provider can
 * supply. The single-use ticket in the query string stands in for the session
 * that does not exist yet.
 *
 * Two fields are missing on purpose:
 *
 *  - **No e-mail.** It came from the provider's *verified* claim and lives in
 *    the ticket. A field here would turn a proven address into a self-declared
 *    one — anyone with a throwaway social account could claim any address, and
 *    with it any invitation or account-recovery path keyed to that address.
 *  - **No password.** This account signs in through the provider. Inventing a
 *    credential at this point would create a second way in that the person
 *    never chose and would never be told about.
 */
export default function CompleteOAuthSignupPage() {
  const t = useTranslations('auth.completeSignup');
  const ts = useTranslations('auth.signup');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const tErr = useTranslations('errors');

  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const ticket = searchParams.get('ticket') ?? '';

  // Same rule as /signup: deriving the address from the company name stops the
  // moment the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CompleteOAuthSignupInput>({
    resolver: zodResolver(completeOAuthSignupSchema),
    defaultValues: { ticket, companyName: '', slug: '', name: '' },
  });

  /**
   * No ticket, no screen. There is nothing this form could submit — and an
   * empty `ticket` would be rejected by the contract anyway — so the browser
   * goes back to a page that can actually do something.
   */
  useEffect(() => {
    if (!ticket) router.replace('/login');
  }, [ticket, router]);

  const complete = useMutation({
    mutationFn: (values: CompleteOAuthSignupInput) =>
      api<CompleteOAuthSignupResponse>('/auth/oauth/complete-signup', {
        method: 'POST',
        body: values,
      }),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await complete.mutateAsync({ ...values, ticket });
      // The endpoint sets the session cookies, so we are already signed in.
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(/email/i.test(err.message) ? ts('emailTaken') : ts('slugTaken'));
        return;
      }
      // A ticket is single-use and short-lived: the honest advice for an
      // expired one is to start over, not to retry a dead token.
      if (err instanceof ApiError && (err.status === 400 || err.status === 410)) {
        toast.error(t('ticketExpired'));
        return;
      }
      toast.error(tErr('generic'));
    }
  });

  if (!ticket) return null;

  const companyNameField = register('companyName');

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="gap-3">
        <Brand size="md" className="mb-1" />
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('identityNotice')}
          </p>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ts('companyLegend')}
          </p>
          <div className="space-y-2">
            <Label htmlFor="companyName">{ts('companyName')}</Label>
            <Input
              id="companyName"
              autoComplete="organization"
              placeholder={ts('companyNamePlaceholder')}
              aria-invalid={!!errors.companyName}
              {...companyNameField}
              onChange={(e) => {
                void companyNameField.onChange(e);
                if (!slugTouched) {
                  setValue('slug', slugify(e.target.value), { shouldValidate: false });
                }
              }}
            />
            {errors.companyName && <p className="text-xs text-destructive">{tv('required')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">{ts('slug')}</Label>
            <Input
              id="slug"
              autoComplete="off"
              spellCheck={false}
              placeholder="sirius-cybernetics"
              aria-invalid={!!errors.slug}
              aria-describedby="slug-hint"
              {...register('slug', { onChange: () => setSlugTouched(true) })}
            />
            <p
              id="slug-hint"
              className={errors.slug ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
            >
              {ts('slugHint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxId">
              {t('taxId')} <span className="text-muted-foreground">({tc('optional')})</span>
            </Label>
            <Input id="taxId" autoComplete="off" {...register('taxId')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyPhone">
              {t('companyPhone')} <span className="text-muted-foreground">({tc('optional')})</span>
            </Label>
            <Input id="companyPhone" type="tel" autoComplete="tel" {...register('companyPhone')} />
          </div>

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('personLegend')}
          </p>
          <div className="space-y-2">
            <Label htmlFor="name">{tc('name')}</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Arthur Dent"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{tv('required')}</p>}
          </div>

          {/* z.literal(true): an unchecked box has to fail validation instead of
              recording a refusal as an acceptance. */}
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
          <Button type="submit" className="w-full" disabled={isSubmitting || complete.isPending}>
            {(isSubmitting || complete.isPending) && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
