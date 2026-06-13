'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import type { AvatarResponse, UserDto } from '@dontpanic/shared';
import { apiUpload, api, ApiError } from '@/lib/api';
import { useUser } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Up to 2 uppercase initials from a name (falling back to the email, then "42"). */
function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)) ?? '';
  return letters.toUpperCase() || '42';
}

export function AvatarCard({ user }: { user: UserDto }) {
  const t = useTranslations('profile.avatar');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const qc = useQueryClient();
  const { refetch } = useUser();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const busy = uploading || removing;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires `change`.
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('hint'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('hint'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const res = await apiUpload<AvatarResponse>('/users/me/avatar', formData);
      qc.setQueryData<UserDto>(['me'], (prev) =>
        prev ? { ...prev, avatarUrl: res.avatarUrl } : prev,
      );
      await refetch();
      toast.success(t('title'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    setRemoving(true);
    try {
      await api('/users/me/avatar', { method: 'DELETE' });
      qc.setQueryData<UserDto>(['me'], (prev) =>
        prev ? { ...prev, avatarUrl: null } : prev,
      );
      await refetch();
      toast.success(t('remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Avatar className="size-20 border border-border shadow-sm">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
          <AvatarFallback className="bg-primary/10 text-lg font-medium text-primary">
            {initials(user.name, user.email)}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col gap-2 sm:flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            onChange={onFileChange}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImageUp className="size-4" aria-hidden="true" />
              )}
              {uploading ? tc('loading') : t('upload')}
            </Button>

            {user.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onRemove}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                {t('remove')}
              </Button>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{t('hint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
