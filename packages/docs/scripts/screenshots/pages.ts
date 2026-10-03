import type { Browser, BrowserContext, Page, Route } from 'playwright-core';

export type Theme = 'light' | 'dark';

export interface Capture {
  name: string;
  hash: string;
  /** Selector that shows the view is complete. */
  ready: string;
  /** Keys to press after load, such as `j` to select the first finding. */
  keys?: string[];
}

export const CAPTURES: Capture[] = [
  { name: 'overview', hash: '#/overview', ready: '.overview svg' },
  { name: 'findings', hash: '#/findings', ready: '.findings .row' },
  { name: 'findings-selected', hash: '#/findings', ready: '.findings .row', keys: ['j'] },
  { name: 'trace', hash: '#/trace/useCart', ready: '.trace .heading' },
  { name: 'unused', hash: '#/unused', ready: '.unused' },
  { name: 'graph', hash: '#/graph/edge/admin/web', ready: '.graph svg g' },
  { name: 'baseline', hash: '#/baseline', ready: '.baseline' },
];

export const WIDTH = 1200;
export const HEIGHT = 720;

/** One fixed analysis time (14:02:31 UTC) and duration, so the header reads the same each run. */
const ANALYZED_AT = Date.UTC(2026, 0, 15, 14, 2, 31);
const DURATION_MS = 48;

/** Animations, transitions and the text caret off, so two runs give the same pixels. */
export const STILL_CSS =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function freeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => freeze(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value).map(([key, item]) => {
    if (key === 'analyzedAt') {
      return [key, ANALYZED_AT];
    }
    return [key, key === 'durationMs' ? DURATION_MS : freeze(item)];
  });
  return Object.fromEntries(entries);
}

async function rewrite(route: Route): Promise<void> {
  try {
    const response = await route.fetch();
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('json')) {
      await route.fulfill({ response });
      return;
    }
    const body = freeze(await response.json());
    await route.fulfill({ response, json: body });
  } catch {
    // The page or its context closed while the request was open; nobody waits for the answer.
  }
}

/** A browser context as DevTools gives the tab: the theme class is set before the first paint. */
export async function themedContext(browser: Browser, theme: Theme): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  await context.addInitScript(dark => {
    document.documentElement.classList.toggle('dark', dark);
  }, theme === 'dark');
  await context.route('**/__layerscope/api/**', rewrite);
  return context;
}

/** Waits for the view (and its lazy chunk) and the fonts, then turns motion off. */
export async function settle(page: Page, ready: string): Promise<void> {
  await page.waitForSelector(ready, { state: 'visible' });
  await page.addStyleTag({ content: STILL_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function captureView(
  context: BrowserContext,
  base: string,
  capture: Capture,
): Promise<Buffer> {
  const page = await context.newPage();
  try {
    await page.goto(`${base}/__layerscope${capture.hash}`);
    await settle(page, capture.ready);
    for (const key of capture.keys ?? []) {
      await page.keyboard.press(key);
    }
    await page.mouse.move(0, 0);
    const image = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    return image;
  } finally {
    await page.close();
  }
}
