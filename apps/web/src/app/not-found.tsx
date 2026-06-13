import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('errors.notFound');

  return (
    <main className="bg-guide flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <Link
          href="/"
          className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="DontPanic"
        >
          <Brand size="md" />
        </Link>

        <p className="font-display text-7xl font-bold leading-none tracking-tight text-primary sm:text-8xl">
          404
        </p>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('body')}</p>
        </div>

        <p className="font-mono text-xs text-muted-foreground">
          Marvin: “I’d look for it, but I’ve got this terrible pain in all the diodes down my left side.”
        </p>

        <Button asChild size="lg">
          <Link href="/">{t('home')}</Link>
        </Button>
      </div>
    </main>
  );
}
