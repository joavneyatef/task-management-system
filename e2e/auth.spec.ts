import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './paths';
import { expectHash, signIn, signOut, USERS } from './helpers';

test.describe('authentication journey', () => {
  test('rejects a wrong password without leaving the login screen', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter name or work email').fill(USERS.gm.username);
    await page.getByPlaceholder('Enter password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByText('Invalid name/email or password.')).toBeVisible();
    await expect(page.getByPlaceholder('Enter password')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('is_logged_in'))).toBeNull();
  });

  test('GM signs in and lands on the command centre', async ({ page }) => {
    await signIn(page, 'gm');
    await expectHash(page, '#dashboard');
    await expect(page.getByRole('button', { name: 'Command Center' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('is_logged_in'))).toBe('true');
  });

  test('an assistant signs in and lands on the operations board', async ({ page }) => {
    await signIn(page, 'assistant');
    await expectHash(page, '#tasks');
    await expect(page.getByRole('button', { name: /Operations Board/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Command Center' })).toHaveCount(0);
  });

  test('a signed-in session survives a reload', async ({ page }) => {
    await signIn(page, 'manager');
    await page.reload();
    await expect(page.getByPlaceholder('Enter name or work email')).toBeHidden();
    await expect(page.getByRole('button', { name: /Operations Board/ })).toBeVisible();
  });

  test('logout clears the session and returns to the login screen', async ({ page }) => {
    await signIn(page, 'gm');
    await signOut(page);
    expect(await page.evaluate(() => localStorage.getItem('is_logged_in'))).toBeNull();

    await page.reload();
    await expect(page.getByPlaceholder('Enter name or work email')).toBeVisible();
  });

  test('login is accepted by email as well as username', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter name or work email').fill('george@hotel.local');
    await page.getByPlaceholder('Enter password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByPlaceholder('Enter name or work email')).toBeHidden();
    await expectHash(page, '#dashboard');
  });
});
