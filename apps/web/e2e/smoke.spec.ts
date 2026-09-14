import { test, expect } from '@playwright/test';

test('login page renders the credentials form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar|sign in/i })).toBeVisible();
});

test('signup page renders the company registration form', async ({ page }) => {
  await page.goto('/signup');
  await expect(page).toHaveURL(/\/signup/);
  // Anchored on the whole label. `/empresa/` also matched "Endereço da empresa" (the slug
  // field), and Playwright's strict mode refuses a locator that resolves to two elements.
  await expect(
    page.getByRole('textbox', { name: /^(nome da empresa|company name)$/i }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
});

test('an unauthenticated protected route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
