'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, Loader2, Trash2 } from 'lucide-react';
import type { UserDataExport } from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { useLogout } from '@/hooks/use-auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DangerCard() {
  const t = useTranslations('profile.danger');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const logout = useLogout();

  const [exporting, setExporting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const data = await api<UserDataExport>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dontpanic-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('exportTitle'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await api('/users/me', { method: 'DELETE' });
      toast.success(t('deleteTitle'));
      setDeleteOpen(false);
      // Account gone -> clear session and bounce to /login.
      logout.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('exportTitle')}</p>
              <CardDescription>{t('exportBody')}</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={onExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {t('export')}
            </Button>
          </div>

          <Separator />

          {/* Delete */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">{t('deleteTitle')}</p>
              <CardDescription>{t('deleteBody')}</CardDescription>
            </div>
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {t('delete')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('deleteTitle')}</DialogTitle>
            <DialogDescription>{t('deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {tc('cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
