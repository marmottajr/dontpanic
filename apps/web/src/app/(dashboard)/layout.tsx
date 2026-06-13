import { AppHeader } from '@/components/app-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-5 text-center font-mono text-xs text-muted-foreground sm:px-6">
          DontPanic · the answer is 42
        </div>
      </footer>
    </div>
  );
}
