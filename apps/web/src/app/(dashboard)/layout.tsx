import { AppSidebar } from '@/components/app-sidebar';
import { TwoFactorGate } from '@/components/two-factor-gate';
import { TenantGate } from '@/components/tenant/tenant-gate';
import { TrialBanner } from '@/components/tenant/trial-banner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // TenantGate wraps the whole shell: when the company is suspended, cancelled
    // or past its trial, every route answers 403 and there is nothing behind it
    // worth painting — so the blocked card replaces the shell rather than
    // sitting inside it.
    <TenantGate>
      <div className="flex min-h-screen flex-col bg-background md:flex-row">
        <TwoFactorGate />
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TrialBanner />

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
    </TenantGate>
  );
}
