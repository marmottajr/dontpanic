'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { useTranslations } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { applyZodI18n } from '@/lib/zod-error-map';

export function Providers({ children }: { children: ReactNode }) {
  const tv = useTranslations('validation');
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  // Localise Zod validation messages to the active language (client only — a
  // global error map on the server would leak one request's locale to others).
  useEffect(() => {
    applyZodI18n((key, values) => tv(key as never, values as never));
  }, [tv]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
