'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Lock, LockOpen, Trash2 } from 'lucide-react';
import type { AdminUser, AdminUserList } from '@dontpanic/shared';
import { useUser } from '@/hooks/use-auth';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function AdminPage() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useUser();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  // Client-side gate; the API also enforces ADMIN (403) on every endpoint.
  useEffect(() => {
    if (!meLoading && me && me.role !== 'ADMIN') router.replace('/');
  }, [meLoading, me, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () =>
      api<AdminUserList>(
        `/admin/users?page=${page}&limit=10${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: me?.role === 'ADMIN',
  });

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : tErr('generic'));
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const setRole = useMutation({
    mutationFn: (u: AdminUser) =>
      api(`/admin/users/${u.id}/role`, {
        method: 'PATCH',
        body: { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' },
      }),
    onSuccess: () => {
      toast.success(t('roleChanged'));
      void refresh();
    },
    onError: fail,
  });

  const toggleLock = useMutation({
    mutationFn: (u: AdminUser) =>
      api(`/admin/users/${u.id}/${u.locked ? 'unlock' : 'lock'}`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: fail,
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('deleted'));
      setDeleting(null);
      void refresh();
    },
    onError: (err) => {
      setDeleting(null);
      fail(err);
    },
  });

  const users = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-500">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="font-mono text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
        className="flex gap-2"
      >
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          {t('search')}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('colUser')}</th>
              <th className="px-4 py-3 font-medium">{t('colRole')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {tc('loading')}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>{u.role}</Badge>
                  </td>
                  <td className="space-x-1 px-4 py-3">
                    {u.deleted && <Badge variant="destructive">{t('deletedTag')}</Badge>}
                    {u.locked && <Badge variant="outline">{t('lockedTag')}</Badge>}
                    {u.twoFactorEnabled && <Badge variant="outline">2FA</Badge>}
                    {!u.emailVerified && <Badge variant="outline">{t('unverifiedTag')}</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={u.id === me?.id || setRole.isPending}
                        onClick={() => setRole.mutate(u)}
                      >
                        {u.role === 'ADMIN' ? t('makeUser') : t('makeAdmin')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggleLock.isPending}
                        onClick={() => toggleLock.mutate(u)}
                        aria-label={u.locked ? t('unlock') : t('lock')}
                      >
                        {u.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={u.id === me?.id || u.deleted}
                        onClick={() => setDeleting(u)}
                        aria-label={t('delete')}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('pageInfo', { page: data.page, total: data.totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('prev')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle')}
        description={t('deleteConfirm', { email: deleting?.email ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
