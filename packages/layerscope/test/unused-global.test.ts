import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { dirname, join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { Registry } from '#src/registry/schema.ts';
import { findUnused } from '#src/unused/index.ts';

import { prepareFixture, privateFixture } from './private-fixture.ts';

/**
 * A private copy of the fixture with two global components, a util in `shared/`, and a module that
 * has the name of Nuxt Content, so that kit's `hasNuxtModule('@nuxt/content')` is true.
 */
let copy = '';

function write(file: string, content: string): void {
  const path = join(copy, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeAll(() => {
  copy = privateFixture(false);
  write('app/components/global/GlobalOnly.vue', '<template><div /></template>\n');
  write('app/components/SuffixOnly.global.vue', '<template><div /></template>\n');
  write('shared/utils/sharedLabel.ts', 'export const sharedLabel = () => 1;\n');
  write(
    'modules/content-name.ts',
    // A module that only has the name, as `defineNuxtModule()` gives it, with no import of kit.
    "export default Object.assign(() => {}, { getMeta: () => Promise.resolve({ name: '@nuxt/content' }) });\n",
  );
  prepareFixture(copy);
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

function globalNames(result: Awaited<ReturnType<typeof analyze>>): string[] {
  return findUnused(result)
    .filter(symbol => symbol.global)
    .map(symbol => symbol.name)
    .toSorted();
}

describe('unused and global components on a real Nuxt project (#119)', () => {
  it('records global and Nuxt Content in the registry', () => {
    const registry = JSON.parse(
      readFileSync(join(copy, '.nuxt/layerscope/registry.json'), 'utf8'),
    ) as Registry;
    const global = registry.components.filter(c => c.global).map(c => c.name);
    expect(global).toEqual(expect.arrayContaining(['GlobalOnly', 'SuffixOnly']));
    expect(registry.components.find(c => c.name === 'CartBadge')?.global).toBe(false);
    expect(registry.nuxtContent).toBe(true);
  });

  it('marks both global components from the registry and from the .d.ts files', async () => {
    const [registry, types] = await Promise.all([
      analyze({ rootDir: copy, source: 'registry' }),
      analyze({ rootDir: copy, source: 'types' }),
    ]);
    expect(registry.nuxtContent).toBe(true);
    expect(globalNames(registry)).toEqual(['GlobalOnly', 'SuffixOnly']);
    expect(globalNames(types)).toEqual(['GlobalOnly', 'SuffixOnly']);
  }, 120_000);

  it('lists the same symbols from the registry and from the .d.ts files', async () => {
    const [registry, types] = await Promise.all([
      analyze({ rootDir: copy, source: 'registry' }),
      analyze({ rootDir: copy, source: 'types' }),
    ]);
    const unused = findUnused(registry);
    expect(unused.find(symbol => symbol.name === 'sharedLabel')?.context).toBe('shared');
    expect(findUnused(types)).toEqual(unused);
  }, 120_000);
});
