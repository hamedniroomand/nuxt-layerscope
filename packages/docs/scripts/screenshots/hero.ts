import type { Browser } from 'playwright-core';

import type { Theme } from './pages.ts';
import { settle, STILL_CSS, themedContext, WIDTH } from './pages.ts';

const BAR = 36;
/** Shorter than the view captures: the playground graph needs no more room. */
const HEIGHT = 420;
/** A path on the dev server origin, so the tab inside the frame can read the theme class. */
const FRAME_PATH = '/__layerscope-hero';

/** A thin frame like the DevTools panel: a 1 px border and a top bar with the tab name. */
function frameHtml(theme: Theme, hash: string): string {
  const [bg, bar, line, fg] =
    theme === 'dark'
      ? ['#151718', '#1d2022', '#2b2f33', '#e6e7e8']
      : ['#fbfbfa', '#f2f2f0', '#e2e3e1', '#1c1e21'];
  return `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><head><style>
*{box-sizing:border-box;margin:0}
body{background:${bg};font:600 13px/1 system-ui,-apple-system,sans-serif;color:${fg}}
.panel{width:${WIDTH}px;height:${HEIGHT + BAR + 2}px;border:1px solid ${line};display:flex;flex-direction:column}
.bar{height:${BAR}px;display:flex;align-items:center;gap:8px;padding:0 12px;background:${bar};border-bottom:1px solid ${line}}
.dot{width:8px;height:8px;border-radius:50%;background:#0f766e}
iframe{flex:1;border:0;width:100%}
</style></head><body><div class="panel"><div class="bar"><span class="dot"></span>Layerscope</div>
<iframe src="/__layerscope${hash}"></iframe></div></body></html>`;
}

/** The README hero: the Graph view inside the DevTools-like frame. */
export async function captureHero(browser: Browser, base: string, theme: Theme): Promise<Buffer> {
  const context = await themedContext(browser, theme);
  await context.route(`**${FRAME_PATH}`, async route => {
    await route.fulfill({
      contentType: 'text/html',
      body: frameHtml(theme, '#/graph/edge/ui/shop'),
    });
  });
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: WIDTH, height: HEIGHT + BAR + 2 });
    await page.goto(`${base}${FRAME_PATH}`);
    const frame = page.frames().find(item => item !== page.mainFrame());
    if (frame === undefined) {
      throw new Error('The hero frame did not load.');
    }
    await frame.waitForSelector('.graph svg g', { state: 'visible' });
    await frame.addStyleTag({ content: STILL_CSS });
    await settle(page, '.panel');
    await page.mouse.move(0, 0);
    const image = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    return image;
  } finally {
    await context.close();
  }
}

/** The social card: `og-image.html` with the Overview capture in it, at 1200 x 630. */
export async function captureOg(browser: Browser, htmlFile: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  try {
    await page.goto(`file://${htmlFile}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const image = await page.screenshot();
    return image;
  } finally {
    await page.close();
  }
}
