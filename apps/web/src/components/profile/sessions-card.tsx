'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LogOut, Monitor } from 'lucide-react';
import type { SessionDto } from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Lists the user's active sessions (one per rotation family) and revokes them. */
export function SessionsCard() {
  const t = useTranslations('profile.sessions');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const qc = useQueryClient();
  const [confirmOthers, setConfirmOthers] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<SessionDto[]>('/users/me/sessions'),
  });

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/users/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('revoked'));
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: fail,
  });

  const revokeOthers = useMutation({
    mutationFn: () => api('/users/me/sessions/revoke-others', { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('revokedOthers'));
      setConfirmOthers(false);
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err) => {
      setConfirmOthers(false);
      fail(err);
    },
  });

  const list = sessions ?? [];
  const hasOthers = list.some((s) => !s.current);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{tc('loading')}</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Monitor className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.userAgent ?? t('unknownDevice')}
                      {s.current && (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          {t('current')}
                        </Badge>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {s.ip ?? '—'} · {new Date(s.lastUsedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    {t('revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasOthers && (
          <Button variant="outline" onClick={() => setConfirmOthers(true)}>
            <LogOut className="size-4" aria-hidden="true" />
            {t('revokeOthers')}
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t('revokeOthers')}
        description={t('revokeOthersConfirm')}
        confirmLabel={t('revokeOthers')}
        cancelLabel={tc('cancel')}
        loading={revokeOthers.isPending}
        onConfirm={() => revokeOthers.mutate()}
      />
    </Card>
  );
}
