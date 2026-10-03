import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { join } from 'pathe';
import { build } from 'vite-plus';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

const KB = 1024;

/** Gzipped budgets in KB: [file pattern, budget, hard fail]. */
const BUDGETS: [RegExp, number, number][] = [
  [/^client\.(?:js|css)$/u, 55, 65],
  [/^graph-[\w-]+\.js$/u, 25, 30],
];
const TOTAL: [number, number] = [80, 95];

const CONFIG = fileURLToPath(new URL('../vite.client.config.ts', import.meta.url));

let sizes = new Map<string, number>();

beforeAll(async () => {
  // Builds from the real config, so the test measures what `build` ships.
  const outDir = mkdtempSync(join(tmpdir(), 'layerscope-client-'));
  await build({ configFile: CONFIG, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  sizes = new Map(
    readdirSync(outDir).map(name => [name, gzipSync(readFileSync(join(outDir, name))).length]),
  );
}, 120_000);

function sum(pattern: RegExp): number {
  return [...sizes].reduce((total, [name, size]) => total + (pattern.test(name) ? size : 0), 0);
}

describe('client bundle size', () => {
  it('builds the core client and one graph chunk', () => {
    expect([...sizes.keys()]).toEqual(expect.arrayContaining(['client.js', 'client.css']));
    expect([...sizes.keys()].filter(name => name.startsWith('graph-'))).toHaveLength(1);
  });

  it.each(BUDGETS)('keeps %s within budget', (pattern, budget, hard) => {
    const size = sum(pattern) / KB;
    expect(size, `${size.toFixed(1)} KB gzipped, budget ${budget} KB`).toBeLessThanOrEqual(hard);
    expect(size).toBeLessThanOrEqual(budget);
  });

  it('keeps the total within budget', () => {
    const size = sum(/./u) / KB;
    expect(size).toBeLessThanOrEqual(TOTAL[1]);
    expect(size).toBeLessThanOrEqual(TOTAL[0]);
  });
});
