import { expect, test } from '@playwright/test';
import { expectHash, signIn } from './helpers';

/**
 * Sidebar visibility, as wired in App.tsx (after the Phase 9 `hasManagerAccess`
 * fix — it now means "Manager-level access or above"):
 *   Command Center — GM, Director, Manager
 *   Control Crew & PINs (Admin) — GM, Director, Manager
 *   Audit Log      — GM, Director, Manager
 *   Crew Roster    — GM only
 */
const COMMAND_CENTER = 'Command Center';
const ADMIN = /Control Crew & PINs/;
const ROSTER = 'Crew Roster & Leaves';
const AUDIT_LOG = /^Audit Log/;

test.describe('role-gated navigation', () => {
  test('an assistant sees only the board — no command centre, roster, admin, or audit log', async ({ page }) => {
    await signIn(page, 'assistant');
    await expectHash(page, '#tasks');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toHaveCount(0);
    await expect(page.getByRole('button', { name: ROSTER })).toHaveCount(0);
    await expect(page.getByRole('button', { name: ADMIN })).toHaveCount(0);
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Operations Board/ })).toBeVisible();
  });

  test('a manager gets command centre, admin, and audit log — but not the roster', async ({ page }) => {
    await signIn(page, 'manager');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toBeVisible();
    await expect(page.getByRole('button', { name: ADMIN })).toBeVisible();
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toBeVisible();
    await expect(page.getByRole('button', { name: ROSTER })).toHaveCount(0);
  });

  test('a director gets command centre, admin, and audit log — but not the roster', async ({ page }) => {
    await signIn(page, 'director');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toBeVisible();
    await expect(page.getByRole('button', { name: ADMIN })).toBeVisible();
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toBeVisible();
    await expect(page.getByRole('button', { name: ROSTER })).toHaveCount(0);
  });

  test('the GM gets every section, roster included', async ({ page }) => {
    await signIn(page, 'gm');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toBeVisible();
    await expect(page.getByRole('button', { name: ADMIN })).toBeVisible();
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toBeVisible();
    await expect(page.getByRole('button', { name: ROSTER })).toBeVisible();
  });

  test('a direct request for a GM-only API is refused for an assistant', async ({ page }) => {
    await signIn(page, 'assistant');
    const res = await page.request.get('/api/reports/performance');
    expect(res.status()).toBe(403);
  });

  test('an assistant reloading on a forbidden tab is dropped on their home tab', async ({ page }) => {
    await signIn(page, 'assistant');
    await page.evaluate(() => { window.location.hash = 'roster'; });
    await page.reload();
    await expectHash(page, '#tasks');
    await expect(page.getByRole('button', { name: ROSTER })).toHaveCount(0);
  });

  test('the GM keeps a deep link into the admin panel across a reload', async ({ page }) => {
    await signIn(page, 'gm');
    await page.evaluate(() => { window.location.hash = 'admin'; });
    await page.reload();
    await expectHash(page, '#admin');
    await expect(page.getByRole('button', { name: ADMIN })).toBeVisible();
  });
});
