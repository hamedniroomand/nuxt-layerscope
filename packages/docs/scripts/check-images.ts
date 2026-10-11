/**
 * Fails the docs build when a capture that the site uses is not in `public/devtools/`. It checks
 * `<Screenshot name="…">` in the pages and the tour views (light and dark), and each literal
 * `/devtools/…` path in the theme components.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCREENSHOT = /<Screenshot\s+name="([^"]+)"/gu;
const THEME = `${ROOT}.vitepress/theme/components/`;
const TOUR_VIEW = /name: '([^']+)'/gu;
const LITERAL = /\/devtools\/([\w-]+\.(?:png|webp))/gu;

const pages = readdirSync(ROOT, { recursive: true, encoding: 'utf8' }).filter(
  file => file.endsWith('.md') && !file.includes('node_modules'),
);
const missing = pages.flatMap(page =>
  [...readFileSync(`${ROOT}${page}`, 'utf8').matchAll(SCREENSHOT)].flatMap(([, name]) =>
    ['light', 'dark']
      .map(theme => `public/devtools/${name}-${theme}.png`)
      .filter(image => !existsSync(`${ROOT}${image}`))
      .map(image => `${page}: ${image}`),
  ),
);
const themed = (source: string, name: string): string[] =>
  ['light', 'dark']
    .map(theme => `public/devtools/${name}-${theme}.png`)
    .filter(image => !existsSync(`${ROOT}${image}`))
    .map(image => `${source}: ${image}`);
missing.push(
  ...[...readFileSync(`${THEME}DevToolsTour.vue`, 'utf8').matchAll(TOUR_VIEW)].flatMap(([, name]) =>
    themed('DevToolsTour.vue', name),
  ),
);
for (const file of readdirSync(THEME).filter(name => name.endsWith('.vue'))) {
  for (const [, image] of readFileSync(`${THEME}${file}`, 'utf8').matchAll(LITERAL)) {
    if (!existsSync(`${ROOT}public/devtools/${image}`)) {
      missing.push(`${file}: public/devtools/${image}`);
    }
  }
}
if (missing.length > 0) {
  console.error(`Missing screenshots (run \`vp run docs#screenshots\`):\n${missing.join('\n')}`);
  process.exit(1);
}
