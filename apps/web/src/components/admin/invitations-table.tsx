'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Ban } from 'lucide-react';
import type { InvitationDto, InvitationStatus, Paginated } from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/components/platform/format';

const PAGE_SIZE = 10;

/**
 * Which badge an invitation wears. `EXPIRED` is computed by the API from
 * `expiresAt`, so the screen never has to compare dates itself — and never
 * offers "resend" on a row the API would refuse.
 */
const STATUS_VARIANT: Record<
  InvitationStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  PENDING: 'default',
  ACCEPTED: 'secondary',
  REVOKED: 'destructive',
  EXPIRED: 'outline',
};

/**
 * The company's outstanding invitations.
 *
 * Resend and revoke exist **only** on PENDING rows: an accepted invitation has
 * already become a user (revoking it would suggest it un-makes them, which it
 * does not), and a revoked or expired one is a dead token that no amount of
 * re-mailing brings back. Rather than showing buttons that answer 4xx, the
 * actions are simply not there.
 */
export function InvitationsTable() {
  const t = useTranslations('admin.invitations');
  const tStatus = useTranslations('admin.invitations.status');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const locale = useLocale();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<InvitationDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invitations', page],
    queryFn: () =>
      api<Paginated<InvitationDto>>(`/admin/invitations?page=${page}&limit=${PAGE_SIZE}`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-invitations'] });
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));

  const resend = useMutation({
    mutationFn: (id: string) => api(`/admin/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('resent'));
      void refresh();
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/admin/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('revoked'));
      setRevoking(null);
      void refresh();
    },
    onError: (err) => {
      setRevoking(null);
      fail(err);
    },
  });

  const rows = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colInvitee')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colRole')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colStatus')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colExpires')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colInvitedBy')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('colActions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {tc('loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{row.email}</div>
                    {row.name ? (
                      <div className="text-xs text-muted-foreground">{row.name}</div>
                    ) : null}
                    {row.profileName ? (
                      <div className="text-xs text-muted-foreground">{row.profileName}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {row.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status]}>{tStatus(row.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(row.expiresAt, locale) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.invitedByName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {/* Only a live invitation can be re-sent or called back. */}
                      {row.status === 'PENDING' ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resend.isPending}
                            aria-label={t('resend', { email: row.email })}
                            onClick={() => resend.mutate(row.id)}
                          >
                            <Send className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t('revoke', { email: row.email })}
                            onClick={() => setRevoking(row)}
                          >
                            <Ban className="size-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('pageInfo', { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t('prev')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Never window.confirm(): the ESLint rule `no-alert` forbids it and a
          browser dialog cannot say what revoking actually does. */}
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('revokeTitle')}
        description={t('revokeConfirm', { email: revoking?.email ?? '' })}
        confirmLabel={t('revokeAction')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </section>
  );
}
