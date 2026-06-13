'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { updateProfileSchema, type UpdateProfileInput, type UserDto } from '@dontpanic/shared';
import { useUpdateProfile } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NameCard({ user }: { user: UserDto }) {
  const t = useTranslations('profile.nameSection');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const update = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user.name },
  });

  async function onSubmit(values: UpdateProfileInput) {
    try {
      const updated = await update.mutateAsync({ name: values.name?.trim() });
      reset({ name: updated.name });
      toast.success(t('updated'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:max-w-sm">
            <Label htmlFor="profile-name">{tc('name')}</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={update.isPending || !isDirty}>
            {update.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {update.isPending ? tc('saving') : t('save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
