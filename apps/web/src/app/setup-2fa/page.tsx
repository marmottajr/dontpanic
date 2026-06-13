'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Brand } from '@/components/brand';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TwoFactorSetup } from '@/components/two-factor-setup';

/**
 * Forced 2FA enrolment (TWO_FACTOR_REQUIRED). Standalone authed page — no
 * sidebar — that the dashboard gate redirects to until 2FA is enabled.
 */
export default function SetupTwoFactorPage() {
  const t = useTranslations('twoFactorPrompt');
  const router = useRouter();
  const qc = useQueryClient();

  function done() {
    void qc.invalidateQueries({ queryKey: ['security'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
    router.replace('/');
  }

  return (
    <main className="bg-guide flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="items-center gap-2 text-center">
          <Brand size="md" className="mb-1" />
          <CardTitle className="font-display text-2xl">{t('requiredTitle')}</CardTitle>
          <CardDescription>{t('requiredBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSetup onDone={done} />
        </CardContent>
      </Card>
    </main>
  );
}
