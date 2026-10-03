/**
 * Fails the docs build when a page uses `<Screenshot name="…">` for a capture that is not in
 * `public/devtools/`, in the light or the dark theme.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCREENSHOT = /<Screenshot\s+name="([^"]+)"/gu;

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
if (missing.length > 0) {
  console.error(`Missing screenshots (run \`vp run docs#screenshots\`):\n${missing.join('\n')}`);
  process.exit(1);
}
