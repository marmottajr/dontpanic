'use client';

import { Boxes, Languages, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { EasterEggs } from '@/components/easter-eggs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

type CardKey = 'secure' | 'i18n' | 'swappable';

const cards: { key: CardKey; icon: LucideIcon }[] = [
  { key: 'secure', icon: ShieldCheck },
  { key: 'i18n', icon: Languages },
  { key: 'swappable', icon: Boxes },
];

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { data: user } = useUser();

  return (
    <div className="space-y-10">
      <EasterEggs />

      {/* Hero */}
      <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {user?.name && (
          <p className="font-mono text-sm text-muted-foreground">
            {t('greeting', { name: user.name })}
          </p>
        )}

        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          {t('helloWorld')}
          <span className="caret-blink ml-1 text-primary" aria-hidden="true">
            ▍
          </span>
        </h1>

        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('subtitle')}
        </p>

        <p className="font-mono text-sm font-medium text-accent-foreground dark:text-accent">
          {t('answer')}
        </p>
      </section>

      {/* Feature cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ key, icon: Icon }, i) => (
          <Card
            key={key}
            className={cn(
              'animate-in fade-in slide-in-from-bottom-3 duration-500',
              'transition-shadow hover:shadow-md',
            )}
            style={{ animationDelay: `${120 + i * 90}ms`, animationFillMode: 'both' }}
          >
            <CardHeader className="gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <CardTitle>{t(`cards.${key}.title`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`cards.${key}.body`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
