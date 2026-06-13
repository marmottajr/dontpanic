import Link from 'next/link';
import { Brand } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-guide flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/login"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="DontPanic"
        >
          <Brand size="md" />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children}
        </div>
      </main>

      <footer className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
        DontPanic · the answer is 42
      </footer>
    </div>
  );
}
