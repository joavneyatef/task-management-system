import { expect, test } from '@playwright/test';
import { expectHash, signIn } from './helpers';

test.describe('workspace navigation (GM)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'gm');
    await expectHash(page, '#dashboard');
  });

  test('the sidebar moves between sections and writes the URL hash', async ({ page }) => {
    await page.getByRole('button', { name: /Operations Board/ }).click();
    await expectHash(page, '#tasks');

    await page.getByRole('button', { name: 'Inspection Checklists' }).click();
    await expectHash(page, '#checklists');

    await page.getByRole('button', { name: 'Crew Roster & Leaves' }).click();
    await expectHash(page, '#roster');

    await page.getByRole('button', { name: 'Command Center' }).click();
    await expectHash(page, '#dashboard');
  });

  test('a deep link into an allowed tab survives a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Inspection Checklists' }).click();
    await expectHash(page, '#checklists');

    await page.reload();
    await expectHash(page, '#checklists');
    await expect(page.getByRole('button', { name: 'Inspection Checklists' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter name or work email')).toBeHidden();
  });
});
