import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { expectHash, signIn } from './helpers';

const distAssets = fileURLToPath(new URL('../dist/assets', import.meta.url));

/** Gzipped byte total of every dist/assets file matching `re`. */
function gzippedKB(re: RegExp): number {
  const total = readdirSync(distAssets)
    .filter((f) => re.test(f))
    .reduce((n, f) => n + gzipSync(readFileSync(`${distAssets}/${f}`)).length, 0);
  return total / 1024;
}

test.describe('performance budgets', () => {
  test('shipped JS and CSS stay within budget', () => {
    const js = gzippedKB(/\.js$/);
    const css = gzippedKB(/\.css$/);
    // Current build: ~138 KB JS / ~14 KB CSS gzipped. Headroom, but a tripwire
    // against an accidental heavyweight dependency.
    expect(js, `gzipped JS = ${js.toFixed(1)} KB`).toBeLessThan(200);
    expect(css, `gzipped CSS = ${css.toFixed(1)} KB`).toBeLessThan(25);
  });

  test('GET /api/state answers within budget for a signed-in user', async ({ page }) => {
    await signIn(page, 'gm');
    await expectHash(page, '#dashboard');

    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      const res = await page.request.get('/api/state');
      expect(res.ok()).toBe(true);
      samples.push(Date.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    expect(median, `median /api/state = ${median} ms (samples ${samples.join(',')})`).toBeLessThan(750);
  });

  test('the dashboard is interactive quickly after sign-in', async ({ page }) => {
    await signIn(page, 'gm');
    await expectHash(page, '#dashboard');
    const nav = await page.evaluate(() => {
      const [e] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      return e ? e.domContentLoadedEventEnd - e.startTime : null;
    });
    if (nav !== null) {
      expect(nav, `DOMContentLoaded = ${Math.round(nav)} ms`).toBeLessThan(5000);
    }
  });
});
