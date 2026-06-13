'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { SecurityStatus } from '@dontpanic/shared';
import { api } from '@/lib/api';
import { TwoFactorPromptDialog } from '@/components/two-factor-prompt-dialog';

/**
 * Mounted in the dashboard shell. Reads the 2FA onboarding status and either:
 *  - forces the /setup-2fa page when 2FA is REQUIRED and not yet enabled, or
 *  - shows a snoozable prompt dialog (optional mode, first login / 24h later).
 */
export function TwoFactorGate() {
  const router = useRouter();
  const [promptOpen, setPromptOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['security'],
    queryFn: () => api<SecurityStatus>('/users/me/security'),
    staleTime: 0,
  });

  // Drive once off the fetched status — NOT off pathname, or it would re-open
  // the prompt on every navigation. Snoozing invalidates ['security'], so the
  // refetch returns shouldPrompt:false and this won't fire again.
  useEffect(() => {
    if (!data) return;
    if (data.twoFactorRequired && !data.twoFactorEnabled) {
      router.replace('/setup-2fa');
    } else if (data.shouldPrompt) {
      setPromptOpen(true);
    }
  }, [data, router]);

  if (!data?.shouldPrompt) return null;
  return <TwoFactorPromptDialog open={promptOpen} onOpenChange={setPromptOpen} />;
}
