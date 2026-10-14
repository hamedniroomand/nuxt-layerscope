import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { dirname, join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';

import { prepareFixture, privateFixture } from './private-fixture.ts';

/** A private copy of the fixture with an island component that only `<NuxtIsland>` renders. */
let copy = '';

function write(file: string, content: string): void {
  const path = join(copy, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeAll(() => {
  copy = privateFixture(false);
  write('app/components/islands/IslandOnly.vue', '<template><div /></template>\n');
  write(
    'app/pages/island.vue',
    '<template><NuxtIsland name="IslandOnly" /><NuxtIsland name="NotAComponent" /></template>\n',
  );
  prepareFixture(copy);
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

describe('unused and island components (#119)', () => {
  it('counts <NuxtIsland name> as a use of the island component, from the registry', async () => {
    const result = await analyze({ rootDir: copy });
    expect(result.source).toBe('registry');
    expect(result.symbols.components.has('IslandOnly')).toBe(true);
    expect(findUnused(result).map(symbol => symbol.name)).not.toContain('IslandOnly');
  }, 120_000);

  it('reports no unknown island name from the .d.ts files, which do not list islands', async () => {
    const result = await analyze({ rootDir: copy, source: 'types' });
    expect(findUnused(result).map(symbol => symbol.name)).not.toContain('IslandOnly');
    const symbols = result.findings.map(finding => finding.symbol);
    expect(symbols).not.toContain('IslandOnly');
    expect(symbols).not.toContain('NotAComponent');
  }, 120_000);
});
