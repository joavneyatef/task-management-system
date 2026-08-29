import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './paths';

/** The seeded cast (data-seed.json), keyed by the username you log in with. */
export const USERS = {
  gm: { username: 'hany', name: 'Mr. Hany', role: 'GM' },
  director: { username: 'george', name: 'George', role: 'Director' },
  manager: { username: 'maittar', name: 'Maittar', role: 'Manager' },
  assistant: { username: 'ahmed', name: 'Ahmed', role: 'Assistant' },
} as const;

const IDENTIFIER_PLACEHOLDER = 'Enter name or work email';

/** Fill and submit the login form, then wait for the app shell to take over. */
export async function signIn(
  page: Page,
  who: keyof typeof USERS,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder(IDENTIFIER_PLACEHOLDER).fill(USERS[who].username);
  await page.getByPlaceholder('Enter password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  // The login form is gone once authentication succeeds.
  await expect(page.getByPlaceholder(IDENTIFIER_PLACEHOLDER)).toBeHidden();
}

/** True once the SPA has written the active tab into the URL hash. */
export async function expectHash(page: Page, hash: `#${string}`): Promise<void> {
  await page.waitForFunction((h) => window.location.hash === h, hash, { timeout: 10_000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log Out (Secure)' }).first().click();
  await expect(page.getByPlaceholder(IDENTIFIER_PLACEHOLDER)).toBeVisible();
}
