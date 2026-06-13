import { AppSidebar } from '@/components/app-sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-8 sm:px-6 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>

        <footer className="border-t border-border">
          <div className="px-6 py-5 text-center font-mono text-xs text-muted-foreground">
            DontPanic · the answer is 42
          </div>
        </footer>
      </div>
    </div>
  );
}
