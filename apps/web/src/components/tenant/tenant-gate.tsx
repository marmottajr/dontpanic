'use client';

import { useTranslations } from 'next-intl';
import { Lock, LogOut } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogout, useUser } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';

/**
 * The blocked screen: company suspended, cancelled, or past its trial.
 *
 * `detail` is the sentence the API returned with the 403, and it is what tells
 * the cases apart — a blocked user cannot read their company's state, because
 * every route answers 403. The surrounding copy is translated; the API's
 * sentence comes in as the detail, without replacing the explanation.
 */
export function TenantBlocked({ detail }: { detail?: string | null }) {
  const t = useTranslations('tenant.blocked');
  const tn = useTranslations('nav');
  const logout = useLogout();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="gap-3">
          <Brand size="md" />
          <span className="flex size-11 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="font-display text-2xl">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
          {detail ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {detail}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">{t('contact')}</p>
          <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="size-4" aria-hidden="true" />
            {tn('logout')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Locks the whole shell when the API refuses the session over the company's
 * state. A 403 on the user's own record can only come from `TenantStatusGuard`.
 */
export function TenantGate({ children }: { children: React.ReactNode }) {
  const { error } = useUser();

  if (error instanceof ApiError && error.status === 403) {
    const message = error.body?.message;
    return <TenantBlocked detail={Array.isArray(message) ? message[0] : message} />;
  }

  return <>{children}</>;
}
