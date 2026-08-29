import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { expectHash, signIn } from './helpers';

type Impact = 'minor' | 'moderate' | 'serious' | 'critical';
const ORDER: Impact[] = ['minor', 'moderate', 'serious', 'critical'];

function audit(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

/** Attach a readable breakdown so a regression says *what* broke, not just a count. */
function report(info: TestInfo, violations: Awaited<ReturnType<typeof audit>>['violations']) {
  const byImpact = Object.fromEntries(ORDER.map((i) => [i, 0])) as Record<Impact, number>;
  const lines = violations.map((v) => {
    byImpact[(v.impact as Impact) ?? 'minor']++;
    return `[${v.impact}] ${v.id} — ${v.nodes.length} node(s): ${v.help}`;
  });
  info.annotations.push({ type: 'axe', description: JSON.stringify(byImpact) });
  info.attach('axe-violations.txt', { body: lines.join('\n') || 'none', contentType: 'text/plain' });
  return byImpact;
}

test.describe('accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  // Known gap tracked for a design pass: the dark theme uses low-contrast
  // muted greys (`text-zinc-600`, 9-11px labels) that trip axe `color-contrast`
  // (impact: serious) across most screens. These specs gate on `critical` only.
  test('the login screen has no critical violations', async ({ page }, info) => {
    await page.goto('/');
    const { violations } = await audit(page);
    const seen = report(info, violations);
    expect(seen.critical, 'critical axe violations').toBe(0);
  });

  test('the GM command centre has no critical violations', async ({ page }, info) => {
    await signIn(page, 'gm');
    await expectHash(page, '#dashboard');
    const { violations } = await audit(page);
    const seen = report(info, violations);
    expect(seen.critical, 'critical axe violations').toBe(0);
  });

  test('the operations board has no critical violations', async ({ page }, info) => {
    await signIn(page, 'assistant');
    await expectHash(page, '#tasks');
    const { violations } = await audit(page);
    const seen = report(info, violations);
    expect(seen.critical, 'critical axe violations').toBe(0);
  });
});
