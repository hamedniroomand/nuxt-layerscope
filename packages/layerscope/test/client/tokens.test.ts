import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

const CLIENT = fileURLToPath(new URL('../../src/devtools/client/', import.meta.url));
const TOKENS = readFileSync(join(CLIENT, 'tokens.css'), 'utf8');

/** The hex tokens declared in one CSS block, such as `:root` or `html.dark`. */
function tokens(selector: string): Record<string, string> {
  const start = TOKENS.indexOf(`${selector} {`);
  const body = TOKENS.slice(start, TOKENS.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/giu)].map(m => [m[1], m[2]]),
  );
}

/** WCAG 2 relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colors, from 1 to 21. */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const light = tokens(':root');
const themes = { light, dark: { ...light, ...tokens('html.dark') } };
const TEXT = ['fg', 'fg-muted', 'accent', 'error', 'warn', 'ok'];
const BACKGROUNDS = ['bg', 'bg-raised'];

describe('token contrast', () => {
  for (const [theme, values] of Object.entries(themes)) {
    it(`reaches 4.5:1 for every text color on every background, ${theme}`, () => {
      const pairs = TEXT.flatMap(text =>
        BACKGROUNDS.map(background => ({
          pair: `${text} on ${background}`,
          ratio: Math.round(contrast(values[text] ?? '', values[background] ?? '') * 100) / 100,
        })),
      );
      expect(pairs.filter(pair => pair.ratio < 4.5)).toEqual([]);
    });
  }
});

/** Every client source except tokens.css. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.(?:vue|ts|css)$/u.test(name) && name !== 'tokens.css' ? [path] : [];
  });
}

describe('color literals', () => {
  it('keeps every color value in tokens.css', () => {
    // CSS system colors (CanvasText, Highlight) and `transparent` are allowed elsewhere.
    const literal = /#[\da-f]{3}(?:[\da-f]{3})?\b(?![\w/-])|\b(?:rgba?|hsla?)\(/iu;
    const offenders = sources(CLIENT).flatMap(file =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => literal.test(line) && !line.includes("'#") && !line.includes('"#'))
        .map(line => `${file.slice(CLIENT.length)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
