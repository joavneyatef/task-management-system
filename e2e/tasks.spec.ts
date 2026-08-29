import { expect, test } from '@playwright/test';
import { expectHash, signIn } from './helpers';

const WIFI_TASK = 'Investigate guest Wi-Fi intermittent drops';
const SWITCH_TASK = 'Replace failed switch power module';
const FIREWALL_TASK = 'Review firewall alert queue';

test.describe('task board journeys', () => {
  test('an assistant sees the work assigned to them', async ({ page }) => {
    await signIn(page, 'assistant'); // ahmed-assistant owns the Wi-Fi task
    await expectHash(page, '#tasks');
    await expect(page.getByText(WIFI_TASK).first()).toBeVisible();
  });

  test('the GM board shows work across the whole department roster', async ({ page }) => {
    await signIn(page, 'gm');
    await page.getByRole('button', { name: /Operations Board/ }).click();
    await expectHash(page, '#tasks');

    // Tasks owned by three different assistants are all visible to the GM.
    await expect(page.getByText(WIFI_TASK).first()).toBeVisible();
    await expect(page.getByText(SWITCH_TASK).first()).toBeVisible();
    await expect(page.getByText(FIREWALL_TASK).first()).toBeVisible();
  });

  test('the board search narrows the overview table', async ({ page }) => {
    await signIn(page, 'gm');
    await page.getByRole('button', { name: /Operations Board/ }).click();
    await expectHash(page, '#tasks');

    const overview = page.getByRole('table').first();
    await expect(overview.getByText(WIFI_TASK)).toBeVisible();

    await page.getByPlaceholder('Search tasks or employees...').fill('firewall alert');
    await expect(overview.getByText(FIREWALL_TASK)).toBeVisible();
    await expect(overview.getByText(WIFI_TASK)).toHaveCount(0);
  });
});
