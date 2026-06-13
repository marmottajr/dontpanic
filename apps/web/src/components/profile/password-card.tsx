'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { changePasswordSchema, type ChangePasswordInput } from '@dontpanic/shared';
import { useChangePassword, useLogout } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordCard() {
  const t = useTranslations('profile.passwordSection');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const changePassword = useChangePassword();
  const logout = useLogout();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    try {
      await changePassword.mutateAsync(values);
      toast.success(t('updated'));
      // Backend revokes all sessions on password change -> force re-auth.
      logout.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    }
  }

  const pending = changePassword.isPending || logout.isPending;

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('updated')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-sm">
          <div className="grid gap-2">
            <Label htmlFor="current-password">{t('current')}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t('new')}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.newPassword)}
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {pending ? tc('saving') : t('save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
