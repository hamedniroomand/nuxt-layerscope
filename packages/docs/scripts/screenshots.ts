/**
 * Captures the DevTools tab for the docs and the READMEs: every view in light and dark, the README
 * hero, and the social card. Run with `vp run docs#screenshots` after `vp run nuxt-layerscope#build`.
 * See `scripts/README.md`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Browser } from 'playwright-core';
import { chromium } from 'playwright-core';

import { captureHero, captureOg } from './screenshots/hero.ts';
import { compressPng, isBlank, MAX_PNG_BYTES, toWebp } from './screenshots/image.ts';
import type { Theme } from './screenshots/pages.ts';
import { CAPTURES, captureView, themedContext } from './screenshots/pages.ts';
import { startFixture } from './screenshots/server.ts';

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const PACKAGE = path('../../layerscope/');
const FIXTURE = path('../../layerscope/test/fixtures/nuxt4/');
const OUT = path('../public/devtools/');
const THEMES: Theme[] = ['light', 'dark'];
const HERO_WIDTH = 1600;
/** Software rendering, sRGB and no font hinting: two runs give the same pixels. */
const STABLE_ARGS = ['--disable-gpu', '--force-color-profile=srgb', '--font-render-hinting=none'];
const sizes: Record<string, number> = {};

async function save(name: string, image: Buffer): Promise<void> {
  if (await isBlank(image)) {
    throw new Error(`${name} is blank.`);
  }
  if (name.endsWith('.png') && image.length > MAX_PNG_BYTES) {
    throw new Error(`${name} is ${Math.round(image.length / 1024)} KB, over the 300 KB limit.`);
  }
  const file = name === 'og-image.png' ? path('../public/og-image.png') : `${OUT}${name}`;
  writeFileSync(file, image);
  sizes[name] = image.length;
  console.log(`${name}  ${Math.round(image.length / 1024)} KB`);
}

async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH;
  try {
    const browser = await chromium.launch(
      executablePath === undefined
        ? { channel: 'chrome', args: STABLE_ARGS }
        : { executablePath, args: STABLE_ARGS },
    );
    return browser;
  } catch {
    console.error('Cannot start Chrome. Install Chrome, or set CHROME_PATH to a Chrome binary.');
    process.exit(1);
  }
}

async function captureAll(browser: Browser, base: string): Promise<void> {
  for (const theme of THEMES) {
    const context = await themedContext(browser, theme);
    for (const capture of CAPTURES) {
      await save(
        `${capture.name}-${theme}.png`,
        await compressPng(await captureView(context, base, capture)),
      );
    }
    await context.close();
    await save(
      `hero-${theme}.webp`,
      await toWebp(await captureHero(browser, base, theme), HERO_WIDTH),
    );
  }
  await save('og-image.png', await compressPng(await captureOg(browser, path('og-image.html'))));
}

function writeManifest(): void {
  const { version } = JSON.parse(readFileSync(`${PACKAGE}package.json`, 'utf8')) as {
    version: string;
  };
  const fixtureCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', FIXTURE], {
    encoding: 'utf8',
  }).trim();
  const manifest = { version, fixtureCommit, images: sizes };
  writeFileSync(`${OUT}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main(): Promise<void> {
  if (!existsSync(`${PACKAGE}dist/devtools/client.js`)) {
    console.error('The tab is not built. Run `vp run nuxt-layerscope#build` first.');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const fixture = await startFixture(FIXTURE);
  try {
    await captureAll(browser, fixture.base);
    writeManifest();
  } finally {
    fixture.stop();
    await browser.close();
  }
}

await main();
