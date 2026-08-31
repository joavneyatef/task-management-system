import { expect, test } from '@playwright/test';
import { expectHash, signIn } from './helpers';

/**
 * Sidebar visibility, as wired in App.tsx:
 *   Command Center — GM, Director, Manager
 *   Departments & Backups (Admin) — GM only
 *   Audit Log      — GM only
 *   Crew Roster    — GM only
 */
const COMMAND_CENTER = 'Command Center';
const ADMIN = /Departments & Backups/;
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

  test('a manager gets the command centre only — no admin, audit log, or roster', async ({ page }) => {
    await signIn(page, 'manager');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toBeVisible();
    await expect(page.getByRole('button', { name: ADMIN })).toHaveCount(0);
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toHaveCount(0);
    await expect(page.getByRole('button', { name: ROSTER })).toHaveCount(0);
  });

  test('a director gets the command centre only — no admin, audit log, or roster', async ({ page }) => {
    await signIn(page, 'director');

    await expect(page.getByRole('button', { name: COMMAND_CENTER })).toBeVisible();
    await expect(page.getByRole('button', { name: ADMIN })).toHaveCount(0);
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toHaveCount(0);
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

  test('the audit-log API is refused for a director', async ({ page }) => {
    await signIn(page, 'director');
    const res = await page.request.get('/api/audit-log');
    expect(res.status()).toBe(403);
  });

  test('a director deep-linking to #auditlog is bounced to their home tab', async ({ page }) => {
    await signIn(page, 'director');
    await page.evaluate(() => { window.location.hash = 'auditlog'; });
    await page.reload();
    await expectHash(page, '#dashboard');
    await expect(page.getByRole('button', { name: AUDIT_LOG })).toHaveCount(0);
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

  test('a manager inspects the checklist read-only — no add, delete, sign, or file controls', async ({ page }) => {
    await signIn(page, 'manager');
    await page.getByRole('button', { name: 'Inspection Checklists' }).click();
    await expectHash(page, '#checklists');

    await expect(page.getByText(/inspection only/i)).toBeVisible();
    await expect(page.getByText(/inspection view — read-only/i)).toBeVisible();
    await expect(page.getByPlaceholder(/add new daily checklist item/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /file & archive/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
    await expect(page.getByPlaceholder(/optional tech note/i)).toHaveCount(0);
  });
});
