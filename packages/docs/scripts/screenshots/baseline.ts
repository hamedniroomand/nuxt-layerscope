import type { Browser } from 'playwright-core';

import { settle, themedContext } from './pages.ts';

/** Accepts the warnings through the tab, as a user does, so the Baseline view has entries. */
export async function acceptWarnings(browser: Browser, base: string): Promise<void> {
  const context = await themedContext(browser, 'light');
  try {
    const page = await context.newPage();
    await page.goto(`${base}/__layerscope#/findings?sev=warn`);
    await settle(page, '.findings .row');
    await page.getByRole('button', { name: /^Ignore all \d+$/u }).click();
    const written = page.waitForResponse(response => response.url().endsWith('/baseline/ignore'));
    await page.locator('.confirm .primary').click();
    const response = await written;
    if (!response.ok()) {
      throw new Error(`The tab could not write the baseline: ${response.status()}.`);
    }
  } finally {
    await context.close();
  }
}
