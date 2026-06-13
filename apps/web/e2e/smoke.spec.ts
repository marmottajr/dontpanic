import { test, expect } from '@playwright/test';

test('login page renders the credentials form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar|sign in/i })).toBeVisible();
});

test('register page renders', async ({ page }) => {
  await page.goto('/register');
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
});

test('an unauthenticated protected route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
