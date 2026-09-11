'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { signupSchema, type SignupInput } from '@dontpanic/shared';
import { useSignup } from '@/hooks/use-auth';
import { slugify } from '@/lib/masks';
import { ApiError } from '@/lib/api';
import { Captcha, type CaptchaHandle } from '@/components/captcha';
import { captchaEnabled } from '@/lib/captcha';
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
 * Public self-serve signup — in a multi-tenant product this IS the company
 * registration: it creates the company, its profiles and the person filling the
 * form as its administrator. There is no way to create a user without a company
 * from the outside; everyone else arrives by invitation.
 */
export default function SignupPage() {
  const t = useTranslations('auth.signup');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const tCaptcha = useTranslations('auth.captcha');
  const tv = useTranslations('validation');
  const signupMutation = useSignup();

  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  // Once the user edits the address by hand we stop overwriting it — deriving
  // it from the company name is a convenience, not a rule they cannot escape.
  const [slugTouched, setSlugTouched] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { companyName: '', slug: '', name: '', email: '', password: '' },
  });

  const companyNameField = register('companyName');

  const onSubmit = handleSubmit(async (values) => {
    const captchaToken = await captchaRef.current?.getToken();
    if (captchaEnabled && !captchaToken) {
      toast.error(tCaptcha('required'));
      return;
    }
    try {
      await signupMutation.mutateAsync({ ...values, captchaToken: captchaToken ?? undefined });
      // Company created — go enter the verification code we just emailed.
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (err) {
      captchaRef.current?.reset();
      // 409 is the one failure the user can actually do something about, so it
      // says which half collided instead of the catch-all message.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(/email/i.test(err.message) ? t('emailTaken') : t('slugTaken'));
        return;
      }
      toast.error(tErr('generic'));
    }
  });

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="gap-3">
        <Brand size="md" className="mb-1" />
        <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('companyLegend')}
          </p>
          <div className="space-y-2">
            <Label htmlFor="companyName">{t('companyName')}</Label>
            <Input
              id="companyName"
              autoComplete="organization"
              placeholder={t('companyNamePlaceholder')}
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
            <Label htmlFor="slug">{t('slug')}</Label>
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
              {t('slugHint')}
            </p>
          </div>

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('adminLegend')}
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
          <div className="space-y-2">
            <Label htmlFor="email">{tc('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="arthur@earth.com"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{tv('email')}</p>}
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

          {/* `acceptTerms` is z.literal(true): an unchecked box fails validation
              rather than recording a refusal as an acceptance. */}
          <div className="flex items-start gap-2 pt-1">
            <input
              id="acceptTerms"
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded-sm border border-input accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-invalid={!!errors.acceptTerms}
              {...register('acceptTerms')}
            />
            <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug">
              {t('acceptTerms')}
            </Label>
          </div>
          {errors.acceptTerms && (
            <p className="text-xs text-destructive">{t('acceptTermsRequired')}</p>
          )}

          <Captcha ref={captchaRef} action="signup" />
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {t('submit')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('signin')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
