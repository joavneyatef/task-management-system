import { expect, test } from '@playwright/test';

/**
 * The production build boots, serves the SPA shell, and answers the public
 * directory endpoint from the isolated E2E database.
 */
test('app shell + public API are served', async ({ page, request }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#root')).toBeAttached();
  await expect(page.getByPlaceholder('Enter name or work email')).toBeVisible();

  const users = await request.get('/api/auth/users');
  expect(users.ok()).toBe(true);
  const body = await users.json();
  expect(Array.isArray(body.users)).toBe(true);
  expect(body.users.length).toBeGreaterThan(0);
  // Credentials never cross the wire.
  for (const u of body.users) expect(u.password).toBeUndefined();
});
