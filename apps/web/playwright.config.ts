import { defineConfig, devices } from '@playwright/test';

// Smoke-level e2e for the public surface. Boots `next dev` and hits pages that
// render without the API (login/register + the unauth redirect).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4200/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
